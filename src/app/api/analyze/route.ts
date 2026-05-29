import { NextResponse } from "next/server";
import {
  DEFAULT_JSON_BODY_LIMIT_BYTES,
  getSafeRouteErrorDetails,
  readJsonWithLimit,
} from "@/lib/api-guards";
import {
  hasValidAnalyzeInput,
  prepareAnalyzePayload,
  runPhase1Analysis,
} from "@/lib/analysis-service";
import type { AnalyzeRequest } from "@/lib/types";

export async function POST(request: Request) {
  let body: Partial<AnalyzeRequest>;

  try {
    body = await readJsonWithLimit<Partial<AnalyzeRequest>>(
      request,
      DEFAULT_JSON_BODY_LIMIT_BYTES,
    );
  } catch (error) {
    const details = getSafeRouteErrorDetails(
      error,
      "Could not read the analysis request.",
      400,
    );

    return NextResponse.json({ error: details.message }, { status: details.status });
  }

  try {
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
      { error: "Could not analyze the CV and job description right now." },
      { status: 500 },
    );
  }
}
