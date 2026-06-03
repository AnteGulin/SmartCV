import { NextResponse } from "next/server";
import { PDFParse } from "pdf-parse";
import { splitCvSections } from "@/lib/cv-sections";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let parser: PDFParse | null = null;

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Upload a PDF CV file." },
        { status: 400 },
      );
    }

    if (!isPdf(file)) {
      return NextResponse.json(
        { error: "Only PDF files are supported for now." },
        { status: 400 },
      );
    }

    if (file.size > 8 * 1024 * 1024) {
      return NextResponse.json(
        { error: "PDF is too large. Keep it under 8 MB for this MVP." },
        { status: 400 },
      );
    }

    const data = Buffer.from(await file.arrayBuffer());
    parser = new PDFParse({
      data,
      isEvalSupported: false,
      stopAtErrors: false,
    });

    const result = await parser.getText();
    const text = normalizePdfText(result.text);
    const previewImages = await getPreviewImages(parser);

    if (text.length < 80) {
      return NextResponse.json(
        {
          error:
            "The PDF text could not be extracted well. It may be scanned or image-based.",
        },
        { status: 422 },
      );
    }

    return NextResponse.json({
      fileName: file.name,
      pageCount: result.total,
      text,
      previewImage: previewImages[0] ?? "",
      previewImages,
      sections: splitCvSections(text, { beautify: true }),
    });
  } catch (error) {
    const message = getPdfErrorMessage(error);
    console.error("SmartCV PDF parse failed:", error);

    return NextResponse.json(
      { error: message },
      { status: 422 },
    );
  } finally {
    await parser?.destroy();
  }
}

async function getPreviewImages(parser: PDFParse) {
  try {
    const screenshot = await parser.getScreenshot({
      desiredWidth: 720,
      imageDataUrl: true,
      imageBuffer: false,
    });

    return screenshot.pages
      .map((page) => page.dataUrl)
      .filter((page): page is string => Boolean(page));
  } catch (error) {
    console.warn("SmartCV PDF preview failed:", error);
    return [];
  }
}

function getPdfErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (lower.includes("password")) {
    return "This PDF appears to be password protected. Export an unlocked PDF or paste the CV text.";
  }

  if (
    lower.includes("invalid pdf") ||
    lower.includes("bad xref") ||
    lower.includes("formaterror") ||
    lower.includes("corrupt")
  ) {
    return "This PDF export looks malformed. Try exporting it again as a standard PDF, or paste the CV text.";
  }

  if (lower.includes("worker")) {
    return "The PDF parser could not start for this file. Try a normal PDF export, or paste the CV text for now.";
  }

  return "Could not extract readable text from this PDF. If it is scanned/image-based, export a text PDF or paste the CV text.";
}

function isPdf(file: File) {
  return (
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
  );
}

function normalizePdfText(text: string) {
  return text
    .replace(/\r/g, "")
    .replace(/\n\s*--\s*\d+\s+of\s+\d+\s*--\s*\n/gi, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
