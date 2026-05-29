import { uniqueStrings } from "@/lib/analysis-utils";
import {
  buildCopyText,
  getActiveDraftItemText,
  isDraftItemIncludedInCopy,
} from "@/lib/draft-validation";
import type {
  ExportPolishedItem,
  ExportPreview,
  ExportPreviewSection,
  ExportTextSource,
  TailoredDraftResult,
} from "@/lib/types";

const DEFAULT_EXPORT_FILE_NAME_STEM = "smartcv-tailored-cv";
const MAX_EXPORT_FILE_NAME_STEM_LENGTH = 64;

export function buildExportPreview(result: TailoredDraftResult): ExportPreview {
  const sections = buildExportPreviewSections(result);
  const includedItemCount = sections.reduce(
    (total, section) => total + section.items.length,
    0,
  );
  const excludedItemCount =
    result.draft.sections.reduce((total, section) => total + section.items.length, 0) -
    includedItemCount;
  const polishedItemCount = sections.reduce(
    (total, section) =>
      total +
      section.items.filter((item) => item.textSource === "polished_validated").length,
    0,
  );
  const warnings: string[] = [];

  if (excludedItemCount > 0) {
    warnings.push(
      "Review notes, needs-review items, dropped items, and user-confirmed-only items stay out of the default export.",
    );
  }

  if (polishedItemCount > 0) {
    warnings.push(
      "Validated polish is used where available. Deterministic wording remains the source of truth.",
    );
  }

  if (result.validation.blockedRequirementIds.length > 0) {
    warnings.push(
      "Blocked requirements remain warnings only and are not exported as CV claims.",
    );
  }

  if (result.validation.missingHighImportanceRequirementIds.length > 0) {
    warnings.push(
      "Missing high-importance requirements remain warnings only and are not added to export claims.",
    );
  }

  return {
    fileNameStem: buildExportFileNameStem(result.analysis.job.title),
    sections,
    plainText: buildCopyText(result.draft.sections),
    includedItemCount,
    excludedItemCount,
    polishedItemCount,
    blockedRequirementCount: result.validation.blockedRequirementIds.length,
    missingHighImportanceCount:
      result.validation.missingHighImportanceRequirementIds.length,
    requiresBlockedAcknowledgement:
      result.draft.status === "blocked" ||
      result.validation.blockedRequirementIds.length > 0,
    warnings: uniqueStrings(warnings),
  };
}

export function buildExportPreviewSections(
  result: TailoredDraftResult,
): ExportPreviewSection[] {
  return result.draft.sections.flatMap((section) => {
    if (section.id === "review_notes") {
      return [];
    }

    const items = section.items
      .filter((item) => isDraftItemIncludedInCopy(item))
      .map((item) => ({
        itemId: item.id,
        sectionId: section.id,
        sectionTitle: section.title,
        text: getActiveDraftItemText(item),
        textSource: getExportTextSource(item),
        sourceLabel: item.sourceLabel,
        evidenceIds: [...item.evidenceIds],
        requirementIds: [...item.requirementIds],
      }));

    if (!items.length) {
      return [];
    }

    return [
      {
        id: section.id,
        title: section.title,
        items,
      },
    ];
  });
}

export function renderExportPreviewPlainText(sections: ExportPreviewSection[]) {
  const lines: string[] = [];
  const headerSection = sections.find((section) => section.id === "header");

  if (headerSection) {
    for (const item of headerSection.items) {
      lines.push(item.text);
    }

    if (headerSection.items.length) {
      lines.push("");
    }
  }

  for (const section of sections) {
    if (section.id === "header") {
      continue;
    }

    if (!section.items.length) {
      continue;
    }

    lines.push(section.title);

    for (const item of section.items) {
      lines.push(`- ${item.text}`);
    }

    lines.push("");
  }

  return lines.join("\n").trim();
}

export function collectValidatedExportPolishedItems(
  result: TailoredDraftResult,
): ExportPolishedItem[] {
  return result.draft.sections
    .flatMap((section) => section.items)
    .filter(
      (item) =>
        isDraftItemIncludedInCopy(item) &&
        item.polish?.state === "validated" &&
        typeof item.polish.polishedText === "string" &&
        item.polish.polishedText.trim().length > 0,
    )
    .map((item) => ({
      itemId: item.id,
      polishedText: item.polish?.polishedText?.trim() ?? item.text,
      model: item.polish?.model,
    }));
}

export function buildExportPreviewSignature(preview: ExportPreview) {
  const raw = [
    "phase5.v1",
    preview.fileNameStem,
    preview.plainText,
    String(preview.includedItemCount),
    String(preview.polishedItemCount),
    String(preview.blockedRequirementCount),
  ].join("||");

  let hash = 0;

  for (let index = 0; index < raw.length; index += 1) {
    hash = (hash * 31 + raw.charCodeAt(index)) % 2147483647;
  }

  return `phase5.v1:${hash}:${preview.includedItemCount}`;
}

export function buildExportFileNameStem(jobTitle?: string) {
  const normalized = (jobTitle ?? "")
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  if (!normalized) {
    return DEFAULT_EXPORT_FILE_NAME_STEM;
  }

  const trimmed = normalized.slice(0, MAX_EXPORT_FILE_NAME_STEM_LENGTH).replace(/-+$/g, "");

  return `smartcv-${trimmed || "tailored-cv"}-cv`;
}

function getExportTextSource(
  item: TailoredDraftResult["draft"]["sections"][number]["items"][number],
): ExportTextSource {
  return item.polish?.state === "validated" && item.polish.polishedText
    ? "polished_validated"
    : "deterministic";
}
