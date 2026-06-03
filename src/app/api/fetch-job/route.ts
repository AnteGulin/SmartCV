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

type FetchStrategy = "generic" | "linkedin_guest" | "ashby_direct";

type FetchTarget = {
  fetchUrl: URL;
  sourceUrl: string;
  previewUrl: string;
  strategy: FetchStrategy;
};

type SafeFetchResult = {
  contentType: string;
  finalUrl: string;
  raw: string;
};

type JobFetchResponse = {
  company?: string;
  location?: string;
  resolvedUrl?: string;
  sourceUrl: string;
  text: string;
  title: string;
};

type JobPostingNode = Record<string, unknown>;

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
    const target = resolveFetchTarget(url);
    const fetched = await fetchSafeJobPage(target.fetchUrl);

    return NextResponse.json(
      buildJobResponse({
        contentType: fetched.contentType,
        finalUrl: fetched.finalUrl,
        raw: fetched.raw,
        sourceUrl: target.sourceUrl,
        strategy: target.strategy,
      }),
    );
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

      return {
        contentType,
        finalUrl: currentUrl.toString(),
        raw: await readUtf8StreamWithLimit(response.body, MAX_FETCHED_JOB_BYTES, {
          missingMessage:
            "That job page returned no readable text. Paste the job text manually instead.",
          missingStatus: 502,
          tooLargeMessage:
            "That job page is too large to fetch automatically. Paste the job text manually instead.",
          tooLargeStatus: 413,
        }),
      } satisfies SafeFetchResult;
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

function buildJobResponse({
  contentType,
  finalUrl,
  raw,
  sourceUrl,
  strategy,
}: {
  contentType: string;
  finalUrl: string;
  raw: string;
  sourceUrl: string;
  strategy: FetchStrategy;
}): JobFetchResponse {
  const pageUrl = finalUrl || sourceUrl;
  const isHtml = isHtmlDocument(raw, contentType);

  if (strategy === "linkedin_guest" && isHtml) {
    return buildLinkedInResponse(raw, sourceUrl, pageUrl);
  }

  if (isHtml) {
    const structured = buildStructuredJobResponse(raw, sourceUrl, pageUrl);
    if (structured) {
      return structured;
    }
  }

  return buildGenericJobResponse(raw, isHtml, sourceUrl, pageUrl);
}

function buildGenericJobResponse(
  raw: string,
  isHtml: boolean,
  sourceUrl: string,
  resolvedUrl: string,
): JobFetchResponse {
  const title = extractBestTitle(raw);
  const company = extractMetaCompany(raw);
  const location = extractMetaLocation(raw);
  const mainText = normalizeExtractedText(isHtml ? htmlToText(raw) : raw);
  const text = normalizeExtractedText(
    [
      title,
      [company, location].filter(Boolean).join(" | "),
      mainText,
    ]
      .filter(Boolean)
      .join("\n\n"),
  ).slice(0, 60000);

  return {
    company: company || undefined,
    location: location || undefined,
    resolvedUrl: resolvedUrl !== sourceUrl ? resolvedUrl : undefined,
    sourceUrl,
    text,
    title,
  };
}

function buildLinkedInResponse(
  html: string,
  sourceUrl: string,
  resolvedUrl: string,
): JobFetchResponse {
  const title = extractLinkedInTitle(html);
  const company = extractLinkedInCompany(html);
  const location = extractLinkedInLocation(html);
  const descriptionHtml = extractLinkedInDescriptionHtml(html);
  const descriptionText = normalizeExtractedText(
    htmlToText(descriptionHtml || html),
  );
  const text = normalizeExtractedText(
    [title, [company, location].filter(Boolean).join(" | "), descriptionText]
      .filter(Boolean)
      .join("\n\n"),
  ).slice(0, 60000);

  return {
    company: company || undefined,
    location: location || undefined,
    resolvedUrl: resolvedUrl !== sourceUrl ? resolvedUrl : undefined,
    sourceUrl,
    text,
    title,
  };
}

function buildStructuredJobResponse(
  html: string,
  sourceUrl: string,
  resolvedUrl: string,
): JobFetchResponse | null {
  const posting = extractStructuredJobPosting(html);
  if (!posting) {
    return null;
  }

  const title = getString(posting.title) || extractBestTitle(html);
  const company = extractOrganizationName(posting.hiringOrganization);
  const location = extractJobLocation(
    posting.jobLocation ?? posting.applicantLocationRequirements,
  );
  const description = normalizeExtractedText(htmlToText(getString(posting.description)));
  const responsibilities = collectJobPostingItems(posting, [
    "responsibilities",
    "responsibility",
    "jobResponsibilities",
  ]);
  const requirements = collectJobPostingItems(posting, [
    "qualifications",
    "experienceRequirements",
    "skills",
    "skillsDescription",
    "requirements",
  ]);
  const extras = collectJobPostingItems(posting, [
    "educationRequirements",
    "industry",
    "occupationalCategory",
  ]);
  const text = normalizeExtractedText(
    [
      title,
      [company, location].filter(Boolean).join(" | "),
      description,
      formatNamedList("Responsibilities", responsibilities),
      formatNamedList("Requirements", requirements),
      formatNamedList("Additional signals", extras),
    ]
      .filter(Boolean)
      .join("\n\n"),
  ).slice(0, 60000);

  if (text.length < 120) {
    return null;
  }

  return {
    company: company || undefined,
    location: location || undefined,
    resolvedUrl: resolvedUrl !== sourceUrl ? resolvedUrl : undefined,
    sourceUrl,
    text,
    title,
  };
}

function resolveFetchTarget(inputUrl: URL): FetchTarget {
  const sourceUrl = inputUrl.toString();
  const host = inputUrl.hostname.toLowerCase();
  const normalizedHost = host.replace(/^www\./, "");

  if (normalizedHost.endsWith("linkedin.com")) {
    const jobId =
      inputUrl.searchParams.get("currentJobId") ||
      inputUrl.pathname.match(/\/jobs\/view\/(?:[^/]*-)?(\d+)/i)?.[1];

    if (jobId) {
      const previewUrl = `https://www.linkedin.com/jobs/view/${jobId}/`;
      return {
        fetchUrl: parseAndValidateExternalUrl(
          `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${jobId}`,
        ),
        previewUrl,
        sourceUrl,
        strategy: "linkedin_guest",
      };
    }
  }

  if (host === "www.ashbyhq.com") {
    const ashbyJobId = inputUrl.searchParams.get("ashby_jid")?.trim();

    if (ashbyJobId && /^[a-z0-9-]+$/i.test(ashbyJobId)) {
      const resolvedUrl = `https://jobs.ashbyhq.com/ashby/${ashbyJobId}`;
      return {
        fetchUrl: parseAndValidateExternalUrl(resolvedUrl),
        previewUrl: resolvedUrl,
        sourceUrl,
        strategy: "ashby_direct",
      };
    }
  }

  return {
    fetchUrl: inputUrl,
    previewUrl: sourceUrl,
    sourceUrl,
    strategy: "generic",
  };
}

function windowSafeTimeout(callback: () => void, timeoutMs: number) {
  return setTimeout(callback, timeoutMs);
}

function isHtmlDocument(raw: string, contentType: string) {
  return (
    contentType === "text/html" ||
    contentType === "application/xhtml+xml" ||
    /<html[\s>]|<body[\s>]|<!doctype html/i.test(raw)
  );
}

function extractStructuredJobPosting(html: string): JobPostingNode | null {
  const matches = html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );

  for (const match of matches) {
    const raw = decodeEntities(match[1] ?? "")
      .replace(/^\s*<!--/, "")
      .replace(/-->\s*$/, "")
      .trim();

    if (!raw) {
      continue;
    }

    try {
      const parsed = JSON.parse(raw) as unknown;
      const posting = collectJobPostingNodes(parsed)[0];
      if (posting) {
        return posting;
      }
    } catch {
      continue;
    }
  }

  return null;
}

function collectJobPostingNodes(value: unknown): JobPostingNode[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectJobPostingNodes(item));
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  const record = value as Record<string, unknown>;
  const nodes: JobPostingNode[] = [];

  if (hasStructuredType(record, "JobPosting")) {
    nodes.push(record);
  }

  for (const nested of Object.values(record)) {
    nodes.push(...collectJobPostingNodes(nested));
  }

  return nodes;
}

function hasStructuredType(record: Record<string, unknown>, expected: string) {
  const value = record["@type"];

  if (typeof value === "string") {
    return value.toLowerCase() === expected.toLowerCase();
  }

  if (Array.isArray(value)) {
    return value.some(
      (item) =>
        typeof item === "string" &&
        item.toLowerCase() === expected.toLowerCase(),
    );
  }

  return false;
}

function collectJobPostingItems(posting: JobPostingNode, keys: string[]): string[] {
  const items = keys.flatMap((key) => splitStructuredValue(posting[key]));
  const unique = new Set<string>();

  for (const item of items) {
    const cleaned = normalizeExtractedText(item).replace(/[.;]\s*$/, "");
    if (!cleaned) {
      continue;
    }
    unique.add(cleaned);
  }

  return [...unique].slice(0, 12);
}

function splitStructuredValue(value: unknown): string[] {
  if (!value) {
    return [];
  }

  if (typeof value === "string") {
    const plain = htmlToText(value);
    const lines = plain
      .split(/\n+/)
      .map((line) => line.replace(/^[*-]\s*/, "").trim())
      .filter(Boolean);

    if (lines.length > 1) {
      return lines;
    }

    return plain
      .split(/(?<=[.!?])\s+/)
      .map((part) => part.trim())
      .filter(Boolean);
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => splitStructuredValue(item));
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.values(record).flatMap((item) => splitStructuredValue(item));
  }

  return [];
}

function extractOrganizationName(value: unknown) {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return normalizeExtractedText(value).slice(0, 160);
  }

  if (Array.isArray(value)) {
    return extractOrganizationName(value[0]);
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return getString(record.name) || getString(record.legalName) || "";
  }

  return "";
}

function extractJobLocation(value: unknown): string {
  const locations = Array.isArray(value) ? value : [value];
  const result = locations
    .map((location) => {
      if (!location) {
        return "";
      }

      if (typeof location === "string") {
        return normalizeExtractedText(location);
      }

      if (typeof location === "object") {
        const record = location as Record<string, unknown>;
        const address = record.address as Record<string, unknown> | undefined;
        const addressParts = address
          ? [
              getString(address.addressLocality),
              getString(address.addressRegion),
              getString(address.addressCountry),
            ].filter(Boolean)
          : [];

        return (
          getString(record.name) ||
          addressParts.join(", ") ||
          splitStructuredValue(record).find(Boolean) ||
          ""
        );
      }

      return "";
    })
    .filter(Boolean);

  return [...new Set(result)].join(" | ").slice(0, 200);
}

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function formatNamedList(title: string, items: string[]) {
  if (!items.length) {
    return "";
  }

  return `${title}\n${items.map((item) => `- ${item}`).join("\n")}`;
}

function extractBestTitle(html: string) {
  const title =
    findMetaContent(html, "property", "og:title") ||
    matchTagText(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i) ||
    matchTagText(html, /<title[^>]*>([\s\S]*?)<\/title>/i);

  return decodeEntities(title).replace(/\s+/g, " ").trim().slice(0, 160);
}

function extractMetaCompany(html: string) {
  const company =
    findMetaContent(html, "property", "og:site_name") ||
    findMetaContent(html, "name", "application-name");

  return decodeEntities(company).replace(/\s+/g, " ").trim().slice(0, 160);
}

function extractMetaLocation(html: string) {
  const location =
    findMetaContent(html, "property", "job:location") ||
    findMetaContent(html, "name", "job_location");

  return decodeEntities(location).replace(/\s+/g, " ").trim().slice(0, 160);
}

function extractLinkedInTitle(html: string) {
  const title =
    matchTagText(
      html,
      /<h2[^>]*class="[^"]*top-card-layout__title[^"]*"[^>]*>([\s\S]*?)<\/h2>/i,
    ) || matchTagText(html, /<title[^>]*>([\s\S]*?)<\/title>/i);

  return decodeEntities(title).trim().slice(0, 160);
}

function extractLinkedInCompany(html: string) {
  return decodeEntities(
    matchTagText(
      html,
      /<a[^>]*class="[^"]*topcard__org-name-link[^"]*"[^>]*>([\s\S]*?)<\/a>/i,
    ) ||
      matchTagText(
        html,
        /<span[^>]*class="[^"]*topcard__flavor[^"]*"[^>]*>\s*([^<]+?)\s*<\/span>/i,
      ),
  )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

function extractLinkedInLocation(html: string) {
  const matches = [
    ...html.matchAll(
      /<span[^>]*class="[^"]*topcard__flavor[^"]*"[^>]*>\s*([^<]+?)\s*<\/span>/gi,
    ),
  ];
  const location = matches
    .map((match) => decodeEntities(stripTags(match[1])).trim())
    .find((value) => /,|remote|hybrid|on-site/i.test(value));

  return (location || "").slice(0, 160);
}

function extractLinkedInDescriptionHtml(html: string) {
  const match = html.match(
    /<div[^>]*class="[^"]*show-more-less-html__markup[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
  );

  return match?.[1] ?? "";
}

function findMetaContent(
  html: string,
  attribute: "name" | "property",
  value: string,
) {
  const pattern = new RegExp(
    `<meta[^>]+${attribute}=["']${escapeRegExp(value)}["'][^>]+content=["']([^"']+)["'][^>]*>`,
    "i",
  );
  const reversePattern = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+${attribute}=["']${escapeRegExp(value)}["'][^>]*>`,
    "i",
  );

  return html.match(pattern)?.[1] ?? html.match(reversePattern)?.[1] ?? "";
}

function matchTagText(html: string, pattern: RegExp) {
  return stripTags(html.match(pattern)?.[1] ?? "").trim();
}

function stripTags(value: string) {
  return value.replace(/<[^>]+>/g, " ");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function htmlToText(html: string) {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<(br|p|div|li|h[1-6]|section|article|ul|ol|tr)[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim(),
  );
}

function normalizeExtractedText(text: string) {
  return text
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
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
