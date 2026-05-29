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
import { composeDeterministicDraft } from "@/lib/draft-composer";
import { validateDeterministicDraft } from "@/lib/draft-validation";
import type { TailorRequest, TailoredDraftResult } from "@/lib/types";

export async function POST(request: Request) {
  let body: Partial<TailorRequest>;

  try {
    body = await readJsonWithLimit<Partial<TailorRequest>>(
      request,
      DEFAULT_JSON_BODY_LIMIT_BYTES,
    );
  } catch (error) {
    const details = getSafeRouteErrorDetails(
      error,
      "Could not read the tailoring request.",
      400,
    );

    return NextResponse.json(
      { error: details.message },
      { status: details.status },
    );
  }

  const { ignoredConfirmationCount, payload } = prepareAnalyzePayload(body);

  if (!hasValidAnalyzeInput(payload)) {
    return NextResponse.json(
      {
        error:
          "Paste a CV and a job description with enough text to generate a tailored draft.",
      },
      { status: 400 },
    );
  }

  try {
    const analysis = await runPhase1Analysis(payload, ignoredConfirmationCount);
    const composedDraft = composeDeterministicDraft(analysis);
    const validatedDraft = validateDeterministicDraft(
      analysis,
      composedDraft.sections,
      composedDraft.warnings,
    );
    const result: TailoredDraftResult = {
      meta: {
        version: "phase3.v1",
        generatedAt: new Date().toISOString(),
        mode: "local",
        warnings: validatedDraft.warnings,
      },
      analysis,
      draft: validatedDraft.draft,
      validation: validatedDraft.validation,
    };

    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "Could not generate a tailored draft right now." },
      { status: 500 },
    );
  }
}
