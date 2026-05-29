import { NextResponse } from "next/server";
import { groundOpenAIAssist } from "@/lib/analysis-validation";
import { analyzeLocally } from "@/lib/local-analyzer";
import { analyzeWithOpenAI } from "@/lib/openai-analyzer";
import type { AnalyzeRequest } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<AnalyzeRequest>;
    const cvText = String(body.cvText ?? "").trim();
    const jobText = String(body.jobText ?? "").trim();
    const jobUrl = String(body.jobUrl ?? "").trim();

    if (cvText.length < 80 || jobText.length < 80) {
      return NextResponse.json(
        {
          error:
            "Paste a CV and a job description with enough text to analyze.",
        },
        { status: 400 },
      );
    }

    const payload: AnalyzeRequest = {
      cvText: cvText.slice(0, 60000),
      jobText: jobText.slice(0, 60000),
      jobUrl,
      forceLocal: Boolean(body.forceLocal),
    };

    if (!payload.forceLocal && process.env.OPENAI_API_KEY) {
      try {
        const assist = await analyzeWithOpenAI(payload);
        const groundedAssist = groundOpenAIAssist(payload.jobText, assist);
        const warnings = [
          ...groundedAssist.warnings,
          groundedAssist.requirements.length
            ? "OpenAI provided grounded extraction hints. The deterministic local engine remained the source of truth."
            : "OpenAI returned no grounded extraction hints, so deterministic local extraction was used.",
        ];
        const result = analyzeLocally(payload.cvText, payload.jobText, payload.jobUrl, {
          assistant: groundedAssist,
          mode: groundedAssist.requirements.length ? "openai" : "local",
          model: groundedAssist.requirements.length
            ? `${assist.model} + local-deterministic-evidence-engine`
            : "local-deterministic-evidence-engine",
          warnings,
        });
        return NextResponse.json(result);
      } catch {
        const result = analyzeLocally(payload.cvText, payload.jobText, payload.jobUrl, {
          warnings: [
            "OpenAI assist failed, so deterministic local analysis was used.",
          ],
        });
        return NextResponse.json(result);
      }
    }

    const warnings =
      payload.forceLocal && process.env.OPENAI_API_KEY
        ? ["Local analyzer mode is enabled, so OpenAI extraction was skipped."]
        : !process.env.OPENAI_API_KEY
          ? ["OpenAI assist is unavailable, so deterministic local analysis was used."]
          : [];

    return NextResponse.json(
      analyzeLocally(payload.cvText, payload.jobText, payload.jobUrl, {
        warnings,
      }),
    );
  } catch {
    return NextResponse.json(
      { error: "Could not read the analysis request." },
      { status: 400 },
    );
  }
}
