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
  validateDeterministicDraft,
  validateRegeneratedSectionText,
} from "@/lib/draft-validation";
import { regenerateDraftSectionWithOpenAI } from "@/lib/openai-analyzer";
import type {
  EditableTailoredSectionId,
  RegenerateSectionRequest,
  RegenerateSectionResponse,
} from "@/lib/types";

export const runtime = "nodejs";

const MAX_SECTION_REQUIREMENTS = 8;
const MAX_SECTION_EVIDENCE = 8;

export async function POST(request: Request) {
  let body: Partial<RegenerateSectionRequest>;

  try {
    body = await readJsonWithLimit<Partial<RegenerateSectionRequest>>(
      request,
      DEFAULT_JSON_BODY_LIMIT_BYTES,
    );
  } catch (error) {
    const details = getSafeRouteErrorDetails(
      error,
      "Could not read the section regeneration request.",
      400,
    );

    return NextResponse.json(
      { error: details.message },
      { status: details.status },
    );
  }

  const { ignoredConfirmationCount, payload } = prepareAnalyzePayload(body);
  const sectionId = isEditableSectionId(body.sectionId) ? body.sectionId : null;
  const sectionLabel = String(body.sectionLabel ?? "").trim();
  const originalSectionText = String(body.originalSectionText ?? "").trim();
  const currentTailoredSectionText = String(body.currentTailoredSectionText ?? "").trim();

  if (!sectionId || !sectionLabel || !originalSectionText || !currentTailoredSectionText) {
    return NextResponse.json(
      {
        error:
          "SmartCV needs the section name plus original and current tailored section text to regenerate one section.",
      },
      { status: 400 },
    );
  }

  if (!hasValidAnalyzeInput(payload)) {
    return NextResponse.json(
      {
        error:
          "Paste a CV and a job description with enough text to regenerate a tailored section.",
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
    const baseSection = validatedDraft.draft.sections.find(
      (section) => section.id === sectionId,
    );
    const requirementIds = new Set<string>(baseSection?.items.flatMap((item) => item.requirementIds) ?? []);
    const evidenceIds = new Set<string>(baseSection?.items.flatMap((item) => item.evidenceIds) ?? []);
    const requirementSnippets = analysis.job.requirements
      .filter((requirement) => requirementIds.has(requirement.id))
      .map((requirement) => requirement.text)
      .slice(0, MAX_SECTION_REQUIREMENTS);
    const evidenceSnippets = analysis.cv.facts
      .filter((fact) => evidenceIds.has(fact.id))
      .map((fact) => trimSnippet(fact.text))
      .slice(0, MAX_SECTION_EVIDENCE);

    if (!process.env.OPENAI_API_KEY || payload.forceLocal) {
      return NextResponse.json(
        buildSafeResponse(
          sectionId,
          sectionLabel,
          currentTailoredSectionText,
          [
            payload.forceLocal
              ? "Local analyzer mode is enabled, so SmartCV kept the current tailored section."
              : "OpenAI section regeneration is unavailable, so SmartCV kept the current tailored section.",
          ],
        ),
      );
    }

    try {
      const regenerated = await regenerateDraftSectionWithOpenAI({
        sectionId,
        sectionLabel,
        originalSectionText,
        currentTailoredSectionText,
        requirementSnippets,
        evidenceSnippets,
      });

      if (regenerated.changedMeaning) {
        return NextResponse.json(
          buildSafeResponse(
            sectionId,
            sectionLabel,
            currentTailoredSectionText,
            [
              "OpenAI flagged a possible meaning change, so SmartCV kept the current tailored section.",
              ...regenerated.warnings,
            ],
            regenerated.model,
          ),
        );
      }

      const validation = validateRegeneratedSectionText({
        analysis,
        originalSections: analysis.cv.sections,
        sectionId,
        originalSectionText,
        currentTailoredSectionText,
        candidateText: regenerated.text,
      });

      return NextResponse.json(
        buildSafeResponse(
          sectionId,
          sectionLabel,
          validation.text,
          [...regenerated.warnings, ...validation.warnings],
          regenerated.model,
        ),
      );
    } catch {
      return NextResponse.json(
        buildSafeResponse(
          sectionId,
          sectionLabel,
          currentTailoredSectionText,
          [
            "OpenAI section regeneration failed, so SmartCV kept the current tailored section.",
          ],
        ),
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Could not regenerate that tailored section right now." },
      { status: 500 },
    );
  }
}

function buildSafeResponse(
  sectionId: EditableTailoredSectionId,
  sectionLabel: string,
  text: string,
  warnings: string[],
  model?: string,
): RegenerateSectionResponse {
  return {
    sectionId,
    sectionLabel,
    text,
    model,
    warnings: [...new Set(warnings.filter(Boolean))],
  };
}

function isEditableSectionId(value: unknown): value is EditableTailoredSectionId {
  return (
    value === "header" ||
    value === "summary" ||
    value === "skills" ||
    value === "experience" ||
    value === "projects" ||
    value === "education" ||
    value === "certifications" ||
    value === "languages"
  );
}

function trimSnippet(text: string, limit = 220) {
  if (text.length <= limit) {
    return text;
  }

  return `${text.slice(0, limit - 1).trimEnd()}...`;
}
