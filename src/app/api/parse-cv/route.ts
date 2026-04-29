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

    const data = new Uint8Array(await file.arrayBuffer());
    parser = new PDFParse({
      data,
      isEvalSupported: false,
      stopAtErrors: false,
    });

    const result = await parser.getText();
    const text = normalizePdfText(result.text);

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
      sections: splitCvSections(text),
    });
  } catch {
    return NextResponse.json(
      { error: "Could not read that PDF. Try another export or paste the text." },
      { status: 500 },
    );
  } finally {
    await parser?.destroy();
  }
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
