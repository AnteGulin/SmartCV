import { Document, HeadingLevel, Packer, Paragraph } from "docx";
import { NextResponse } from "next/server";
import {
  hasValidAnalyzeInput,
  prepareAnalyzePayload,
  runPhase1Analysis,
} from "@/lib/analysis-service";
import { composeDeterministicDraft } from "@/lib/draft-composer";
import {
  applyValidatedDraftPolish,
  buildDraftPolishCandidates,
  validateDeterministicDraft,
} from "@/lib/draft-validation";
import { buildExportPreview } from "@/lib/export-model";
import { validateExportPreview } from "@/lib/export-validation";
import type {
  ExportDocxRequest,
  ExportPolishedItem,
  OpenAIDraftPolishItem,
  TailoredDraftResult,
} from "@/lib/types";

export const runtime = "nodejs";

const MAX_EXPORT_POLISHED_ITEMS = 24;

export async function POST(request: Request) {
  let body: Partial<ExportDocxRequest>;

  try {
    body = (await request.json()) as Partial<ExportDocxRequest>;
  } catch {
    return NextResponse.json(
      { error: "Could not read the DOCX export request." },
      { status: 400 },
    );
  }

  if (body.format && body.format !== "docx") {
    return NextResponse.json(
      { error: "Unsupported export format for this route." },
      { status: 400 },
    );
  }

  const { ignoredConfirmationCount, payload } = prepareAnalyzePayload(body);

  if (!hasValidAnalyzeInput(payload)) {
    return NextResponse.json(
      {
        error:
          "Paste a CV and a job description with enough text to export a tailored DOCX.",
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
    let result: TailoredDraftResult = {
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

    const sanitizedPolishedItems = sanitizeExportPolishedItems(body.polishedItems);

    if (sanitizedPolishedItems.length) {
      const candidateIds = sanitizedPolishedItems.map((item) => item.itemId);
      const eligibleCandidates = buildDraftPolishCandidates(
        result,
        candidateIds,
        MAX_EXPORT_POLISHED_ITEMS,
      );
      const eligibleItemIds = eligibleCandidates.map((candidate) => candidate.id);
      const eligibleItemIdSet = new Set(eligibleItemIds);
      const responseItems = sanitizedPolishedItems
        .filter((item) => eligibleItemIdSet.has(item.itemId))
        .map<OpenAIDraftPolishItem>((item) => ({
          id: item.itemId,
          polishedText: item.polishedText,
          changedMeaning: false,
          notes: [],
        }));

      if (responseItems.length) {
        const model =
          sanitizedPolishedItems.find((item) => item.model?.trim())?.model?.trim() ??
          "validated-client-polish";

        result = applyValidatedDraftPolish(
          result,
          responseItems,
          model,
          [],
          responseItems.map((item) => item.id),
        );
      }
    }

    const preview = buildExportPreview(result);
    const exportValidation = validateExportPreview(result, preview, {
      acknowledgedBlockedDraft: body.acknowledgedBlockedDraft === true,
    });

    if (!exportValidation.canExport) {
      return NextResponse.json(
        {
          error:
            exportValidation.issues.find((issue) => issue.severity === "critical")
              ?.message ?? "Could not export the tailored DOCX right now.",
          issues: exportValidation.issues,
        },
        { status: 400 },
      );
    }

    const document = buildDocxDocument(preview);
    const buffer = await Packer.toBuffer(document);
    const fileName = `${preview.fileNameStem}.docx`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "content-type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "content-disposition": `attachment; filename="${fileName}"`,
        "cache-control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Could not export a DOCX right now." },
      { status: 500 },
    );
  }
}

function sanitizeExportPolishedItems(value: unknown): ExportPolishedItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const items: ExportPolishedItem[] = [];

  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object") {
      continue;
    }

    const itemId =
      typeof candidate.itemId === "string" ? candidate.itemId.trim() : "";
    const polishedText =
      typeof candidate.polishedText === "string"
        ? candidate.polishedText.trim()
        : "";
    const model =
      typeof candidate.model === "string" && candidate.model.trim()
        ? candidate.model.trim()
        : undefined;

    if (!itemId || !polishedText || seen.has(itemId)) {
      continue;
    }

    seen.add(itemId);
    items.push({
      itemId,
      polishedText: polishedText.slice(0, 600),
      model,
    });

    if (items.length >= MAX_EXPORT_POLISHED_ITEMS) {
      break;
    }
  }

  return items;
}

function buildDocxDocument(preview: ReturnType<typeof buildExportPreview>) {
  const children: Paragraph[] = [];
  const headerSection = preview.sections.find((section) => section.id === "header");

  if (headerSection) {
    headerSection.items.forEach((item, index) => {
      children.push(
        new Paragraph({
          text: item.text,
          spacing: {
            after: index === headerSection.items.length - 1 ? 180 : 60,
          },
        }),
      );
    });
  }

  for (const section of preview.sections) {
    if (section.id === "header" || !section.items.length) {
      continue;
    }

    children.push(
      new Paragraph({
        text: section.title,
        heading: HeadingLevel.HEADING_1,
        spacing: {
          before: children.length ? 220 : 0,
          after: 100,
        },
      }),
    );

    section.items.forEach((item) => {
      children.push(
        new Paragraph({
          text: item.text,
          bullet: {
            level: 0,
          },
          spacing: {
            after: 120,
          },
        }),
      );
    });
  }

  return new Document({
    creator: "SmartCV",
    title: preview.fileNameStem,
    sections: [
      {
        children,
      },
    ],
  });
}
