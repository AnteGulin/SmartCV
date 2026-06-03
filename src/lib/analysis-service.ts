import { groundOpenAIAssist } from "@/lib/analysis-validation";
import { analyzeLocally } from "@/lib/local-analyzer";
import { analyzeWithOpenAI, DEFAULT_OPENAI_MODEL } from "@/lib/openai-analyzer";
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

function logOpenAIAssistFailure(error: unknown) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  const details = getOpenAIAssistErrorDetails(error);

  console.error("SmartCV analyzeWithOpenAI failed:", {
    model: process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL,
    ...details,
  });
}

function getOpenAIAssistErrorDetails(error: unknown) {
  if (!(error instanceof Error)) {
    return {
      code: undefined,
      message: "Unknown non-Error throw value.",
      name: "NonErrorThrown",
      status: undefined,
      type: undefined,
    };
  }

  const candidate = error as Error & {
    code?: unknown;
    status?: unknown;
    type?: unknown;
  };

  return {
    code: typeof candidate.code === "string" ? candidate.code : undefined,
    message: error.message,
    name: error.name,
    status: typeof candidate.status === "number" ? candidate.status : undefined,
    type: typeof candidate.type === "string" ? candidate.type : undefined,
  };
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
    } catch (error) {
      logOpenAIAssistFailure(error);

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
