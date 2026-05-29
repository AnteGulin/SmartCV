import { groundOpenAIAssist } from "@/lib/analysis-validation";
import { analyzeLocally } from "@/lib/local-analyzer";
import { analyzeWithOpenAI } from "@/lib/openai-analyzer";
import { sanitizeUserConfirmedEvidence } from "@/lib/user-evidence";
import type {
  AnalyzeRequest,
  Phase1AnalysisResult,
  UserConfirmedEvidence,
} from "@/lib/types";

export type PreparedAnalyzePayload = AnalyzeRequest & {
  confirmedEvidence: UserConfirmedEvidence[];
};

export function prepareAnalyzePayload(body: Partial<AnalyzeRequest>): {
  ignoredConfirmationCount: number;
  payload: PreparedAnalyzePayload;
} {
  const cvText = String(body.cvText ?? "").trim();
  const jobText = String(body.jobText ?? "").trim();
  const jobUrl = String(body.jobUrl ?? "").trim();
  const confirmedEvidence = sanitizeUserConfirmedEvidence(body.confirmedEvidence);
  const ignoredConfirmationCount = Array.isArray(body.confirmedEvidence)
    ? body.confirmedEvidence.length - confirmedEvidence.length
    : 0;

  return {
    ignoredConfirmationCount,
    payload: {
      cvText: cvText.slice(0, 60000),
      jobText: jobText.slice(0, 60000),
      jobUrl,
      forceLocal: Boolean(body.forceLocal),
      confirmedEvidence,
    },
  };
}

export function hasValidAnalyzeInput(payload: AnalyzeRequest) {
  return payload.cvText.trim().length >= 80 && payload.jobText.trim().length >= 80;
}

export async function runPhase1Analysis(
  payload: PreparedAnalyzePayload,
  ignoredConfirmationCount = 0,
): Promise<Phase1AnalysisResult> {
  const confirmationWarnings =
    ignoredConfirmationCount > 0
      ? [
          "Some saved user confirmations were ignored because they were empty, too vague, or invalid.",
        ]
      : [];

  if (!payload.forceLocal && process.env.OPENAI_API_KEY) {
    try {
      const assist = await analyzeWithOpenAI(payload);
      const groundedAssist = groundOpenAIAssist(payload.jobText, assist);
      const warnings = [
        ...confirmationWarnings,
        ...groundedAssist.warnings,
        groundedAssist.requirements.length
          ? "OpenAI provided grounded extraction hints. The deterministic local engine remained the source of truth."
          : "OpenAI returned no grounded extraction hints, so deterministic local extraction was used.",
      ];

      return analyzeLocally(payload.cvText, payload.jobText, payload.jobUrl, {
        assistant: groundedAssist,
        confirmedEvidence: payload.confirmedEvidence,
        mode: groundedAssist.requirements.length ? "openai" : "local",
        model: groundedAssist.requirements.length
          ? `${assist.model} + local-deterministic-evidence-engine`
          : "local-deterministic-evidence-engine",
        warnings,
      });
    } catch {
      return analyzeLocally(payload.cvText, payload.jobText, payload.jobUrl, {
        warnings: [
          ...confirmationWarnings,
          "OpenAI assist failed, so deterministic local analysis was used.",
        ],
        confirmedEvidence: payload.confirmedEvidence,
      });
    }
  }

  const warnings =
    payload.forceLocal && process.env.OPENAI_API_KEY
      ? [...confirmationWarnings, "Local analyzer mode is enabled, so OpenAI extraction was skipped."]
      : !process.env.OPENAI_API_KEY
        ? [
            ...confirmationWarnings,
            "OpenAI assist is unavailable, so deterministic local analysis was used.",
          ]
        : confirmationWarnings;

  return analyzeLocally(payload.cvText, payload.jobText, payload.jobUrl, {
    confirmedEvidence: payload.confirmedEvidence,
    warnings,
  });
}
