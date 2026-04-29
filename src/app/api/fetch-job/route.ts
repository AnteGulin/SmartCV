import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { url?: string };
    const url = String(body.url ?? "").trim();

    if (!/^https?:\/\//i.test(url)) {
      return NextResponse.json(
        { error: "Enter a valid http or https job URL." },
        { status: 400 },
      );
    }

    const response = await fetch(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 SmartCV (job-post text extraction)",
        accept: "text/html, text/plain;q=0.9, */*;q=0.8",
      },
      signal: AbortSignal.timeout(12000),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Job page returned ${response.status}. Paste the text instead.` },
        { status: 502 },
      );
    }

    const contentType = response.headers.get("content-type") ?? "";
    const raw = await response.text();
    const title = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
    const text = contentType.includes("html") ? htmlToText(raw) : raw;

    return NextResponse.json({
      title: decodeEntities(title).slice(0, 160),
      text: text.slice(0, 60000),
    });
  } catch {
    return NextResponse.json(
      { error: "Could not fetch that job page. Paste the job text manually." },
      { status: 500 },
    );
  }
}

function htmlToText(html: string) {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<(br|p|div|li|h[1-6]|section|article)[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim(),
  );
}

function decodeEntities(text: string) {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCharCode(Number(code)),
    );
}
