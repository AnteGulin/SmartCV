import { NextResponse } from "next/server";
import { PDFParse } from "pdf-parse";

export const runtime = "nodejs";

type ParsedSection = {
  label: string;
  text: string;
};

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
    const previewImage = await getPreviewImage(parser);

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
      previewImage,
      sections: splitCvSections(text),
    });
  } catch (error) {
    const message = getPdfErrorMessage(error);
    console.error("SmartCV PDF parse failed.");

    return NextResponse.json(
      { error: message },
      { status: 422 },
    );
  } finally {
    await parser?.destroy();
  }
}

async function getPreviewImage(parser: PDFParse) {
  try {
    const screenshot = await parser.getScreenshot({
      first: 1,
      desiredWidth: 720,
      imageDataUrl: true,
      imageBuffer: false,
    });

    return screenshot.pages[0]?.dataUrl ?? "";
  } catch {
    console.warn("SmartCV PDF preview unavailable.");
    return "";
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
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function splitCvSections(text: string): ParsedSection[] {
  const headings = [
    "summary",
    "profile",
    "experience",
    "employment",
    "work history",
    "skills",
    "education",
    "certifications",
    "projects",
    "languages",
  ];
  const lines = text.split("\n");
  const sections: ParsedSection[] = [];
  let current: ParsedSection = { label: "Header", text: "" };

  for (const line of lines) {
    const normalized = line.trim().toLowerCase().replace(/:$/, "");
    const isHeading = headings.includes(normalized);

    if (isHeading) {
      if (current.text.trim()) {
        sections.push({ ...current, text: current.text.trim() });
      }
      current = { label: toTitleCase(normalized), text: "" };
    } else {
      current.text += `${line}\n`;
    }
  }

  if (current.text.trim()) {
    sections.push({ ...current, text: current.text.trim() });
  }

  return sections.slice(0, 12);
}

function toTitleCase(value: string) {
  return value
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
