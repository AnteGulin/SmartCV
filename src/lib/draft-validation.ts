import {
  KNOWN_CERTIFICATION_HINTS,
  KNOWN_DEGREE_HINTS,
  KNOWN_LANGUAGES,
  KNOWN_TOOLS,
  countOccurrences,
  extractKeywords,
  isGenericKeyword,
  normalizeKeywordPhrase,
  normalizeText,
  uniqueStrings,
} from "@/lib/analysis-utils";
import type {
  CandidateFact,
  DraftExclusionReason,
  DraftPolishCandidate,
  DraftPolishSummary,
  DraftStatus,
  DraftValidationIssue,
  JobRequirement,
  OpenAIDraftPolishItem,
  Phase1AnalysisResult,
  TailoredDraftItem,
  TailoredDraftResult,
  TailoredDraftSection,
} from "@/lib/types";

type DraftValidationResult = {
  draft: {
    status: DraftStatus;
    sections: TailoredDraftSection[];
    copyText: string;
  };
  validation: {
    issues: DraftValidationIssue[];
    blockedRequirementIds: string[];
    missingHighImportanceRequirementIds: string[];
    userConfirmedOnlyItemCount: number;
    droppedItemCount: number;
  };
  warnings: string[];
};

const MAX_DRAFT_POLISH_ITEMS = 10;
const SENIORITY_SCOPE_TERMS = [
  "expert",
  "senior",
  "lead",
  "architect",
  "architected",
  "owned",
  "global",
  "enterprise-wide",
];

export function validateDeterministicDraft(
  analysis: Phase1AnalysisResult,
  sections: TailoredDraftSection[],
  warnings: string[] = [],
): DraftValidationResult {
  const factMap = new Map(analysis.cv.facts.map((fact) => [fact.id, fact]));
  const requirementMap = new Map(
    analysis.job.requirements.map((requirement) => [requirement.id, requirement]),
  );
  const issues: DraftValidationIssue[] = [];
  const nextSections = sections.map((section) => ({
    ...section,
    items: section.items.map((item) =>
      validateDraftItem(item, section.id, factMap, requirementMap, issues),
    ),
  }));
  const blockedRequirementIds = analysis.job.requirements
    .filter((requirement) => requirement.evidenceStatus === "blocked")
    .map((requirement) => requirement.id);
  const missingHighImportanceRequirementIds = analysis.job.requirements
    .filter(
      (requirement) =>
        requirement.evidenceStatus === "missing" && requirement.importance >= 4,
    )
    .map((requirement) => requirement.id);
  const userConfirmedOnlyItemCount = nextSections
    .flatMap((section) => section.items)
    .filter((item) => item.sourceLabel === "user_confirmed_only").length;
  const droppedItemCount = nextSections
    .flatMap((section) => section.items)
    .filter((item) => item.reviewState === "dropped").length;
  const copyText = buildCopyText(nextSections);
  const draftWarnings = [...warnings];

  if (!copyText.trim()) {
    draftWarnings.push(
      "No validated draft items were safe to copy yet. Review the evidence map and review notes first.",
    );
  }

  if (userConfirmedOnlyItemCount > 0) {
    draftWarnings.push(
      "User-confirmed-only items remain excluded from default copy until reviewed and added truthfully to the CV.",
    );
  }

  const hasNeedsReviewItems = nextSections
    .flatMap((section) => section.items)
    .some(
      (item) =>
        item.reviewState === "needs_review" &&
        item.type !== "review_note" &&
        item.type !== "header_line",
    );
  const hasWarningIssues = issues.some(
    (issue) => issue.severity === "warning" || issue.severity === "critical",
  );

  const status: DraftStatus = blockedRequirementIds.length
    ? "blocked"
    : hasNeedsReviewItems || hasWarningIssues || missingHighImportanceRequirementIds.length
      ? "needs_review"
      : "ready";

  return {
    draft: {
      status,
      sections: nextSections,
      copyText,
    },
    validation: {
      issues,
      blockedRequirementIds,
      missingHighImportanceRequirementIds,
      userConfirmedOnlyItemCount,
      droppedItemCount,
    },
    warnings: uniqueStrings(draftWarnings),
  };
}

export function getEligibleDraftPolishItemIds(result: TailoredDraftResult) {
  const factMap = new Map(result.analysis.cv.facts.map((fact) => [fact.id, fact]));
  const requirementMap = new Map(
    result.analysis.job.requirements.map((requirement) => [requirement.id, requirement]),
  );

  return result.draft.sections
    .flatMap((section) => section.items)
    .filter((item) => isEligibleDraftPolishItem(item, factMap, requirementMap))
    .map((item) => item.id)
    .sort();
}

export function countEligibleDraftPolishItems(result: TailoredDraftResult) {
  return getEligibleDraftPolishItemIds(result).length;
}

export function buildDraftPolishCandidates(
  result: TailoredDraftResult,
  itemIds?: string[],
  limit = MAX_DRAFT_POLISH_ITEMS,
): DraftPolishCandidate[] {
  const factMap = new Map(result.analysis.cv.facts.map((fact) => [fact.id, fact]));
  const requirementMap = new Map(
    result.analysis.job.requirements.map((requirement) => [requirement.id, requirement]),
  );
  const requestedIds = new Set((itemIds ?? []).filter(Boolean));
  const hasRequestedIds = requestedIds.size > 0;

  return result.draft.sections
    .flatMap((section) => section.items)
    .filter((item) => {
      if (hasRequestedIds && !requestedIds.has(item.id)) {
        return false;
      }

      return isEligibleDraftPolishItem(item, factMap, requirementMap);
    })
    .slice(0, limit)
    .map((item) => {
      const evidenceFacts = item.evidenceIds
        .map((id) => factMap.get(id))
        .filter((fact): fact is CandidateFact => Boolean(fact));
      const requirements = item.requirementIds
        .map((id) => requirementMap.get(id))
        .filter((requirement): requirement is JobRequirement => Boolean(requirement));
      const protectedTerms = extractProtectedTerms(item.text, evidenceFacts, requirements);
      const evidenceText = buildCombinedEvidenceText(evidenceFacts);
      const allowedTerms = uniqueStrings([
        ...protectedTerms,
        ...extractStructuredTerms(evidenceText),
        ...extractKeywords(
          [
            item.text,
            evidenceFacts.map((fact) => fact.text).join(" "),
            evidenceFacts.flatMap((fact) => fact.tools).join(" "),
            evidenceFacts.flatMap((fact) => fact.skills).join(" "),
          ].join(" "),
          18,
        ).filter((term) => !isGenericKeyword(term)),
      ]).slice(0, 18);

      return {
        id: item.id,
        type: item.type as DraftPolishCandidate["type"],
        originalText: item.text,
        evidenceSnippets: evidenceFacts.map((fact) => trimSnippet(fact.text)),
        requirementSnippets: requirements.map((requirement) => trimSnippet(requirement.text)),
        requiredTerms: protectedTerms,
        allowedTerms,
        forbiddenAdditions: [
          "Do not add companies, roles, dates, tools, metrics, certifications, languages, locations, work authorization, licenses, clearance, or new years of experience.",
          "Do not add numbers or make the claim stronger.",
          "Do not mention missing or blocked requirements.",
        ],
        maxLength: Math.min(
          220,
          Math.max(item.text.length + 24, Math.ceil(item.text.length * 1.2)),
        ),
      } satisfies DraftPolishCandidate;
    });
}

export function withDraftPolishSummary(
  result: TailoredDraftResult,
  summary: DraftPolishSummary,
  warnings: string[] = [],
): TailoredDraftResult {
  return {
    ...result,
    meta: {
      ...result.meta,
      version: "phase3b.v1",
      warnings: uniqueStrings([...result.meta.warnings, ...warnings]),
      polish: summary,
    },
    draft: {
      ...result.draft,
      copyText: buildCopyText(result.draft.sections),
    },
  };
}

export function markFailedDraftPolish(
  result: TailoredDraftResult,
  eligibleItemIds: string[],
  warningMessage: string,
  model?: string,
  extraWarnings: string[] = [],
): TailoredDraftResult {
  const eligibleIdSet = new Set(eligibleItemIds);
  const issues: DraftValidationIssue[] = [];
  const nextSections = result.draft.sections.map((section) => ({
    ...section,
    items: section.items.map((item) => {
      if (!eligibleIdSet.has(item.id)) {
        return item;
      }

      const issue = buildIssue(
        "polish_failed",
        "warning",
        item.id,
        "OpenAI wording polish was unavailable for this item, so SmartCV kept the deterministic wording.",
        "You can still use the deterministic wording safely, or retry polishing later.",
      );
      issues.push(issue);

        return {
          ...item,
          polish: {
            state: "failed" as const,
            model,
            notes: [warningMessage],
            warnings: [issue],
          },
        };
    }),
  }));

  return {
    ...result,
    meta: {
      ...result.meta,
      version: "phase3b.v1",
      warnings: uniqueStrings([
        ...result.meta.warnings,
        ...extraWarnings,
        warningMessage,
      ]),
      polish: {
        attempted: true,
        model,
        eligibleCount: eligibleItemIds.length,
        polishedCount: 0,
        rejectedCount: 0,
        unchangedCount: 0,
        failedCount: eligibleItemIds.length,
      },
    },
    draft: {
      ...result.draft,
      sections: nextSections,
      copyText: buildCopyText(nextSections),
    },
    validation: {
      ...result.validation,
      issues: [...result.validation.issues, ...issues],
    },
  };
}

export function applyValidatedDraftPolish(
  result: TailoredDraftResult,
  responseItems: OpenAIDraftPolishItem[],
  model: string,
  warnings: string[] = [],
  eligibleItemIds = getEligibleDraftPolishItemIds(result),
): TailoredDraftResult {
  const factMap = new Map(result.analysis.cv.facts.map((fact) => [fact.id, fact]));
  const requirementMap = new Map(
    result.analysis.job.requirements.map((requirement) => [requirement.id, requirement]),
  );
  const eligibleIdSet = new Set(eligibleItemIds);
  const responseBuckets = new Map<string, OpenAIDraftPolishItem[]>();
  const extraWarnings = [...warnings];

  for (const item of responseItems) {
    const existing = responseBuckets.get(item.id) ?? [];
    existing.push(item);
    responseBuckets.set(item.id, existing);
  }

  const unknownIds = [...responseBuckets.keys()].filter((id) => !eligibleIdSet.has(id));
  if (unknownIds.length) {
    extraWarnings.push(
      "Some OpenAI polish results were ignored because they did not match eligible draft items.",
    );
  }

  const issues: DraftValidationIssue[] = [];
  let polishedCount = 0;
  let rejectedCount = 0;
  let unchangedCount = 0;
  let failedCount = 0;

  const nextSections = result.draft.sections.map((section) => ({
    ...section,
    items: section.items.map((item) => {
      if (!eligibleIdSet.has(item.id)) {
        return item;
      }

      const responses = responseBuckets.get(item.id) ?? [];
      if (responses.length !== 1) {
        const issue = buildIssue(
          "polish_failed",
          "warning",
          item.id,
          "OpenAI polish did not return exactly one usable result for this item, so SmartCV kept the deterministic wording.",
          "Retry polish if you want a second attempt, but the deterministic wording remains the source of truth.",
        );
        issues.push(issue);
        failedCount += 1;

        return {
          ...item,
          polish: {
            state: "failed" as const,
            model,
            notes: [],
            warnings: [issue],
          },
        };
      }

      const response = responses[0];
      const evidenceFacts = item.evidenceIds
        .map((id) => factMap.get(id))
        .filter((fact): fact is CandidateFact => Boolean(fact));
      const requirements = item.requirementIds
        .map((id) => requirementMap.get(id))
        .filter((requirement): requirement is JobRequirement => Boolean(requirement));
      const polishedText = normalizeText(response.polishedText ?? "");

      if (!polishedText) {
        const issue = buildIssue(
          "polish_rejected",
          "warning",
          item.id,
          "OpenAI polish returned empty wording for this item, so SmartCV kept the deterministic wording.",
          "Retry polish if needed, but keep the original deterministic wording as the safe fallback.",
        );
        issues.push(issue);
        rejectedCount += 1;

        return {
          ...item,
          polish: {
            state: "rejected" as const,
            model,
            notes: response.notes ?? [],
            warnings: [issue],
          },
        };
      }

      if (response.changedMeaning) {
        const issue = buildIssue(
          "polish_rejected",
          "warning",
          item.id,
          "OpenAI flagged a possible meaning change, so SmartCV kept the deterministic wording.",
          "Keep the wording grounded in the original supported claim.",
        );
        issues.push(issue);
        rejectedCount += 1;

        return {
          ...item,
          polish: {
            state: "rejected" as const,
            model,
            notes: response.notes ?? [],
            warnings: [issue],
          },
        };
      }

      if (isNearIdentical(item.text, polishedText)) {
        unchangedCount += 1;
        return {
          ...item,
          polish: {
            state: "unchanged" as const,
            polishedText,
            model,
            notes: response.notes ?? [],
            warnings: [],
          },
        };
      }

      const validationWarnings = validatePolishedText(
        item,
        polishedText,
        evidenceFacts,
        requirements,
      );

      if (validationWarnings.length) {
        issues.push(...validationWarnings);
        rejectedCount += 1;

        return {
          ...item,
          polish: {
            state: "rejected" as const,
            model,
            notes: response.notes ?? [],
            warnings: validationWarnings,
          },
        };
      }

      polishedCount += 1;

      return {
        ...item,
        polish: {
          state: "validated" as const,
          polishedText,
          model,
          notes: response.notes ?? [],
          warnings: [],
        },
      };
    }),
  }));

  return {
    ...result,
    meta: {
      ...result.meta,
      version: "phase3b.v1",
      warnings: uniqueStrings([...result.meta.warnings, ...extraWarnings]),
      polish: {
        attempted: true,
        model,
        eligibleCount: eligibleItemIds.length,
        polishedCount,
        rejectedCount,
        unchangedCount,
        failedCount,
      },
    },
    draft: {
      ...result.draft,
      sections: nextSections,
      copyText: buildCopyText(nextSections),
    },
    validation: {
      ...result.validation,
      issues: [...result.validation.issues, ...issues],
    },
  };
}

function validateDraftItem(
  item: TailoredDraftItem,
  sectionId: TailoredDraftSection["id"],
  factMap: Map<string, CandidateFact>,
  requirementMap: Map<string, JobRequirement>,
  issues: DraftValidationIssue[],
) {
  const nextItem: TailoredDraftItem = {
    ...item,
    warnings: [...item.warnings],
  };

  if (item.type === "header_line") {
    if (nextItem.sourceLabel !== "passthrough") {
      nextItem.sourceLabel = "passthrough";
    }
    return nextItem;
  }

  if (item.type === "review_note") {
    return nextItem;
  }

  if (!nextItem.evidenceIds.length) {
    const issue = buildIssue(
      "missing_anchor",
      "critical",
      nextItem.id,
      "This draft item has no evidence links.",
      "Drop the item or attach it to at least one supporting evidence fact.",
    );
    issues.push(issue);
    nextItem.warnings.push(issue);
    nextItem.reviewState = "dropped";
    return nextItem;
  }

  if (!nextItem.requirementIds.length) {
    const issue = buildIssue(
      "missing_anchor",
      "critical",
      nextItem.id,
      "This draft item has no supporting requirement links.",
      "Drop the item or map it to at least one supported job requirement.",
    );
    issues.push(issue);
    nextItem.warnings.push(issue);
    nextItem.reviewState = "dropped";
    return nextItem;
  }

  const evidenceFacts = nextItem.evidenceIds
    .map((evidenceId) => factMap.get(evidenceId))
    .filter((fact): fact is CandidateFact => Boolean(fact));
  const requirements = nextItem.requirementIds
    .map((requirementId) => requirementMap.get(requirementId))
    .filter((requirement): requirement is JobRequirement => Boolean(requirement));

  if (evidenceFacts.length !== nextItem.evidenceIds.length) {
    const issue = buildIssue(
      "missing_anchor",
      "critical",
      nextItem.id,
      "This draft item references evidence that no longer exists in the analysis.",
      "Regenerate the draft from the latest analysis result.",
    );
    issues.push(issue);
    nextItem.warnings.push(issue);
    nextItem.reviewState = "dropped";
  }

  if (requirements.length !== nextItem.requirementIds.length) {
    const issue = buildIssue(
      "missing_requirement_support",
      "critical",
      nextItem.id,
      "This draft item references requirements that no longer exist in the analysis.",
      "Regenerate the draft from the latest analysis result.",
    );
    issues.push(issue);
    nextItem.warnings.push(issue);
    nextItem.reviewState = "dropped";
  }

  if (requirements.some((requirement) => requirement.evidenceStatus !== "supported")) {
    const blockedRequirement = requirements.find(
      (requirement) => requirement.evidenceStatus === "blocked",
    );
    const issue = buildIssue(
      blockedRequirement ? "blocked_requirement" : "missing_requirement_support",
      "critical",
      nextItem.id,
      blockedRequirement
        ? "This draft item tries to claim a blocked hard-blocker requirement."
        : "This draft item is linked to a requirement that is not fully supported.",
      "Remove the claim from copy output unless the requirement is explicitly supported.",
    );
    issues.push(issue);
    nextItem.warnings.push(issue);
    nextItem.reviewState = "dropped";
  }

  if (nextItem.sourceLabel === "user_confirmed_only" && nextItem.reviewState === "ready") {
    const issue = buildIssue(
      "user_confirmed_only",
      "warning",
      nextItem.id,
      "This item is supported only by user-confirmed evidence, so it needs review before copying.",
      "Review the confirmation and add it truthfully to the master CV before using it in an application.",
    );
    issues.push(issue);
    nextItem.warnings.push(issue);
    nextItem.reviewState = "needs_review";
  }

  if (nextItem.sourceLabel === "mixed" && nextItem.reviewState === "ready") {
    const issue = buildIssue(
      "copy_excluded",
      "warning",
      nextItem.id,
      "This item mixes original CV evidence with user-confirmed evidence, so it needs review before copying.",
      "Review the user-confirmed part and add it truthfully to the master CV before using it in an application.",
    );
    issues.push(issue);
    nextItem.warnings.push(issue);
    nextItem.reviewState = "needs_review";
  }

  const combinedEvidenceText = buildCombinedEvidenceText(evidenceFacts);
  const unsupportedMetric = extractMetricClaims(nextItem.text).find(
    (claim) => !combinedEvidenceText.includes(normalizeKeywordPhrase(claim).toLowerCase()),
  );

  if (unsupportedMetric) {
    const issue = buildIssue(
      "unverified_metric",
      "critical",
      nextItem.id,
      `Metric or numeric claim "${unsupportedMetric}" is not present in the linked evidence.`,
      "Keep exact numbers and metrics grounded in the original evidence text.",
    );
    issues.push(issue);
    nextItem.warnings.push(issue);
    nextItem.reviewState = "dropped";
  }

  const unsupportedYears = extractYearClaims(nextItem.text).find(
    (claim) => !combinedEvidenceText.includes(normalizeKeywordPhrase(claim).toLowerCase()),
  );

  if (unsupportedYears) {
    const issue = buildIssue(
      "unverified_years",
      "critical",
      nextItem.id,
      `Date or years-of-experience claim "${unsupportedYears}" is not present in the linked evidence.`,
      "Only include dates or years that are explicit in the supporting evidence.",
    );
    issues.push(issue);
    nextItem.warnings.push(issue);
    nextItem.reviewState = "dropped";
  }

  const unsupportedTerm = findUnsupportedStructuredTerm(
    nextItem.text,
    combinedEvidenceText,
  );

  if (unsupportedTerm) {
    const issue = buildIssue(
      "unsupported_claim",
      "critical",
      nextItem.id,
      `Structured claim "${unsupportedTerm}" is not present in the linked evidence.`,
      "Remove unsupported tools, certifications, languages, degrees, or authorization claims.",
    );
    issues.push(issue);
    nextItem.warnings.push(issue);
    nextItem.reviewState = "dropped";
  }

  if (
    nextItem.reviewState === "needs_review" &&
    nextItem.sourceLabel === "user_confirmed_only"
  ) {
    const issue = buildIssue(
      "copy_excluded",
      "info",
      nextItem.id,
      "This user-confirmed-only item is shown in the draft panel but excluded from default copy.",
      "Review it and add it truthfully to the master CV before using it.",
    );
    issues.push(issue);
    nextItem.warnings.push(issue);
  }

  if (sectionId === "summary" && nextItem.sourceLabel !== "cv_only") {
    nextItem.reviewState = nextItem.reviewState === "dropped" ? "dropped" : "needs_review";
  }

  return nextItem;
}

function validatePolishedText(
  item: TailoredDraftItem,
  polishedText: string,
  evidenceFacts: CandidateFact[],
  requirements: JobRequirement[],
) {
  const issues: DraftValidationIssue[] = [];
  const combinedEvidenceText = buildCombinedEvidenceText(evidenceFacts);
  const originalAndEvidenceText = normalizeText(
    [item.text, combinedEvidenceText].join(" "),
  ).toLowerCase();
  const protectedTerms = extractProtectedTerms(item.text, evidenceFacts, requirements);

  if (polishedText.length > Math.max(item.text.length + 28, Math.ceil(item.text.length * 1.25))) {
    issues.push(
      buildIssue(
        "polish_rejected",
        "warning",
        item.id,
        "OpenAI polish made this item significantly longer than the deterministic wording.",
        "Keep polished bullets concise and close in scope to the original deterministic wording.",
      ),
    );
  }

  const unsupportedMetric = extractMetricClaims(polishedText).find(
    (claim) => !combinedEvidenceText.includes(normalizeKeywordPhrase(claim).toLowerCase()),
  );
  if (unsupportedMetric) {
    issues.push(
      buildIssue(
        "unverified_metric",
        "warning",
        item.id,
        `OpenAI polish introduced metric or numeric claim "${unsupportedMetric}" that is not grounded in the linked evidence.`,
        "Keep exact numbers and metrics identical to the source evidence.",
      ),
    );
  }

  const unsupportedYears = extractYearClaims(polishedText).find(
    (claim) => !combinedEvidenceText.includes(normalizeKeywordPhrase(claim).toLowerCase()),
  );
  if (unsupportedYears) {
    issues.push(
      buildIssue(
        "unverified_years",
        "warning",
        item.id,
        `OpenAI polish introduced date or years claim "${unsupportedYears}" that is not grounded in the linked evidence.`,
        "Only keep dates or years that are explicit in the linked evidence.",
      ),
    );
  }

  const unsupportedStructuredTerm = findUnsupportedStructuredTerm(
    polishedText,
    combinedEvidenceText,
  );
  if (unsupportedStructuredTerm) {
    issues.push(
      buildIssue(
        "unsupported_claim",
        "warning",
        item.id,
        `OpenAI polish introduced structured claim "${unsupportedStructuredTerm}" that is not present in the linked evidence.`,
        "Do not add tools, certifications, languages, degrees, or authorization claims that are not explicit in the evidence.",
      ),
    );
  }

  const unsupportedSeniority = SENIORITY_SCOPE_TERMS.find(
    (term) =>
      containsTerm(polishedText, term) && !containsTerm(originalAndEvidenceText, term),
  );
  if (unsupportedSeniority) {
    issues.push(
      buildIssue(
        "unsupported_claim",
        "warning",
        item.id,
        `OpenAI polish introduced unsupported scope or seniority wording "${unsupportedSeniority}".`,
        "Keep seniority and scope grounded in the original deterministic text or explicit evidence.",
      ),
    );
  }

  const missingProtectedTerm = protectedTerms.find(
    (term) => !containsTerm(polishedText, term),
  );
  if (missingProtectedTerm) {
    issues.push(
      buildIssue(
        "polish_rejected",
        "warning",
        item.id,
        `OpenAI polish removed important supported term "${missingProtectedTerm}".`,
        "Preserve the key supported terms that keep the claim faithful to the evidence.",
      ),
    );
  }

  if (hasKeywordStuffing(polishedText, item.text)) {
    issues.push(
      buildIssue(
        "polish_rejected",
        "warning",
        item.id,
        "OpenAI polish made this item look repetitive or keyword-stuffed.",
        "Keep polished wording concise and natural instead of repeating keywords.",
      ),
    );
  }

  return issues;
}

function isEligibleDraftPolishItem(
  item: TailoredDraftItem,
  factMap: Map<string, CandidateFact>,
  requirementMap: Map<string, JobRequirement>,
) {
  if (
    item.type !== "experience_bullet" &&
    item.type !== "project_bullet"
  ) {
    return false;
  }

  if (item.reviewState !== "ready" || item.sourceLabel !== "cv_only") {
    return false;
  }

  if (item.warnings.length || item.polish?.state === "validated") {
    return false;
  }

  if (!item.evidenceIds.length || !item.requirementIds.length) {
    return false;
  }

  const evidenceFacts = item.evidenceIds
    .map((id) => factMap.get(id))
    .filter((fact): fact is CandidateFact => Boolean(fact));
  const requirements = item.requirementIds
    .map((id) => requirementMap.get(id))
    .filter((requirement): requirement is JobRequirement => Boolean(requirement));

  if (
    evidenceFacts.length !== item.evidenceIds.length ||
    requirements.length !== item.requirementIds.length
  ) {
    return false;
  }

  if (evidenceFacts.some((fact) => fact.source !== "cv")) {
    return false;
  }

  return requirements.every(
    (requirement) => requirement.evidenceStatus === "supported",
  );
}

export function getActiveDraftItemText(item: TailoredDraftItem) {
  if (item.polish?.state === "validated" && item.polish.polishedText) {
    return item.polish.polishedText;
  }

  return item.text;
}

export function isDraftItemIncludedInCopy(item: TailoredDraftItem) {
  return (
    item.reviewState === "ready" &&
    item.type !== "review_note" &&
    item.sourceLabel !== "user_confirmed_only"
  );
}

export function getDraftItemCopyExclusionReason(
  item: TailoredDraftItem,
): DraftExclusionReason | undefined {
  if (isDraftItemIncludedInCopy(item)) {
    return undefined;
  }

  if (item.type === "review_note") {
    return "review_note";
  }

  if (item.sourceLabel === "user_confirmed_only") {
    return "user_confirmed_only";
  }

  if (item.warnings.some((warning) => warning.category === "blocked_requirement")) {
    return "blocked_requirement";
  }

  if (
    item.warnings.some(
      (warning) => warning.category === "missing_requirement_support",
    )
  ) {
    return "missing_requirement_support";
  }

  if (item.sourceLabel === "mixed" && item.reviewState !== "ready") {
    return "mixed_requires_review";
  }

  if (item.reviewState === "dropped") {
    return "dropped";
  }

  if (item.reviewState === "needs_review") {
    return "needs_review";
  }

  return "copy_excluded_by_validation";
}

function buildCopyText(sections: TailoredDraftSection[]) {
  const lines: string[] = [];
  const headerItems = sections.find((section) => section.id === "header")?.items ?? [];

  for (const item of headerItems) {
    if (isDraftItemIncludedInCopy(item)) {
      lines.push(getActiveDraftItemText(item));
    }
  }

  if (headerItems.some((item) => isDraftItemIncludedInCopy(item))) {
    lines.push("");
  }

  for (const section of sections) {
    if (section.id === "header" || section.id === "review_notes") {
      continue;
    }

    const readyItems = section.items.filter((item) => isDraftItemIncludedInCopy(item));

    if (!readyItems.length) {
      continue;
    }

    lines.push(section.title);

    for (const item of readyItems) {
      lines.push(`- ${getActiveDraftItemText(item)}`);
    }

    lines.push("");
  }

  return lines.join("\n").trim();
}

function buildCombinedEvidenceText(facts: CandidateFact[]) {
  return normalizeText(
    facts
      .flatMap((fact) => [
        fact.text,
        fact.role,
        fact.company,
        fact.dateRange,
        fact.skills.join(" "),
        fact.tools.join(" "),
        fact.metrics.join(" "),
      ])
      .filter(Boolean)
      .join(" "),
  ).toLowerCase();
}

function extractProtectedTerms(
  originalText: string,
  evidenceFacts: CandidateFact[],
  requirements: JobRequirement[],
) {
  const evidenceText = buildCombinedEvidenceText(evidenceFacts);
  const requirementText = normalizeText(
    requirements.map((requirement) => requirement.text).join(" "),
  ).toLowerCase();
  const originalKeywords = extractKeywords(originalText, 14).map(normalizeKeywordPhrase);

  return uniqueStrings([
    ...extractMetricClaims(originalText),
    ...extractYearClaims(originalText),
    ...extractStructuredTerms(originalText),
    ...originalKeywords.filter(
      (term) =>
        term &&
        !isGenericKeyword(term) &&
        (containsTerm(evidenceText, term) || containsTerm(requirementText, term)),
    ),
  ]).slice(0, 10);
}

function extractMetricClaims(text: string) {
  return [...text.matchAll(/(?:[$€£]\s?\d[\d,.]*(?:\s?[kKmM])?|\b\d+(?:\.\d+)?%|\b\d+(?:\.\d+)?\s?(?:hours?|days?|weeks?|months?|years?|tickets?|users?|customers?|projects?|incidents?|sla|kpi|kpis|x))\b/gi)].map(
    (match) => match[0].trim(),
  );
}

function extractYearClaims(text: string) {
  return [
    ...text.matchAll(
      /\b(?:19|20)\d{2}\b|\b(?:\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\+?\s+years?\b/gi,
    ),
  ].map((match) => match[0].trim());
}

function extractStructuredTerms(text: string) {
  const lowerText = normalizeText(text).toLowerCase();

  return uniqueStrings([
    ...[...KNOWN_TOOLS].filter((term) => containsTerm(lowerText, term)),
    ...[...KNOWN_LANGUAGES].filter((term) => containsTerm(lowerText, term)),
    ...[...KNOWN_CERTIFICATION_HINTS].filter((term) => containsTerm(lowerText, term)),
    ...[...KNOWN_DEGREE_HINTS].filter((term) => containsTerm(lowerText, term)),
    ...extractWorkAuthorizationTerms(lowerText),
  ]);
}

function findUnsupportedStructuredTerm(text: string, combinedEvidenceText: string) {
  return extractStructuredTerms(text).find(
    (term) => !containsTerm(combinedEvidenceText, term),
  );
}

function extractWorkAuthorizationTerms(text: string) {
  const matches = [
    "authorized to work",
    "right to work",
    "work authorization",
    "work permit",
    "visa",
    "eu citizen",
    "security clearance",
    "driving license",
    "driver's license",
  ];

  return matches.filter((term) => containsTerm(text, term));
}

function containsTerm(text: string, term: string) {
  const normalizedText = normalizeText(text).toLowerCase();
  const normalizedTerm = normalizeKeywordPhrase(term).toLowerCase();

  if (!normalizedText || !normalizedTerm) {
    return false;
  }

  const escaped = normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  if (/^[a-z0-9 ]+$/i.test(normalizedTerm)) {
    return new RegExp(`\\b${escaped}\\b`, "i").test(normalizedText);
  }

  return normalizedText.includes(normalizedTerm);
}

function hasKeywordStuffing(polishedText: string, originalText: string) {
  const candidates = extractKeywords(polishedText, 12)
    .map(normalizeKeywordPhrase)
    .filter((term) => term && !isGenericKeyword(term));
  const normalizedOriginal = normalizeText(originalText).toLowerCase();
  const normalizedPolished = normalizeText(polishedText).toLowerCase();

  return candidates.some((term) => {
    const polishedCount = countOccurrences(normalizedPolished, term);
    const originalCount = countOccurrences(normalizedOriginal, term);
    return polishedCount >= 4 || polishedCount > originalCount + 2;
  });
}

function isNearIdentical(left: string, right: string) {
  return canonicalizeComparableText(left) === canonicalizeComparableText(right);
}

function canonicalizeComparableText(text: string) {
  return normalizeText(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function trimSnippet(text: string, limit = 260) {
  const normalized = normalizeText(text);

  if (normalized.length <= limit) {
    return normalized;
  }

  return `${normalized.slice(0, limit - 1).trimEnd()}…`;
}

function buildIssue(
  category: DraftValidationIssue["category"],
  severity: DraftValidationIssue["severity"],
  itemId: string | undefined,
  message: string,
  recommendation: string,
): DraftValidationIssue {
  const normalizedMessage = normalizeText(message)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .slice(0, 36);

  return {
    id: `draft_issue_${category}_${itemId ?? "general"}_${normalizedMessage}`,
    itemId,
    severity,
    category,
    message,
    recommendation,
  };
}
