import OpenAI from "openai";
import type {
  AnalyzeRequest,
  DraftPolishCandidate,
  OpenAIDraftPolishResult,
  OpenAIAssistResult,
} from "@/lib/types";

export const DEFAULT_OPENAI_MODEL = "gpt-5.4-mini";

const assistSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "requirements", "warnings"],
  properties: {
    title: { type: "string" },
    requirements: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "sourceSection", "anchorSnippet"],
        properties: {
          text: { type: "string" },
          sourceSection: { type: ["string", "null"] },
          anchorSnippet: { type: "string" },
        },
      },
    },
    warnings: {
      type: "array",
      items: { type: "string" },
    },
  },
} as const;

const polishSchema = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "polishedText", "changedMeaning", "notes"],
        properties: {
          id: { type: "string" },
          polishedText: { type: "string" },
          changedMeaning: { type: "boolean" },
          notes: {
            type: "array",
            items: { type: "string" },
          },
        },
      },
    },
  },
} as const;

export async function analyzeWithOpenAI(
  request: AnalyzeRequest,
): Promise<OpenAIAssistResult> {
  const model = process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL;
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const response = await client.responses.create({
    model,
    input: [
      {
        role: "system",
        content: [
          "You assist SmartCV with extraction only.",
          "Extract explicit job requirements, qualifications, tools, responsibilities, and hard blockers from the job text.",
          "Look especially at sections such as requirements, qualifications, minimum qualifications, preferred qualifications, what you will do, about you, you have, and skills and experience.",
          "Never invent experience or rewrite the CV.",
          "For every extracted requirement, provide an anchorSnippet copied from the job text.",
          "Keep requirement text short, faithful, and recruiter-readable.",
          "Ignore benefits, company marketing, application instructions, privacy/legal text, and equal-opportunity boilerplate.",
          "If you are unsure, omit the item instead of guessing.",
        ].join(" "),
      },
      {
        role: "user",
        content: JSON.stringify({
          task: "Extract grounded requirement hints from this job posting.",
          jobUrl: request.jobUrl || "",
          jobText: request.jobText,
        }),
      },
    ],
    max_output_tokens: 2500,
    text: {
      format: {
        type: "json_schema",
        name: "smartcv_phase1_assist",
        strict: true,
        schema: assistSchema,
      },
    },
  });

  const text = response.output_text;
  if (!text) {
    throw new Error("OpenAI returned no extraction output.");
  }

  const parsed = JSON.parse(text) as Omit<OpenAIAssistResult, "model">;

  return {
    model,
    title: parsed.title,
    requirements: (parsed.requirements ?? []).map((requirement) => ({
      text: requirement.text,
      sourceSection:
        typeof requirement.sourceSection === "string"
          ? requirement.sourceSection
          : undefined,
      anchorSnippet: requirement.anchorSnippet,
    })),
    warnings: parsed.warnings ?? [],
  };
}

export async function polishDraftItemsWithOpenAI(
  candidates: DraftPolishCandidate[],
): Promise<OpenAIDraftPolishResult> {
  const model = process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL;
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const response = await client.responses.create({
    model,
    input: [
      {
        role: "system",
        content: [
          "You assist SmartCV with wording polish only.",
          "You may improve grammar, clarity, concision, and recruiter readability for already-safe CV bullets.",
          "Keep meaning unchanged and preserve the deterministic source of truth.",
          "Use only the provided item text, evidence snippets, requirement snippets, and allowed terms.",
          "Do not add or invent companies, roles, dates, tools, metrics, certifications, languages, locations, work authorization, clearance, licenses, seniority, or years of experience.",
          "Do not add numbers or make claims stronger.",
          "Do not mention missing or blocked requirements.",
          "If you are unsure, return the original text unchanged.",
          "Return strict JSON only.",
        ].join(" "),
      },
      {
        role: "user",
        content: JSON.stringify({
          task: "Polish the wording of these already-safe deterministic CV draft items without changing meaning.",
          items: candidates,
        }),
      },
    ],
    max_output_tokens: 3000,
    text: {
      format: {
        type: "json_schema",
        name: "smartcv_phase3b_polish",
        strict: true,
        schema: polishSchema,
      },
    },
  });

  const text = response.output_text;
  if (!text) {
    throw new Error("OpenAI returned no polish output.");
  }

  const parsed = JSON.parse(text) as Omit<OpenAIDraftPolishResult, "model">;

  return {
    model,
    items: parsed.items ?? [],
  };
}

// TODO(phase1b): Let OpenAI suggest grounded CV fact hints too, but only after
// deterministic anchor validation is in place for both job and CV excerpts.
