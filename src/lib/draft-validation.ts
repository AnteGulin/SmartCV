import {
  KNOWN_CERTIFICATION_HINTS,
  KNOWN_DEGREE_HINTS,
  KNOWN_LANGUAGES,
  KNOWN_TOOLS,
  normalizeText,
} from "@/lib/analysis-utils";
import type {
  CandidateFact,
  DraftStatus,
  DraftValidationIssue,
  JobRequirement,
  Phase1AnalysisResult,
  TailoredDraftItem,
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
    warnings: draftWarnings,
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
    (claim) => !combinedEvidenceText.includes(normalizeText(claim).toLowerCase()),
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
    (claim) => !combinedEvidenceText.includes(normalizeText(claim).toLowerCase()),
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

function buildCopyText(sections: TailoredDraftSection[]) {
  const lines: string[] = [];
  const headerItems = sections.find((section) => section.id === "header")?.items ?? [];

  for (const item of headerItems) {
    if (item.reviewState === "ready") {
      lines.push(item.text);
    }
  }

  if (headerItems.some((item) => item.reviewState === "ready")) {
    lines.push("");
  }

  for (const section of sections) {
    if (section.id === "header" || section.id === "review_notes") {
      continue;
    }

    const readyItems = section.items.filter((item) => item.reviewState === "ready");

    if (!readyItems.length) {
      continue;
    }

    lines.push(section.title);

    for (const item of readyItems) {
      lines.push(`- ${item.text}`);
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

function findUnsupportedStructuredTerm(text: string, combinedEvidenceText: string) {
  const lowerText = normalizeText(text).toLowerCase();
  const structuredTerms = uniqueTerms([
    [...KNOWN_TOOLS].filter((term) => containsTerm(lowerText, term)),
    [...KNOWN_LANGUAGES].filter((term) => containsTerm(lowerText, term)),
    [...KNOWN_CERTIFICATION_HINTS].filter((term) => containsTerm(lowerText, term)),
    [...KNOWN_DEGREE_HINTS].filter((term) => containsTerm(lowerText, term)),
    extractWorkAuthorizationTerms(lowerText),
  ]);

  return structuredTerms.find((term) => !containsTerm(combinedEvidenceText, term));
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
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  if (/^[a-z0-9 ]+$/i.test(term)) {
    return new RegExp(`\\b${escaped}\\b`, "i").test(text);
  }

  return text.includes(term.toLowerCase());
}

function uniqueTerms(values: string[][]) {
  return [...new Set(values.flat().map((value) => value.toLowerCase()))];
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
