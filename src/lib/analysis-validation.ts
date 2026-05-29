import { findAnchor, normalizeText } from "@/lib/analysis-utils";
import type {
  DraftValidationIssue,
  GroundedOpenAIAssist,
  OpenAIAssistResult,
  Phase1AnalysisResult,
  TailoredDraftResult,
} from "@/lib/types";

export function isPhase1AnalysisResult(
  value: unknown,
): value is Phase1AnalysisResult {
  if (!value || typeof value !== "object") return false;

  const result = value as Partial<Phase1AnalysisResult>;
  return (
    result.meta?.version === "phase1.v1" &&
    Array.isArray(result.cv?.sections) &&
    Array.isArray(result.cv?.facts) &&
    result.cv.facts.every(
      (fact) =>
        fact &&
        typeof fact === "object" &&
        (fact.source === "cv" || fact.source === "user_confirmed"),
    ) &&
    Array.isArray(result.job?.requirements) &&
    result.job.requirements.every(
      (requirement) =>
        requirement &&
        typeof requirement === "object" &&
        typeof requirement.fingerprint === "string" &&
        Array.isArray(requirement.matchedEvidence) &&
        requirement.matchedEvidence.every(
          (match) =>
            match &&
            typeof match === "object" &&
            (match.evidenceSource === "cv" ||
              match.evidenceSource === "user_confirmed"),
        ),
    ) &&
    Array.isArray(result.ats?.warnings)
  );
}

export function isTailoredDraftResult(
  value: unknown,
): value is TailoredDraftResult {
  if (!value || typeof value !== "object") return false;

  const result = value as Partial<TailoredDraftResult>;

  return (
    result.meta?.version === "phase3.v1" &&
    result.meta.mode === "local" &&
    isPhase1AnalysisResult(result.analysis) &&
    Array.isArray(result.draft?.sections) &&
    result.draft.sections.every(
      (section) =>
        section &&
        typeof section === "object" &&
        typeof section.id === "string" &&
        typeof section.title === "string" &&
        Array.isArray(section.items) &&
        section.items.every(
          (item) =>
            item &&
            typeof item === "object" &&
            typeof item.id === "string" &&
            typeof item.type === "string" &&
            typeof item.text === "string" &&
            Array.isArray(item.evidenceIds) &&
            Array.isArray(item.requirementIds) &&
            typeof item.sourceLabel === "string" &&
            typeof item.reviewState === "string" &&
            Array.isArray(item.warnings) &&
            item.warnings.every(isDraftValidationIssue),
        ),
    ) &&
    typeof result.draft.copyText === "string" &&
    Array.isArray(result.validation?.issues) &&
    result.validation.issues.every(isDraftValidationIssue) &&
    Array.isArray(result.validation?.blockedRequirementIds) &&
    Array.isArray(result.validation?.missingHighImportanceRequirementIds) &&
    typeof result.validation?.userConfirmedOnlyItemCount === "number" &&
    typeof result.validation?.droppedItemCount === "number"
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
    typeof issue.category === "string" &&
    typeof issue.message === "string" &&
    typeof issue.recommendation === "string"
  );
}
