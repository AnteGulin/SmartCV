import OpenAI from "openai";
import type { AnalyzeRequest, OpenAIAssistResult } from "@/lib/types";

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
        required: ["text", "anchorSnippet"],
        properties: {
          text: { type: "string" },
          sourceSection: { type: "string" },
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
    requirements: parsed.requirements ?? [],
    warnings: parsed.warnings ?? [],
  };
}

// TODO(phase1b): Let OpenAI suggest grounded CV fact hints too, but only after
// deterministic anchor validation is in place for both job and CV excerpts.
