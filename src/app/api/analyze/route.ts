import { NextResponse } from "next/server";
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
        const result = await analyzeWithOpenAI(payload);
        return NextResponse.json(result);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown OpenAI error.";
        const result = analyzeLocally(
          payload.cvText,
          payload.jobText,
          payload.jobUrl,
          `OpenAI analysis failed, so the local analyzer ran instead. ${message}`,
        );
        return NextResponse.json(result);
      }
    }

    return NextResponse.json(
      analyzeLocally(payload.cvText, payload.jobText, payload.jobUrl),
    );
  } catch {
    return NextResponse.json(
      { error: "Could not read the analysis request." },
      { status: 400 },
    );
  }
}
