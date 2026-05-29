import { NextResponse } from "next/server";
import {
  ApiRouteError,
  getContentLength,
  getSafeRouteErrorDetails,
  readJsonWithLimit,
  readUtf8StreamWithLimit,
} from "@/lib/api-guards";
import {
  assertPublicResolvableHostname,
  parseAndValidateExternalUrl,
} from "@/lib/url-security";

export const runtime = "nodejs";

const FETCH_TIMEOUT_MS = 12000;
const MAX_JOB_FETCH_REDIRECTS = 3;
const MAX_FETCHED_JOB_BYTES = 1024 * 1024;
const MAX_FETCH_JOB_BODY_BYTES = 16 * 1024;
const ALLOWED_JOB_CONTENT_TYPES = new Set([
  "text/html",
  "text/plain",
  "application/xhtml+xml",
]);

export async function POST(request: Request) {
  let body: { url?: string };

  try {
    body = await readJsonWithLimit<{ url?: string }>(
      request,
      MAX_FETCH_JOB_BODY_BYTES,
    );
  } catch (error) {
    const details = getSafeRouteErrorDetails(
      error,
      "Could not read the job fetch request.",
      400,
    );

    return NextResponse.json({ error: details.message }, { status: details.status });
  }

  try {
    const url = parseAndValidateExternalUrl(String(body.url ?? ""));
    const raw = await fetchSafeJobPage(url);
    const title = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
    const isHtml = /<html[\s>]|<body[\s>]|<!doctype html/i.test(raw);
    const text = isHtml ? htmlToText(raw) : raw;

    return NextResponse.json({
      title: decodeEntities(title).slice(0, 160),
      text: text.slice(0, 60000),
    });
  } catch (error) {
    const details = getSafeRouteErrorDetails(
      error,
      "Could not fetch that job page. Paste the job text manually.",
      500,
    );

    return NextResponse.json(
      { error: details.message },
      { status: details.status },
    );
  }
}

async function fetchSafeJobPage(initialUrl: URL) {
  const controller = new AbortController();
  const timeout = windowSafeTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let currentUrl = initialUrl;
  let redirectCount = 0;

  try {
    while (redirectCount <= MAX_JOB_FETCH_REDIRECTS) {
      await assertPublicResolvableHostname(currentUrl);

      let response: Response;

      try {
        response = await fetch(currentUrl, {
          headers: {
            "user-agent": "Mozilla/5.0 SmartCV (job-post text extraction)",
            accept: "text/html, text/plain;q=0.9, application/xhtml+xml;q=0.8",
          },
          cache: "no-store",
          redirect: "manual",
          signal: controller.signal,
        });
      } catch (error) {
        if (
          error instanceof Error &&
          (error.name === "AbortError" || error.name === "TimeoutError")
        ) {
          throw new ApiRouteError(
            504,
            "That job page took too long to respond. Paste the job text manually instead.",
          );
        }

        throw new ApiRouteError(
          502,
          "Could not fetch that job page. Paste the job text manually instead.",
        );
      }

      if (isRedirectResponse(response.status)) {
        const location = response.headers.get("location");

        if (!location) {
          throw new ApiRouteError(
            502,
            "That job page returned an invalid redirect. Paste the job text manually instead.",
          );
        }

        if (redirectCount >= MAX_JOB_FETCH_REDIRECTS) {
          throw new ApiRouteError(
            400,
            "That job URL redirected too many times. Paste the job text manually instead.",
          );
        }

        currentUrl = parseAndValidateExternalUrl(new URL(location, currentUrl).toString());
        redirectCount += 1;
        continue;
      }

      if (!response.ok) {
        throw new ApiRouteError(
          502,
          `Job page returned ${response.status}. Paste the text instead.`,
        );
      }

      const contentType = getResponseMediaType(response.headers.get("content-type"));

      if (!ALLOWED_JOB_CONTENT_TYPES.has(contentType)) {
        throw new ApiRouteError(
          415,
          "That job page did not return a readable HTML or text response. Paste the job text manually instead.",
        );
      }

      const contentLength = getContentLength(response.headers);

      if (contentLength !== null && contentLength > MAX_FETCHED_JOB_BYTES) {
        throw new ApiRouteError(
          413,
          "That job page is too large to fetch automatically. Paste the job text manually instead.",
        );
      }

      return await readUtf8StreamWithLimit(response.body, MAX_FETCHED_JOB_BYTES, {
        missingMessage:
          "That job page returned no readable text. Paste the job text manually instead.",
        missingStatus: 502,
        tooLargeMessage:
          "That job page is too large to fetch automatically. Paste the job text manually instead.",
        tooLargeStatus: 413,
      });
    }
  } finally {
    clearTimeout(timeout);
  }

  throw new ApiRouteError(
    400,
    "That job URL redirected too many times. Paste the job text manually instead.",
  );
}

function isRedirectResponse(status: number) {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function getResponseMediaType(contentType: string | null) {
  return (contentType ?? "").split(";")[0].trim().toLowerCase();
}

function windowSafeTimeout(callback: () => void, timeoutMs: number) {
  return setTimeout(callback, timeoutMs);
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
