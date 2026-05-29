import { NextResponse } from "next/server";
import {
  hasValidAnalyzeInput,
  prepareAnalyzePayload,
  runPhase1Analysis,
} from "@/lib/analysis-service";
import type { AnalyzeRequest } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<AnalyzeRequest>;
    const { ignoredConfirmationCount, payload } = prepareAnalyzePayload(body);

    if (!hasValidAnalyzeInput(payload)) {
      return NextResponse.json(
        {
          error:
            "Paste a CV and a job description with enough text to analyze.",
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      await runPhase1Analysis(payload, ignoredConfirmationCount),
    );
  } catch {
    return NextResponse.json(
      { error: "Could not read the analysis request." },
      { status: 400 },
    );
  }
}
