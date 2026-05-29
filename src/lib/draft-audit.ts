import {
  extractKeywords,
  isGenericKeyword,
  normalizeKeywordPhrase,
  uniqueStrings,
} from "@/lib/analysis-utils";
import {
  getActiveDraftItemText,
  getDraftItemCopyExclusionReason,
  isDraftItemIncludedInCopy,
} from "@/lib/draft-validation";
import type {
  CandidateFact,
  DraftActiveTextSource,
  DraftCopyStatus,
  DraftExclusionReason,
  DraftValidationIssue,
  EvidenceSource,
  EvidenceStatus,
  JobRequirement,
  RequirementCategory,
  TailoredDraftItem,
  TailoredDraftResult,
} from "@/lib/types";

type AuditEvidenceSource = EvidenceSource | "passthrough";

export interface DraftTermComparison {
  preservedTerms: string[];
  addedTerms: string[];
  removedTerms: string[];
}

export interface DraftItemAudit {
  itemId: string;
  beforeSnippets: {
    evidenceId?: string;
    source: AuditEvidenceSource;
    section: string;
    text: string;
    confidence?: number;
  }[];
  requirementSnippets: {
    requirementId: string;
    fingerprint: string;
    category: RequirementCategory;
    importance: 1 | 2 | 3 | 4 | 5;
    text: string;
    evidenceStatus: EvidenceStatus;
  }[];
  deterministicText: string;
  polishedText?: string;
  activeText: string;
  activeTextSource: DraftActiveTextSource;
  includedInCopy: boolean;
  copyStatus: DraftCopyStatus;
  exclusionReason?: DraftExclusionReason;
  preservedTerms: string[];
  addedTerms: string[];
  removedTerms: string[];
  validationIssueIds: string[];
  validationIssues: DraftValidationIssue[];
}

export interface DraftAuditSummary {
  totalItems: number;
  includedInCopyCount: number;
  excludedCount: number;
  cvOnlyCount: number;
  userConfirmedOnlyCount: number;
  mixedCount: number;
  polishedValidatedCount: number;
  polishRejectedCount: number;
  polishFailedCount: number;
  validationCriticalCount: number;
  validationWarningCount: number;
  missingHighImportanceCount: number;
  blockedRequirementCount: number;
}

export interface DraftValidationGroup {
  id:
    | "critical_blockers"
    | "missing_high_importance"
    | "dropped_items"
    | "copy_exclusions"
    | "user_confirmed_only_exclusions"
    | "polish_rejected"
    | "polish_failed"
    | "other_warnings";
  title: string;
  tone: "critical" | "warning" | "info";
  count: number;
  items: {
    id: string;
    label: string;
    detail: string;
  }[];
}

export interface DraftAuditResult {
  items: DraftItemAudit[];
  itemMap: Record<string, DraftItemAudit>;
  summary: DraftAuditSummary;
  validationGroups: DraftValidationGroup[];
}

export function buildDraftAudit(result: TailoredDraftResult): DraftAuditResult {
  const factMap = new Map(result.analysis.cv.facts.map((fact) => [fact.id, fact]));
  const requirementMap = new Map(
    result.analysis.job.requirements.map((requirement) => [requirement.id, requirement]),
  );

  const items = result.draft.sections.flatMap((section) =>
    section.items.map((item) =>
      buildDraftItemAudit(
        item,
        section.id,
        factMap,
        requirementMap,
        result.validation.issues,
      ),
    ),
  );
  const itemMap = Object.fromEntries(items.map((item) => [item.itemId, item]));
  const summary = buildDraftAuditSummary(result, items);
  const validationGroups = buildDraftValidationGroups(result, items, requirementMap);

  return {
    items,
    itemMap,
    summary,
    validationGroups,
  };
}

export function buildTextTermComparison(
  sourceText: string,
  targetText: string,
): DraftTermComparison {
  const sourceTerms = extractMeaningfulTerms(sourceText);
  const targetTerms = extractMeaningfulTerms(targetText);
  const sourceSet = new Set(sourceTerms);
  const targetSet = new Set(targetTerms);

  return {
    preservedTerms: sourceTerms.filter((term) => targetSet.has(term)).slice(0, 8),
    addedTerms: targetTerms.filter((term) => !sourceSet.has(term)).slice(0, 8),
    removedTerms: sourceTerms.filter((term) => !targetSet.has(term)).slice(0, 8),
  };
}

export function getDraftCopyStatusLabel(status: DraftCopyStatus) {
  return status === "included" ? "Included in copy" : "Excluded from copy";
}

export function getDraftExclusionReasonLabel(reason?: DraftExclusionReason) {
  if (!reason) {
    return "Included in copy output.";
  }

  const labels: Record<DraftExclusionReason, string> = {
    needs_review: "Excluded because this item still needs review.",
    dropped: "Excluded because validation dropped the item.",
    review_note: "Excluded because review notes are guidance, not CV copy.",
    user_confirmed_only:
      "Excluded because this item relies only on user-confirmed evidence.",
    mixed_requires_review:
      "Excluded because this item mixes CV and user-confirmed evidence and needs review.",
    blocked_requirement:
      "Excluded because it points to a blocked hard-blocker requirement.",
    missing_requirement_support:
      "Excluded because it points to a requirement that is not fully supported.",
    copy_excluded_by_validation:
      "Excluded because validation kept the deterministic item out of copy output.",
  };

  return labels[reason];
}

function buildDraftItemAudit(
  item: TailoredDraftItem,
  sectionId: string,
  factMap: Map<string, CandidateFact>,
  requirementMap: Map<string, JobRequirement>,
  globalIssues: DraftValidationIssue[],
): DraftItemAudit {
  const evidenceFacts = item.evidenceIds
    .map((evidenceId) => factMap.get(evidenceId))
    .filter((fact): fact is CandidateFact => Boolean(fact));
  const requirements = item.requirementIds
    .map((requirementId) => requirementMap.get(requirementId))
    .filter((requirement): requirement is JobRequirement => Boolean(requirement));
  const beforeSnippets = evidenceFacts.length
    ? evidenceFacts.map((fact) => ({
        evidenceId: fact.id,
        source: fact.source,
        section: fact.sourceSection,
        text: fact.text,
        confidence: fact.confidence,
      }))
    : item.type === "header_line"
      ? [
          {
            source: "passthrough" as const,
            section: sectionId === "header" ? "Header" : "Passthrough",
            text: item.text,
            confidence: 1,
          },
        ]
      : [];
  const activeText = getActiveDraftItemText(item);
  const activeTextSource: DraftActiveTextSource =
    item.polish?.state === "validated" && item.polish.polishedText
      ? "polished_validated"
      : "deterministic";
  const comparison = buildTextTermComparison(
    beforeSnippets.map((snippet) => snippet.text).join(" ") || item.text,
    activeText,
  );
  const validationIssues = uniqueIssues([
    ...globalIssues.filter((issue) => issue.itemId === item.id),
    ...item.warnings,
    ...(item.polish?.warnings ?? []),
  ]);
  const includedInCopy = isDraftItemIncludedInCopy(item);
  const exclusionReason = getDraftItemCopyExclusionReason(item);

  return {
    itemId: item.id,
    beforeSnippets,
    requirementSnippets: requirements.map((requirement) => ({
      requirementId: requirement.id,
      fingerprint: requirement.fingerprint,
      category: requirement.category,
      importance: requirement.importance,
      text: requirement.text,
      evidenceStatus: requirement.evidenceStatus,
    })),
    deterministicText: item.text,
    polishedText:
      item.polish?.state === "validated" && item.polish.polishedText
        ? item.polish.polishedText
        : undefined,
    activeText,
    activeTextSource,
    includedInCopy,
    copyStatus: includedInCopy ? "included" : "excluded",
    exclusionReason,
    preservedTerms: comparison.preservedTerms,
    addedTerms: comparison.addedTerms,
    removedTerms: comparison.removedTerms,
    validationIssueIds: validationIssues.map((issue) => issue.id),
    validationIssues,
  };
}

function buildDraftAuditSummary(
  result: TailoredDraftResult,
  items: DraftItemAudit[],
): DraftAuditSummary {
  return {
    totalItems: items.length,
    includedInCopyCount: items.filter((item) => item.includedInCopy).length,
    excludedCount: items.filter((item) => !item.includedInCopy).length,
    cvOnlyCount: result.draft.sections
      .flatMap((section) => section.items)
      .filter((item) => item.sourceLabel === "cv_only").length,
    userConfirmedOnlyCount: result.draft.sections
      .flatMap((section) => section.items)
      .filter((item) => item.sourceLabel === "user_confirmed_only").length,
    mixedCount: result.draft.sections
      .flatMap((section) => section.items)
      .filter((item) => item.sourceLabel === "mixed").length,
    polishedValidatedCount: result.draft.sections
      .flatMap((section) => section.items)
      .filter((item) => item.polish?.state === "validated").length,
    polishRejectedCount: result.draft.sections
      .flatMap((section) => section.items)
      .filter((item) => item.polish?.state === "rejected").length,
    polishFailedCount: result.draft.sections
      .flatMap((section) => section.items)
      .filter((item) => item.polish?.state === "failed").length,
    validationCriticalCount: result.validation.issues.filter(
      (issue) => issue.severity === "critical",
    ).length,
    validationWarningCount: result.validation.issues.filter(
      (issue) => issue.severity === "warning",
    ).length,
    missingHighImportanceCount:
      result.validation.missingHighImportanceRequirementIds.length,
    blockedRequirementCount: result.validation.blockedRequirementIds.length,
  };
}

function buildDraftValidationGroups(
  result: TailoredDraftResult,
  items: DraftItemAudit[],
  requirementMap: Map<string, JobRequirement>,
): DraftValidationGroup[] {
  const blockedRequirements = result.validation.blockedRequirementIds
    .map((requirementId) => requirementMap.get(requirementId))
    .filter((requirement): requirement is JobRequirement => Boolean(requirement))
    .map((requirement) => ({
      id: requirement.id,
      label: requirement.text,
      detail: `${formatTitleCase(requirement.category.replace(/_/g, " "))} • Importance ${requirement.importance}/5`,
    }));

  const missingHighImportance = result.validation.missingHighImportanceRequirementIds
    .map((requirementId) => requirementMap.get(requirementId))
    .filter((requirement): requirement is JobRequirement => Boolean(requirement))
    .map((requirement) => ({
      id: requirement.id,
      label: requirement.text,
      detail: `${formatTitleCase(requirement.category.replace(/_/g, " "))} • Importance ${requirement.importance}/5`,
    }));

  const droppedItems = items
    .filter((item) => item.exclusionReason === "dropped")
    .map((item) => ({
      id: item.itemId,
      label: item.activeText,
      detail: getDraftExclusionReasonLabel(item.exclusionReason),
    }));

  const copyExclusions = items
    .filter(
      (item) =>
        !item.includedInCopy &&
        item.exclusionReason !== "dropped" &&
        item.exclusionReason !== "user_confirmed_only" &&
        item.exclusionReason !== "blocked_requirement" &&
        item.exclusionReason !== "missing_requirement_support",
    )
    .map((item) => ({
      id: item.itemId,
      label: item.activeText,
      detail: getDraftExclusionReasonLabel(item.exclusionReason),
    }));

  const userConfirmedOnlyExclusions = items
    .filter((item) => item.exclusionReason === "user_confirmed_only")
    .map((item) => ({
      id: item.itemId,
      label: item.activeText,
      detail: getDraftExclusionReasonLabel(item.exclusionReason),
    }));

  const polishRejected = result.draft.sections
    .flatMap((section) => section.items)
    .filter((item) => item.polish?.state === "rejected")
    .map((item) => ({
      id: item.id,
      label: item.text,
      detail:
        item.polish?.warnings[0]?.message ??
        "OpenAI polish was rejected and SmartCV kept the deterministic wording.",
    }));

  const polishFailed = result.draft.sections
    .flatMap((section) => section.items)
    .filter((item) => item.polish?.state === "failed")
    .map((item) => ({
      id: item.id,
      label: item.text,
      detail:
        item.polish?.warnings[0]?.message ??
        "OpenAI polish failed and SmartCV kept the deterministic wording.",
    }));

  const otherWarnings = result.validation.issues
    .filter(
      (issue) =>
        issue.severity !== "critical" &&
        issue.category !== "polish_rejected" &&
        issue.category !== "polish_failed" &&
        issue.category !== "copy_excluded" &&
        issue.category !== "user_confirmed_only",
    )
    .map((issue) => ({
      id: issue.id,
      label: issue.message,
      detail: issue.recommendation,
    }));

  return [
    buildGroup("critical_blockers", "Critical blockers", "critical", blockedRequirements),
    buildGroup(
      "missing_high_importance",
      "Missing high-importance requirements",
      "warning",
      missingHighImportance,
    ),
    buildGroup("dropped_items", "Dropped items", "warning", droppedItems),
    buildGroup("copy_exclusions", "Copy exclusions", "info", copyExclusions),
    buildGroup(
      "user_confirmed_only_exclusions",
      "User-confirmed-only exclusions",
      "info",
      userConfirmedOnlyExclusions,
    ),
    buildGroup("polish_rejected", "Polish rejected", "warning", polishRejected),
    buildGroup("polish_failed", "Polish failed", "warning", polishFailed),
    buildGroup("other_warnings", "Other validation warnings", "info", otherWarnings),
  ].filter((group): group is DraftValidationGroup => Boolean(group));
}

function buildGroup(
  id: DraftValidationGroup["id"],
  title: string,
  tone: DraftValidationGroup["tone"],
  items: DraftValidationGroup["items"],
) {
  if (!items.length) {
    return null;
  }

  return {
    id,
    title,
    tone,
    count: items.length,
    items: items.slice(0, 8),
  } satisfies DraftValidationGroup;
}

function extractMeaningfulTerms(text: string) {
  return uniqueStrings(
    extractKeywords(text, 14)
      .map(normalizeKeywordPhrase)
      .filter((term) => term && !isGenericKeyword(term))
      .slice(0, 12),
  );
}

function uniqueIssues(issues: DraftValidationIssue[]) {
  const seen = new Set<string>();

  return issues.filter((issue) => {
    if (seen.has(issue.id)) {
      return false;
    }

    seen.add(issue.id);
    return true;
  });
}

function formatTitleCase(value: string) {
  return value
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
