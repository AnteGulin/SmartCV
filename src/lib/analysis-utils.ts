import type { SectionText, TextAnchor } from "@/lib/types";

const CV_HEADING_ALIASES = new Set([
  "summary",
  "profile",
  "objective",
  "experience",
  "employment",
  "work history",
  "professional experience",
  "projects",
  "skills",
  "technical skills",
  "core skills",
  "tools",
  "technologies",
  "education",
  "certifications",
  "licenses",
  "languages",
  "awards",
]);

const JOB_HEADING_ALIASES = new Set([
  "about the role",
  "about you",
  "about this role",
  "requirements",
  "required skills",
  "required qualifications",
  "minimum qualifications",
  "minimum requirements",
  "preferred qualifications",
  "preferred skills",
  "nice to have",
  "responsibilities",
  "duties",
  "what you will do",
  "what you'll do",
  "experience",
  "skills",
  "qualifications",
  "must have",
  "what we're looking for",
  "what we are looking for",
  "your profile",
]);

const STOP_WORDS = new Set([
  "a",
  "about",
  "after",
  "again",
  "all",
  "also",
  "an",
  "and",
  "any",
  "are",
  "as",
  "at",
  "be",
  "been",
  "being",
  "both",
  "by",
  "can",
  "company",
  "for",
  "from",
  "have",
  "in",
  "into",
  "is",
  "it",
  "its",
  "job",
  "of",
  "on",
  "or",
  "our",
  "role",
  "that",
  "the",
  "their",
  "this",
  "to",
  "using",
  "we",
  "will",
  "with",
  "you",
  "your",
]);

const GENERIC_TERMS = new Set([
  "ability",
  "candidate",
  "collaborate",
  "company",
  "environment",
  "experience",
  "good",
  "great",
  "high",
  "knowledge",
  "professional",
  "role",
  "skills",
  "strong",
  "support",
  "team",
  "teams",
  "work",
  "working",
]);

const SYNONYM_MAP = new Map<string, string>([
  ["js", "javascript"],
  ["ts", "typescript"],
  ["postgres", "postgresql"],
  ["jira service management", "jira"],
  ["customer support", "technical support"],
  ["reporting", "dashboards"],
]);

export const KNOWN_TOOLS = new Set([
  "api",
  "apis",
  "asana",
  "aws",
  "azure",
  "bitbucket",
  "c#",
  "c++",
  "confluence",
  "crm",
  "css",
  "datadog",
  "excel",
  "figma",
  "gcp",
  "git",
  "github",
  "gitlab",
  "hubspot",
  "html",
  "java",
  "javascript",
  "jira",
  "js",
  "kubernetes",
  "linux",
  "mongodb",
  "mysql",
  "node",
  "node.js",
  "notion",
  "oracle",
  "pagerduty",
  "postgres",
  "postgresql",
  "power bi",
  "powerbi",
  "python",
  "react",
  "redis",
  "salesforce",
  "sap",
  "service now",
  "servicenow",
  "slack",
  "snowflake",
  "sql",
  "tableau",
  "terraform",
  "trello",
  "ts",
  "typescript",
  "windows",
  "zendesk",
]);

export function normalizeText(text: string) {
  return text
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function splitTextIntoSections(
  text: string,
  document: "cv" | "job",
): SectionText[] {
  const normalizedText = normalizeText(text);
  if (!normalizedText) return [];

  const aliases = document === "cv" ? CV_HEADING_ALIASES : JOB_HEADING_ALIASES;
  const defaultLabel = document === "cv" ? "Header" : "General";
  const lines = normalizedText.split("\n");
  const sections: SectionText[] = [];
  let current: SectionText = { label: defaultLabel, text: "" };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const heading = normalizeHeading(line);
    const isHeading = Boolean(heading) && looksLikeHeading(line, aliases, heading);

    if (isHeading) {
      if (current.text.trim()) {
        sections.push({ ...current, text: current.text.trim() });
      }
      current = { label: titleCase(heading), text: "" };
      continue;
    }

    current.text += `${line}\n`;
  }

  if (current.text.trim()) {
    sections.push({ ...current, text: current.text.trim() });
  }

  return sections.length ? sections : [{ label: defaultLabel, text: normalizedText }];
}

export function splitIntoSentences(text: string) {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 18);
}

export function cleanListItem(text: string) {
  return text
    .replace(/^\s*(?:[-*•·▪]|(?:\d+|[a-z])[\].)])\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractKeywords(text: string, limit = 16) {
  const tokens = tokenize(text);
  const scores = new Map<string, number>();

  for (let i = 0; i < tokens.length; i += 1) {
    const token = canonicalizeToken(tokens[i]);
    if (shouldSkipToken(token)) continue;
    addPhraseScore(scores, token, scoreToken(token, 1));

    for (let size = 2; size <= 3; size += 1) {
      const slice = tokens.slice(i, i + size).map(canonicalizeToken);
      if (slice.length !== size) continue;
      const phrase = slice.join(" ");
      if (!isUsefulPhrase(slice, phrase)) continue;
      addPhraseScore(scores, phrase, scoreToken(phrase, size));
    }
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([phrase]) => phrase);
}

export function normalizeKeywordPhrase(value: string) {
  const normalized = tokenize(value).map(canonicalizeToken).join(" ").trim();
  return SYNONYM_MAP.get(normalized) ?? normalized;
}

export function expandKeywordVariants(keywords: string[]) {
  const expanded = new Set<string>();

  for (const keyword of keywords) {
    const normalized = normalizeKeywordPhrase(keyword);
    if (!normalized) continue;
    expanded.add(normalized);

    for (const token of normalized.split(" ")) {
      if (!shouldSkipToken(token)) {
        expanded.add(token);
      }
    }

    if (normalized === "crm") {
      expanded.add("salesforce");
      expanded.add("hubspot");
    }
  }

  return [...expanded];
}

export function isGenericKeyword(value: string) {
  const normalized = normalizeKeywordPhrase(value);
  return (
    !normalized ||
    STOP_WORDS.has(normalized) ||
    GENERIC_TERMS.has(normalized) ||
    normalized.length < 3
  );
}

export function findAnchor(
  documentText: string,
  snippet: string,
  document: "cv" | "job",
  section?: string,
): TextAnchor[] {
  const normalizedDocument = normalizeText(documentText);
  const normalizedSnippet = normalizeText(snippet);
  if (!normalizedDocument || !normalizedSnippet) return [];

  const candidates = [
    normalizedSnippet,
    normalizedSnippet.replace(/^[-*•·▪]\s*/, ""),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const start = normalizedDocument.toLowerCase().indexOf(candidate.toLowerCase());
    if (start === -1) continue;
    const anchoredSnippet = normalizedDocument.slice(start, start + candidate.length);
    return [
      {
        document,
        section,
        snippet: anchoredSnippet,
        start,
        end: start + candidate.length,
      },
    ];
  }

  return [];
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

export function dedupeByNormalizedText<T>(
  items: T[],
  getText: (item: T) => string,
) {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const item of items) {
    const normalized = normalizeKeywordPhrase(getText(item));
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(item);
  }

  return result;
}

export function hasDateLikeText(text: string) {
  return /\b(?:19|20)\d{2}\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b|\b\d{1,2}[/-]\d{2,4}\b|\bpresent\b/i.test(
    text,
  );
}

export function hasEducationLikeText(text: string) {
  return /\b(bachelor|master|degree|university|college|phd|certificate|certification|diploma)\b/i.test(
    text,
  );
}

export function countOccurrences(text: string, phrase: string) {
  const normalizedText = normalizeText(text).toLowerCase();
  const normalizedPhrase = normalizeKeywordPhrase(phrase);
  if (!normalizedPhrase) return 0;

  let count = 0;
  let start = 0;

  while (start < normalizedText.length) {
    const matchIndex = normalizedText.indexOf(normalizedPhrase, start);
    if (matchIndex === -1) break;
    count += 1;
    start = matchIndex + normalizedPhrase.length;
  }

  return count;
}

export function titleCase(value: string) {
  return value
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function normalizeHeading(line: string) {
  return line.trim().toLowerCase().replace(/:$/, "").replace(/\s+/g, " ");
}

function looksLikeHeading(
  line: string,
  aliases: Set<string>,
  normalizedHeading: string,
) {
  return (
    aliases.has(normalizedHeading) ||
    (/^[A-Z][A-Z /&()'-]{2,}:?$/.test(line.trim()) && line.trim().length < 80)
  );
}

function tokenize(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+#./ -]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function canonicalizeToken(token: string) {
  const cleaned = token.replace(/^[./-]+|[./-]+$/g, "");
  return SYNONYM_MAP.get(cleaned) ?? cleaned;
}

function shouldSkipToken(token: string) {
  return !token || STOP_WORDS.has(token) || /^[0-9]+$/.test(token) || token.length < 2;
}

function isUsefulPhrase(tokens: string[], phrase: string) {
  if (phrase.length < 4) return false;
  if (tokens.every((token) => shouldSkipToken(token) || GENERIC_TERMS.has(token))) {
    return false;
  }

  const meaningfulTokenCount = tokens.filter(
    (token) => !shouldSkipToken(token) && !GENERIC_TERMS.has(token),
  ).length;

  return meaningfulTokenCount > 0;
}

function addPhraseScore(scores: Map<string, number>, phrase: string, score: number) {
  if (!phrase) return;
  scores.set(phrase, (scores.get(phrase) ?? 0) + score);
}

function scoreToken(value: string, size: number) {
  const technicalBonus =
    KNOWN_TOOLS.has(value) || /[#.+/]/.test(value) ? 2 : value.length > 10 ? 1 : 0;
  return size * 2 + technicalBonus;
}
