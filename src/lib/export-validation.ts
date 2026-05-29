import {
  countOccurrences,
  extractKeywords,
  isGenericKeyword,
  normalizeKeywordPhrase,
  normalizeText,
} from "@/lib/analysis-utils";
import { renderExportPreviewPlainText } from "@/lib/export-model";
import {
  getActiveDraftItemText,
  isDraftItemIncludedInCopy,
} from "@/lib/draft-validation";
import type {
  ExportPreview,
  ExportValidationIssue,
  ExportValidationResult,
  JobRequirement,
  TailoredDraftResult,
} from "@/lib/types";

const HIDDEN_TEXT_PATTERN = /[\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/;

export function validateExportPreview(
  result: TailoredDraftResult,
  preview: ExportPreview,
  options: { acknowledgedBlockedDraft?: boolean } = {},
): ExportValidationResult {
  const issues: ExportValidationIssue[] = [];
  const itemMap = new Map(
    result.draft.sections.flatMap((section) =>
      section.items.map((item) => [item.id, item] as const),
    ),
  );
  const requirementMap = new Map(
    result.analysis.job.requirements.map((requirement) => [requirement.id, requirement]),
  );
  const previewItemIds = new Set(
    preview.sections.flatMap((section) => section.items.map((item) => item.itemId)),
  );
  const renderedPlainText = renderExportPreviewPlainText(preview.sections);

  if (!preview.plainText.trim()) {
    issues.push(
      buildExportIssue(
        "empty_export",
        "critical",
        "The export preview is empty, so there is nothing safe to export yet.",
        "Generate a tailored draft with at least one copy-ready item before exporting.",
      ),
    );
  }

  if (preview.includedItemCount <= 0) {
    issues.push(
      buildExportIssue(
        "empty_export",
        "critical",
        "No copy-ready draft items are currently included in export output.",
        "Resolve blocked or review-only items before exporting.",
      ),
    );
  }

  if (renderedPlainText !== preview.plainText.trim()) {
    issues.push(
      buildExportIssue(
        "preview_mismatch",
        "critical",
        "The export preview text no longer matches the export sections.",
        "Regenerate the tailored draft so the preview, copy output, and export content are in sync.",
      ),
    );
  }

  if (preview.requiresBlockedAcknowledgement && !options.acknowledgedBlockedDraft) {
    issues.push(
      buildExportIssue(
        "blocked_ack_required",
        "critical",
        "This draft still has blocked requirements. Acknowledge the warning before downloading files or printing.",
        "Review the blocked requirements, then explicitly acknowledge the warning if you still want to export the safe included content.",
      ),
    );
  }

  if (HIDDEN_TEXT_PATTERN.test(preview.plainText)) {
    issues.push(
      buildExportIssue(
        "hidden_content",
        "critical",
        "The export preview contains hidden or control characters that should not be exported.",
        "Regenerate the draft or remove invisible characters before exporting.",
      ),
    );
  }

  for (const section of preview.sections) {
    for (const item of section.items) {
      const sourceItem = itemMap.get(item.itemId);

      if (!sourceItem) {
        issues.push(
          buildExportIssue(
            "preview_mismatch",
            "critical",
            `Export preview item "${item.itemId}" no longer exists in the tailored draft.`,
            "Regenerate the tailored draft before exporting.",
            item.itemId,
          ),
        );
        continue;
      }

      if (!isDraftItemIncludedInCopy(sourceItem)) {
        issues.push(
          buildExportIssue(
            "excluded_item_included",
            "critical",
            `An excluded draft item is still present in the export preview.`,
            "Remove excluded items from the export preview before downloading.",
            item.itemId,
          ),
        );
      }

      if (getActiveDraftItemText(sourceItem) !== item.text) {
        issues.push(
          buildExportIssue(
            "preview_mismatch",
            "critical",
            "An export preview item does not match the currently active draft wording.",
            "Regenerate the export preview from the latest deterministic or validated polished text.",
            item.itemId,
          ),
        );
      }

      const criticalIssue = [
        ...sourceItem.warnings,
        ...result.validation.issues.filter((issue) => issue.itemId === sourceItem.id),
      ].find((issue) => issue.severity === "critical");

      if (criticalIssue) {
        issues.push(
          buildExportIssue(
            "critical_item_included",
            "critical",
            `An included export item still carries critical validation issue "${criticalIssue.category}".`,
            "Resolve the validation issue before exporting this content.",
            item.itemId,
          ),
        );
      }

      const unsupportedRequirement = sourceItem.requirementIds
        .map((requirementId) => requirementMap.get(requirementId))
        .filter((requirement): requirement is JobRequirement => Boolean(requirement))
        .find((requirement) => requirement.evidenceStatus !== "supported");

      if (unsupportedRequirement) {
        issues.push(
          buildExportIssue(
            "critical_item_included",
            "critical",
            "An export item still points to a requirement that is not fully supported.",
            "Remove the item from export until the linked requirement is supported.",
            item.itemId,
          ),
        );
      }

      if (HIDDEN_TEXT_PATTERN.test(item.text)) {
        issues.push(
          buildExportIssue(
            "hidden_content",
            "critical",
            "An export item contains hidden or control characters.",
            "Keep exported wording plain and text-readable.",
            item.itemId,
          ),
        );
      }
    }
  }

  for (const section of result.draft.sections) {
    for (const item of section.items) {
      const shouldBeIncluded = isDraftItemIncludedInCopy(item);

      if (shouldBeIncluded && !previewItemIds.has(item.id)) {
        issues.push(
          buildExportIssue(
            "preview_mismatch",
            "critical",
            `Copy-ready draft item "${item.id}" is missing from the export preview.`,
            "Regenerate the export preview before exporting.",
            item.id,
          ),
        );
      }

      if (!shouldBeIncluded && previewItemIds.has(item.id)) {
        issues.push(
          buildExportIssue(
            "excluded_item_included",
            "critical",
            `Excluded item "${item.id}" is still present in the export preview.`,
            "Keep dropped, review-only, and user-confirmed-only items out of default export output.",
            item.id,
          ),
        );
      }
    }
  }

  if (hasSuspiciousKeywordStuffing(preview)) {
    issues.push(
      buildExportIssue(
        "keyword_stuffing",
        "warning",
        "The export preview looks repetitive and may read like keyword stuffing.",
        "Keep the export concise and grounded in the strongest included evidence only.",
      ),
    );
  }

  return {
    canExport: !issues.some((issue) => issue.severity === "critical"),
    requiresBlockedAcknowledgement: preview.requiresBlockedAcknowledgement,
    issues,
  };
}

function hasSuspiciousKeywordStuffing(preview: ExportPreview) {
  const keywords = extractKeywords(preview.plainText, 24)
    .map(normalizeKeywordPhrase)
    .filter((term) => term && !isGenericKeyword(term));
  const normalizedPreview = normalizeText(preview.plainText).toLowerCase();

  return keywords.some((term) => {
    const occurrences = countOccurrences(normalizedPreview, term);
    return occurrences >= Math.max(6, preview.includedItemCount + 3);
  });
}

function buildExportIssue(
  category: ExportValidationIssue["category"],
  severity: ExportValidationIssue["severity"],
  message: string,
  recommendation: string,
  itemId?: string,
): ExportValidationIssue {
  const normalizedMessage = normalizeText(message)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .slice(0, 36);

  return {
    id: `export_issue_${category}_${itemId ?? "general"}_${normalizedMessage}`,
    itemId,
    severity,
    category,
    message,
    recommendation,
  };
}
