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
import {
  applyValidatedDraftPolish,
  buildDraftPolishCandidates,
  markFailedDraftPolish,
  validateDeterministicDraft,
  withDraftPolishSummary,
} from "@/lib/draft-validation";
import { polishDraftItemsWithOpenAI } from "@/lib/openai-analyzer";
import type { PolishDraftRequest, TailoredDraftResult } from "@/lib/types";

const MAX_POLISH_ITEMS = 10;

export async function POST(request: Request) {
  let body: Partial<PolishDraftRequest>;

  try {
    body = await readJsonWithLimit<Partial<PolishDraftRequest>>(
      request,
      DEFAULT_JSON_BODY_LIMIT_BYTES,
    );
  } catch (error) {
    const details = getSafeRouteErrorDetails(
      error,
      "Could not read the polish request.",
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
          "Paste a CV and a job description with enough text to polish a tailored draft.",
      },
      { status: 400 },
    );
  }

  const requestedItemIds = Array.isArray(body.itemIds)
    ? [
        ...new Set(
          body.itemIds
            .filter(
              (itemId): itemId is string =>
                typeof itemId === "string" && itemId.trim().length > 0,
            )
            .map((itemId) => itemId.trim()),
        ),
      ]
        .slice(0, MAX_POLISH_ITEMS)
    : undefined;
  const routeWarnings: string[] = [];

  if (Array.isArray(body.itemIds) && body.itemIds.length > MAX_POLISH_ITEMS) {
    routeWarnings.push(
      `Only the first ${MAX_POLISH_ITEMS} eligible draft items were sent for wording polish to keep the request bounded.`,
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
    const baseResult: TailoredDraftResult = {
      meta: {
        version: "phase3b.v1",
        generatedAt: new Date().toISOString(),
        mode: "local",
        warnings: validatedDraft.warnings,
      },
      analysis,
      draft: validatedDraft.draft,
      validation: validatedDraft.validation,
    };
    const candidates = buildDraftPolishCandidates(
      baseResult,
      requestedItemIds,
      MAX_POLISH_ITEMS,
    );

    if (!candidates.length) {
      return NextResponse.json(
        withDraftPolishSummary(
          baseResult,
          {
            attempted: false,
            eligibleCount: 0,
            polishedCount: 0,
            rejectedCount: 0,
            unchangedCount: 0,
            failedCount: 0,
          },
          [
            ...routeWarnings,
            "No eligible CV-backed experience or project bullets were available for OpenAI wording polish.",
          ],
        ),
      );
    }

    const eligibleItemIds = candidates.map((candidate) => candidate.id);

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        markFailedDraftPolish(
          baseResult,
          eligibleItemIds,
          "OpenAI wording polish is unavailable, so SmartCV kept the deterministic wording.",
          undefined,
          routeWarnings,
        ),
      );
    }

    try {
      const polishResult = await polishDraftItemsWithOpenAI(candidates);

      return NextResponse.json(
        applyValidatedDraftPolish(
          baseResult,
          polishResult.items,
          polishResult.model,
          routeWarnings,
          eligibleItemIds,
        ),
      );
    } catch {
      return NextResponse.json(
        markFailedDraftPolish(
          baseResult,
          eligibleItemIds,
          "OpenAI wording polish failed, so SmartCV kept the deterministic wording.",
          undefined,
          routeWarnings,
        ),
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Could not polish the tailored draft right now." },
      { status: 500 },
    );
  }
}
