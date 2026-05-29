import { findAnchor, normalizeText } from "@/lib/analysis-utils";
import type {
  GroundedOpenAIAssist,
  OpenAIAssistResult,
  Phase1AnalysisResult,
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
    Array.isArray(result.job?.requirements) &&
    Array.isArray(result.ats?.warnings)
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
