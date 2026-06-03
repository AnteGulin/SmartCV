import { findAnchor, normalizeText } from "@/lib/analysis-utils";
import type {
  ATSHygieneWarning,
  CandidateFact,
  DraftValidationIssue,
  EvidenceMatch,
  GroundedOpenAIAssist,
  JobRequirement,
  OpenAIAssistResult,
  Phase1AnalysisResult,
  TailoredDraftResult,
  TextAnchor,
} from "@/lib/types";

const ANALYZER_MODES = new Set(["local", "openai"]);
const EVIDENCE_SOURCES = new Set(["cv", "user_confirmed"]);
const REQUIREMENT_CATEGORIES = new Set([
  "must_have",
  "nice_to_have",
  "responsibility",
  "tool",
  "domain",
  "soft_skill",
  "hard_blocker",
]);
const EVIDENCE_STATUSES = new Set(["supported", "weak", "missing", "blocked"]);
const IMPROVEMENT_FACETS = new Set([
  "must_have",
  "preferred",
  "responsibility",
  "tool",
  "domain",
  "soft_skill",
  "language",
  "location",
  "seniority",
]);
const IMPROVEMENT_COVERAGES = new Set([
  "covered",
  "partially_covered",
  "missing",
  "unclear",
]);
const IMPROVEMENT_ACTIONS = new Set([
  "rewrite_existing_evidence",
  "move_existing_evidence",
  "add_keyword_to_existing_truth",
  "ask_user_for_confirmation",
  "do_not_add",
]);
const IMPROVEMENT_TRUTH_RISKS = new Set(["low", "medium", "high"]);
const IMPROVEMENT_SECTION_IDS = new Set([
  "header",
  "summary",
  "skills",
  "experience",
  "projects",
  "education",
  "certifications",
  "languages",
]);
const MATCH_TYPES = new Set(["exact", "phrase", "synonym", "semantic", "inferred"]);
const EVIDENCE_STRENGTHS = new Set(["strong", "medium", "weak"]);
const ATS_SEVERITIES = new Set(["info", "warning", "critical"]);
const USER_EVIDENCE_TYPES = new Set([
  "experience",
  "skill",
  "tool",
  "certification",
  "education",
  "language",
  "work_authorization",
  "location",
  "availability",
  "other",
]);
const DRAFT_STATUSES = new Set(["ready", "needs_review", "blocked"]);
const DRAFT_ITEM_TYPES = new Set([
  "header_line",
  "summary_bullet",
  "skills_line",
  "experience_bullet",
  "project_bullet",
  "credential_line",
  "language_line",
  "review_note",
]);
const DRAFT_SOURCE_LABELS = new Set([
  "cv_only",
  "user_confirmed_only",
  "mixed",
  "passthrough",
]);
const DRAFT_REVIEW_STATES = new Set(["ready", "needs_review", "dropped"]);
const DRAFT_POLISH_STATES = new Set([
  "not_requested",
  "validated",
  "unchanged",
  "rejected",
  "failed",
]);
const DRAFT_SECTION_IDS = new Set([
  "header",
  "summary",
  "skills",
  "experience",
  "projects",
  "education",
  "certifications",
  "languages",
  "review_notes",
]);
const DRAFT_VALIDATION_CATEGORIES = new Set([
  "unsupported_claim",
  "missing_requirement_support",
  "blocked_requirement",
  "unverified_metric",
  "unverified_years",
  "user_confirmed_only",
  "missing_anchor",
  "copy_excluded",
  "polish_rejected",
  "polish_failed",
]);

export function isPhase1AnalysisResult(
  value: unknown,
): value is Phase1AnalysisResult {
  if (!value || typeof value !== "object") return false;

  const result = value as Partial<Phase1AnalysisResult>;
  return (
    result.meta?.version === "phase1.v1" &&
    isEnumValue(ANALYZER_MODES, result.meta.mode) &&
    typeof result.meta.model === "string" &&
    typeof result.meta.generatedAt === "string" &&
    isStringArray(result.meta.warnings) &&
    isFiniteNumber(result.cv?.rawTextLength) &&
    isSectionArray(result.cv?.sections) &&
    Array.isArray(result.cv?.facts) &&
    result.cv.facts.every(isCandidateFact) &&
    typeof result.job?.title === "string" &&
    (!result.job.sourceUrl || typeof result.job.sourceUrl === "string") &&
    Array.isArray(result.job?.requirements) &&
    result.job.requirements.every(isJobRequirement) &&
    isFiniteNumber(result.matching?.supportedCount) &&
    isFiniteNumber(result.matching?.weakCount) &&
    isFiniteNumber(result.matching?.missingCount) &&
    isFiniteNumber(result.matching?.blockedCount) &&
    Array.isArray(result.ats?.warnings) &&
    result.ats.warnings.every(isAtsWarning) &&
    (!result.improvements || isRequirementImprovementResult(result.improvements)) &&
    isScoring(result.scoring)
  );
}

export function isTailoredDraftResult(
  value: unknown,
): value is TailoredDraftResult {
  if (!value || typeof value !== "object") return false;

  const result = value as Partial<TailoredDraftResult>;

  return (
    (result.meta?.version === "phase3.v1" ||
      result.meta?.version === "phase3b.v1") &&
    result.meta.mode === "local" &&
    typeof result.meta.generatedAt === "string" &&
    isStringArray(result.meta.warnings) &&
    (!result.meta.polish || isDraftPolishSummary(result.meta.polish)) &&
    isPhase1AnalysisResult(result.analysis) &&
    isEnumValue(DRAFT_STATUSES, result.draft?.status) &&
    Array.isArray(result.draft?.sections) &&
    result.draft.sections.every(
      (section) =>
        section &&
        typeof section === "object" &&
        isEnumValue(DRAFT_SECTION_IDS, section.id) &&
        typeof section.title === "string" &&
        Array.isArray(section.items) &&
        section.items.every(isTailoredDraftItem),
    ) &&
    typeof result.draft.copyText === "string" &&
    Array.isArray(result.validation?.issues) &&
    result.validation.issues.every(isDraftValidationIssue) &&
    isStringArray(result.validation?.blockedRequirementIds) &&
    isStringArray(result.validation?.missingHighImportanceRequirementIds) &&
    isFiniteNumber(result.validation?.userConfirmedOnlyItemCount) &&
    isFiniteNumber(result.validation?.droppedItemCount)
  );
}

function isDraftPolishSummary(value: unknown) {
  if (!value || typeof value !== "object") {
    return false;
  }

  const summary = value as Partial<TailoredDraftResult["meta"]["polish"]>;

  return (
    typeof summary?.attempted === "boolean" &&
    (!summary.model || typeof summary.model === "string") &&
    isFiniteNumber(summary.eligibleCount) &&
    isFiniteNumber(summary.polishedCount) &&
    isFiniteNumber(summary.rejectedCount) &&
    isFiniteNumber(summary.unchangedCount) &&
    isFiniteNumber(summary.failedCount)
  );
}

function isDraftPolishResult(value: unknown) {
  if (!value || typeof value !== "object") {
    return false;
  }

  const polish = value as Partial<
    NonNullable<
      TailoredDraftResult["draft"]["sections"][number]["items"][number]["polish"]
    >
  >;

  return (
    isEnumValue(DRAFT_POLISH_STATES, polish?.state) &&
    (!polish.polishedText || typeof polish.polishedText === "string") &&
    (!polish.model || typeof polish.model === "string") &&
    isStringArray(polish.notes) &&
    Array.isArray(polish.warnings) &&
    polish.warnings.every(isDraftValidationIssue)
  );
}

export function groundOpenAIAssist(
  jobText: string,
  assist: OpenAIAssistResult,
): GroundedOpenAIAssist {
  const groundedRequirements = assist.requirements
    .map((requirement) => {
      const anchorSnippet = normalizeText(requirement.anchorSnippet || requirement.text);
      const exactAnchors = findAnchor(
        jobText,
        anchorSnippet,
        "job",
        requirement.sourceSection,
      );
      const anchors = exactAnchors.length
        ? exactAnchors
        : findAnchor(jobText, requirement.text, "job", requirement.sourceSection);

      if (!anchors.length) {
        return null;
      }

      return {
        text: anchorSnippet,
        sourceSection: requirement.sourceSection,
        anchors,
      };
    })
    .filter((requirement): requirement is NonNullable<typeof requirement> => Boolean(requirement));

  const warnings = [...assist.warnings];

  if (assist.requirements.length && groundedRequirements.length !== assist.requirements.length) {
    warnings.push("Some OpenAI extraction hints were discarded because they could not be grounded in the job text.");
  }

  const groundedTitle = groundTitle(jobText, assist.title);

  return {
    title: groundedTitle,
    requirements: groundedRequirements,
    warnings,
  };
}

function groundTitle(jobText: string, title?: string) {
  const normalizedTitle = normalizeText(title ?? "");
  if (!normalizedTitle) return undefined;

  const anchors = findAnchor(jobText, normalizedTitle, "job");
  return anchors.length ? normalizedTitle : undefined;
}

function isDraftValidationIssue(value: unknown): value is DraftValidationIssue {
  if (!value || typeof value !== "object") {
    return false;
  }

  const issue = value as Partial<DraftValidationIssue>;

  return (
    typeof issue.id === "string" &&
    (!issue.itemId || typeof issue.itemId === "string") &&
    (issue.severity === "info" ||
      issue.severity === "warning" ||
      issue.severity === "critical") &&
    isEnumValue(DRAFT_VALIDATION_CATEGORIES, issue.category) &&
    typeof issue.message === "string" &&
    typeof issue.recommendation === "string"
  );
}

function isSectionArray(value: unknown): value is Phase1AnalysisResult["cv"]["sections"] {
  return (
    Array.isArray(value) &&
    value.every(
      (section) =>
        section &&
        typeof section === "object" &&
        typeof section.label === "string" &&
        typeof section.text === "string",
    )
  );
}

function isCandidateFact(value: unknown): value is CandidateFact {
  if (!value || typeof value !== "object") {
    return false;
  }

  const fact = value as Partial<CandidateFact>;

  return (
    typeof fact.id === "string" &&
    isEnumValue(EVIDENCE_SOURCES, fact.source) &&
    typeof fact.sourceSection === "string" &&
    typeof fact.text === "string" &&
    (!fact.role || typeof fact.role === "string") &&
    (!fact.company || typeof fact.company === "string") &&
    (!fact.dateRange || typeof fact.dateRange === "string") &&
    isStringArray(fact.skills) &&
    isStringArray(fact.tools) &&
    isStringArray(fact.metrics) &&
    isFiniteNumber(fact.confidence) &&
    Array.isArray(fact.anchors) &&
    fact.anchors.every(isTextAnchor) &&
    (!fact.requirementFingerprint || typeof fact.requirementFingerprint === "string") &&
    (!fact.userEvidenceType || isEnumValue(USER_EVIDENCE_TYPES, fact.userEvidenceType))
  );
}

function isTextAnchor(value: unknown): value is TextAnchor {
  if (!value || typeof value !== "object") {
    return false;
  }

  const anchor = value as Partial<TextAnchor>;

  return (
    (anchor.document === "cv" ||
      anchor.document === "job" ||
      anchor.document === "user") &&
    (!anchor.section || typeof anchor.section === "string") &&
    typeof anchor.snippet === "string" &&
    isFiniteNumber(anchor.start) &&
    isFiniteNumber(anchor.end)
  );
}

function isEvidenceMatch(value: unknown): value is EvidenceMatch {
  if (!value || typeof value !== "object") {
    return false;
  }

  const match = value as Partial<EvidenceMatch>;

  return (
    typeof match.id === "string" &&
    typeof match.requirementId === "string" &&
    typeof match.factId === "string" &&
    isEnumValue(EVIDENCE_SOURCES, match.evidenceSource) &&
    typeof match.matchedText === "string" &&
    isEnumValue(MATCH_TYPES, match.matchType) &&
    isEnumValue(EVIDENCE_STRENGTHS, match.strength) &&
    isFiniteNumber(match.score) &&
    typeof match.explanation === "string" &&
    Array.isArray(match.anchors) &&
    match.anchors.every(isTextAnchor)
  );
}

function isJobRequirement(value: unknown): value is JobRequirement {
  if (!value || typeof value !== "object") {
    return false;
  }

  const requirement = value as Partial<JobRequirement>;

  return (
    typeof requirement.id === "string" &&
    typeof requirement.text === "string" &&
    typeof requirement.fingerprint === "string" &&
    isEnumValue(REQUIREMENT_CATEGORIES, requirement.category) &&
    isImportance(requirement.importance) &&
    isStringArray(requirement.keywords) &&
    isStringArray(requirement.normalizedKeywords) &&
    Array.isArray(requirement.matchedEvidence) &&
    requirement.matchedEvidence.every(isEvidenceMatch) &&
    isEnumValue(EVIDENCE_STATUSES, requirement.evidenceStatus) &&
    typeof requirement.confidenceReason === "string" &&
    (!requirement.sourceSection || typeof requirement.sourceSection === "string") &&
    Array.isArray(requirement.anchors) &&
    requirement.anchors.every(isTextAnchor)
  );
}

function isAtsWarning(value: unknown): value is ATSHygieneWarning {
  if (!value || typeof value !== "object") {
    return false;
  }

  const warning = value as Partial<ATSHygieneWarning>;

  return (
    typeof warning.id === "string" &&
    isEnumValue(ATS_SEVERITIES, warning.severity) &&
    typeof warning.category === "string" &&
    typeof warning.message === "string" &&
    typeof warning.recommendation === "string"
  );
}

function isScoring(value: unknown): value is Phase1AnalysisResult["scoring"] {
  if (!value || typeof value !== "object") {
    return false;
  }

  const scoring = value as Partial<Phase1AnalysisResult["scoring"]>;
  const breakdown = scoring.breakdown;

  return (
    isFiniteNumber(scoring.atsParseScore) &&
    isFiniteNumber(scoring.jobMatchScore) &&
    isFiniteNumber(scoring.evidenceConfidenceScore) &&
    isFiniteNumber(scoring.overallReadinessScore) &&
    Boolean(breakdown) &&
    isFiniteNumber(breakdown?.totalRequirementWeight) &&
    isFiniteNumber(breakdown?.supportedWeight) &&
    isFiniteNumber(breakdown?.weakWeight) &&
    isFiniteNumber(breakdown?.missingWeight) &&
    isFiniteNumber(breakdown?.blockedWeight) &&
    isFiniteNumber(breakdown?.blockedHardBlockerPenalty) &&
    isFiniteNumber(breakdown?.atsPenalty)
  );
}

function isRequirementImprovementResult(
  value: unknown,
): value is NonNullable<Phase1AnalysisResult["improvements"]> {
  if (!value || typeof value !== "object") {
    return false;
  }

  const result = value as NonNullable<Phase1AnalysisResult["improvements"]>;

  return (
    Boolean(result.summary) &&
    isFiniteNumber(result.summary.coveredCount) &&
    isFiniteNumber(result.summary.partiallyCoveredCount) &&
    isFiniteNumber(result.summary.missingCount) &&
    isFiniteNumber(result.summary.unclearCount) &&
    isFiniteNumber(result.summary.lowRiskCount) &&
    isFiniteNumber(result.summary.mediumRiskCount) &&
    isFiniteNumber(result.summary.highRiskCount) &&
    isFiniteNumber(result.summary.confirmationQuestionCount) &&
    Array.isArray(result.requirements) &&
    result.requirements.every(isRequirementImprovementDecision) &&
    Array.isArray(result.sectionGroups) &&
    result.sectionGroups.every(isRequirementImprovementSectionGroup) &&
    Array.isArray(result.questions) &&
    result.questions.every(isRequirementImprovementQuestion)
  );
}

function isRequirementImprovementDecision(
  value: unknown,
): value is NonNullable<Phase1AnalysisResult["improvements"]>["requirements"][number] {
  if (!value || typeof value !== "object") {
    return false;
  }

  const decision = value as NonNullable<
    Phase1AnalysisResult["improvements"]
  >["requirements"][number];

  return (
    typeof decision.requirementId === "string" &&
    typeof decision.requirementText === "string" &&
    isEnumValue(IMPROVEMENT_FACETS, decision.facet) &&
    isEnumValue(IMPROVEMENT_COVERAGES, decision.coverage) &&
    isEnumValue(IMPROVEMENT_ACTIONS, decision.action) &&
    (!decision.targetSectionId || isEnumValue(IMPROVEMENT_SECTION_IDS, decision.targetSectionId)) &&
    typeof decision.reason === "string" &&
    isStringArray(decision.evidenceIds) &&
    isStringArray(decision.evidenceSnippets) &&
    isStringArray(decision.keywordsAdded) &&
    isEnumValue(IMPROVEMENT_TRUTH_RISKS, decision.truthRisk) &&
    (!decision.questionId || typeof decision.questionId === "string") &&
    (!decision.suggestionId || typeof decision.suggestionId === "string")
  );
}

function isRequirementImprovementSectionGroup(
  value: unknown,
): value is NonNullable<Phase1AnalysisResult["improvements"]>["sectionGroups"][number] {
  if (!value || typeof value !== "object") {
    return false;
  }

  const group = value as NonNullable<
    Phase1AnalysisResult["improvements"]
  >["sectionGroups"][number];

  return (
    isEnumValue(IMPROVEMENT_SECTION_IDS, group.sectionId) &&
    typeof group.title === "string" &&
    Array.isArray(group.suggestions) &&
    group.suggestions.every(isRequirementImprovementSuggestion)
  );
}

function isRequirementImprovementSuggestion(
  value: unknown,
): value is NonNullable<Phase1AnalysisResult["improvements"]>["sectionGroups"][number]["suggestions"][number] {
  if (!value || typeof value !== "object") {
    return false;
  }

  const suggestion = value as NonNullable<
    Phase1AnalysisResult["improvements"]
  >["sectionGroups"][number]["suggestions"][number];

  return (
    typeof suggestion.id === "string" &&
    typeof suggestion.requirementId === "string" &&
    typeof suggestion.requirementText === "string" &&
    isEnumValue(IMPROVEMENT_SECTION_IDS, suggestion.targetSectionId) &&
    typeof suggestion.originalText === "string" &&
    typeof suggestion.suggestedText === "string" &&
    (suggestion.action === "rewrite_existing_evidence" ||
      suggestion.action === "move_existing_evidence" ||
      suggestion.action === "add_keyword_to_existing_truth") &&
    typeof suggestion.reason === "string" &&
    isStringArray(suggestion.cvEvidenceIds) &&
    isStringArray(suggestion.cvEvidenceSnippets) &&
    isStringArray(suggestion.keywordsAdded) &&
    isEnumValue(IMPROVEMENT_TRUTH_RISKS, suggestion.truthRisk) &&
    isEnumValue(IMPROVEMENT_COVERAGES, suggestion.coverage)
  );
}

function isRequirementImprovementQuestion(
  value: unknown,
): value is NonNullable<Phase1AnalysisResult["improvements"]>["questions"][number] {
  if (!value || typeof value !== "object") {
    return false;
  }

  const question = value as NonNullable<
    Phase1AnalysisResult["improvements"]
  >["questions"][number];

  return (
    typeof question.id === "string" &&
    typeof question.requirementId === "string" &&
    typeof question.requirementText === "string" &&
    isEnumValue(IMPROVEMENT_FACETS, question.facet) &&
    typeof question.prompt === "string" &&
    isEnumValue(USER_EVIDENCE_TYPES, question.suggestedEvidenceType) &&
    typeof question.reason === "string" &&
    isEnumValue(IMPROVEMENT_TRUTH_RISKS, question.truthRisk) &&
    (!question.recommendedTargetSectionId ||
      isEnumValue(IMPROVEMENT_SECTION_IDS, question.recommendedTargetSectionId))
  );
}

function isTailoredDraftItem(
  value: unknown,
): value is TailoredDraftResult["draft"]["sections"][number]["items"][number] {
  if (!value || typeof value !== "object") {
    return false;
  }

  const item = value as Partial<
    TailoredDraftResult["draft"]["sections"][number]["items"][number]
  >;

  return (
    typeof item.id === "string" &&
    isEnumValue(DRAFT_ITEM_TYPES, item.type) &&
    typeof item.text === "string" &&
    isStringArray(item.evidenceIds) &&
    isStringArray(item.requirementIds) &&
    isEnumValue(DRAFT_SOURCE_LABELS, item.sourceLabel) &&
    isEnumValue(DRAFT_REVIEW_STATES, item.reviewState) &&
    Array.isArray(item.warnings) &&
    item.warnings.every(isDraftValidationIssue) &&
    (!item.polish || isDraftPolishResult(item.polish))
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isImportance(value: unknown): value is JobRequirement["importance"] {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isEnumValue(values: Set<string>, value: unknown): value is string {
  return typeof value === "string" && values.has(value);
}
