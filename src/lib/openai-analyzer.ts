import OpenAI from "openai";
import type { AnalysisResult, AnalyzeRequest } from "@/lib/types";

export const DEFAULT_OPENAI_MODEL = "gpt-5.4-mini";

const analysisSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "meta",
    "parser",
    "job",
    "keywordCoverage",
    "evidenceMap",
    "layers",
    "gaps",
    "atsRisks",
    "finalDraft",
  ],
  properties: {
    meta: {
      type: "object",
      additionalProperties: false,
      required: ["mode", "model", "generatedAt", "warning"],
      properties: {
        mode: { type: "string", enum: ["openai", "local"] },
        model: { type: "string" },
        generatedAt: { type: "string" },
        warning: { type: "string" },
      },
    },
    parser: {
      type: "object",
      additionalProperties: false,
      required: ["readiness", "signals"],
      properties: {
        readiness: { type: "number" },
        signals: {
          type: "array",
          items: { $ref: "#/$defs/parserSignal" },
        },
      },
    },
    job: {
      type: "object",
      additionalProperties: false,
      required: [
        "title",
        "seniority",
        "requiredSkills",
        "preferredSkills",
        "responsibilities",
        "tools",
        "keywords",
      ],
      properties: {
        title: { type: "string" },
        seniority: { type: "string" },
        requiredSkills: { type: "array", items: { type: "string" } },
        preferredSkills: { type: "array", items: { type: "string" } },
        responsibilities: { type: "array", items: { type: "string" } },
        tools: { type: "array", items: { type: "string" } },
        keywords: { type: "array", items: { type: "string" } },
      },
    },
    keywordCoverage: {
      type: "object",
      additionalProperties: false,
      required: ["matched", "weak", "missing"],
      properties: {
        matched: { type: "array", items: { type: "string" } },
        weak: { type: "array", items: { type: "string" } },
        missing: { type: "array", items: { type: "string" } },
      },
    },
    evidenceMap: {
      type: "array",
      items: { $ref: "#/$defs/evidenceItem" },
    },
    layers: {
      type: "array",
      items: { $ref: "#/$defs/layer" },
    },
    gaps: {
      type: "array",
      items: { $ref: "#/$defs/gap" },
    },
    atsRisks: {
      type: "array",
      items: { $ref: "#/$defs/atsRisk" },
    },
    finalDraft: { type: "string" },
  },
  $defs: {
    parserSignal: {
      type: "object",
      additionalProperties: false,
      required: ["label", "value", "level"],
      properties: {
        label: { type: "string" },
        value: { type: "string" },
        level: { type: "string", enum: ["good", "warning", "danger"] },
      },
    },
    evidenceItem: {
      type: "object",
      additionalProperties: false,
      required: ["requirement", "evidence", "confidence", "action"],
      properties: {
        requirement: { type: "string" },
        evidence: { type: "string" },
        confidence: { type: "string", enum: ["high", "medium", "low"] },
        action: {
          type: "string",
          enum: ["rewrite", "keep", "user_confirm"],
        },
      },
    },
    layer: {
      type: "object",
      additionalProperties: false,
      required: [
        "id",
        "label",
        "segment",
        "original",
        "suggested",
        "rationale",
        "evidence",
        "confidence",
        "keywords",
        "status",
      ],
      properties: {
        id: { type: "string" },
        label: { type: "string" },
        segment: {
          type: "string",
          enum: [
            "headline",
            "summary",
            "experience",
            "skills",
            "education",
            "format",
          ],
        },
        original: { type: "string" },
        suggested: { type: "string" },
        rationale: { type: "string" },
        evidence: { type: "array", items: { type: "string" } },
        confidence: { type: "string", enum: ["high", "medium", "low"] },
        keywords: { type: "array", items: { type: "string" } },
        status: {
          type: "string",
          enum: ["ready", "needs_review", "blocked"],
        },
      },
    },
    gap: {
      type: "object",
      additionalProperties: false,
      required: ["requirement", "reason", "userAction"],
      properties: {
        requirement: { type: "string" },
        reason: { type: "string" },
        userAction: { type: "string" },
      },
    },
    atsRisk: {
      type: "object",
      additionalProperties: false,
      required: ["area", "level", "issue", "fix"],
      properties: {
        area: { type: "string" },
        level: { type: "string", enum: ["good", "warning", "danger"] },
        issue: { type: "string" },
        fix: { type: "string" },
      },
    },
  },
} as const;

export async function analyzeWithOpenAI(
  request: AnalyzeRequest,
): Promise<AnalysisResult> {
  const model = process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL;
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const response = await client.responses.create({
    model,
    input: [
      {
        role: "system",
        content: [
          "You are the backend analysis engine for SmartCV, an evidence-based CV tailoring studio.",
          "Your job is to parse a CV and a job description into editable layers.",
          "Never invent experience, dates, companies, tools, certifications, education, or metrics.",
          "If the CV does not prove a requirement, mark it as a gap or blocked layer.",
          "Prefer exact job language only when there is CV evidence.",
          "Write suggested CV text in a natural, human, ATS-readable style.",
          "Keep outputs concise enough for a recruiter-facing CV.",
        ].join(" "),
      },
      {
        role: "user",
        content: JSON.stringify({
          task: "Analyze and tailor this CV against the job description.",
          jobUrl: request.jobUrl || "",
          cvText: request.cvText,
          jobText: request.jobText,
        }),
      },
    ],
    max_output_tokens: 7000,
    text: {
      format: {
        type: "json_schema",
        name: "cv_tailoring_analysis",
        strict: true,
        schema: analysisSchema,
      },
    },
  });

  const text = response.output_text;
  if (!text) {
    throw new Error("OpenAI returned no structured output.");
  }

  const parsed = JSON.parse(text) as AnalysisResult;

  return {
    ...parsed,
    meta: {
      ...parsed.meta,
      mode: "openai",
      model,
      generatedAt: new Date().toISOString(),
    },
  };
}
