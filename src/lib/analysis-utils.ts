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
  "project experience",
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
  "about this role",
  "about you",
  "what you will do",
  "what you'll do",
  "what you bring",
  "who you are",
  "you have",
  "requirements",
  "minimum requirements",
  "minimum qualifications",
  "qualifications",
  "required qualifications",
  "required skills",
  "skills and experience",
  "experience",
  "responsibilities",
  "duties",
  "must have",
  "must haves",
  "nice to have",
  "nice to haves",
  "preferred skills",
  "preferred qualifications",
  "we are looking for",
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
  "for",
  "from",
  "if",
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
  "per",
  "than",
  "that",
  "the",
  "their",
  "this",
  "to",
  "up",
  "using",
  "we",
  "will",
  "with",
  "you",
  "your",
]);

const GENERIC_TERMS = new Set([
  "ability",
  "adaptable",
  "business",
  "candidate",
  "clients",
  "collaboration",
  "collaborative",
  "company",
  "cross functional",
  "customer",
  "deliver",
  "delivering",
  "dynamic",
  "effective",
  "environment",
  "excellent",
  "experience",
  "great",
  "help",
  "manage",
  "management",
  "managing",
  "professional",
  "responsible",
  "role",
  "skills",
  "strong",
  "success",
  "support",
  "team",
  "teams",
  "work",
  "working",
]);

const STRONG_NORMALIZATION_MAP = new Map<string, string>([
  ["js", "javascript"],
  ["ts", "typescript"],
  ["postgres", "postgresql"],
  ["node", "node.js"],
  ["reactjs", "react"],
  ["k8s", "kubernetes"],
  ["powerbi", "power bi"],
]);

export const WEAK_SYNONYM_MAP = new Map<string, string[]>([
  ["crm", ["salesforce", "hubspot"]],
  ["reporting", ["dashboards"]],
  ["customer support", ["technical support"]],
  ["ticketing tool", ["zendesk", "jira"]],
  ["ticketing tools", ["zendesk", "jira"]],
  ["service desk", ["help desk"]],
  ["helpdesk", ["help desk"]],
  ["bi", ["power bi", "tableau"]],
]);

export const KNOWN_LANGUAGES = new Set([
  "arabic",
  "dutch",
  "english",
  "french",
  "german",
  "hindi",
  "italian",
  "japanese",
  "mandarin",
  "polish",
  "portuguese",
  "spanish",
  "turkish",
]);

export const KNOWN_DEGREE_HINTS = new Set([
  "associate",
  "bachelor",
  "bachelor's",
  "college",
  "degree",
  "diploma",
  "master",
  "master's",
  "mba",
  "phd",
  "university",
]);

export const KNOWN_CERTIFICATION_HINTS = new Set([
  "aws certified",
  "certificate",
  "certification",
  "certified",
  "csm",
  "itil",
  "pmp",
  "scrum master",
]);

const KNOWN_MULTIWORD_PHRASES = new Set([
  "api troubleshooting",
  "b2b saas",
  "customer support",
  "dashboard reporting",
  "data analysis",
  "driving license",
  "incident management",
  "jira service management",
  "project management",
  "power bi",
  "python scripting",
  "rest api",
  "root cause analysis",
  "salesforce administration",
  "security clearance",
  "service desk",
  "sla reporting",
  "sql queries",
  "stakeholder management",
  "technical support",
  "ticketing tool",
  "work authorization",
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
  "kubernetes",
  "linux",
  "mongodb",
  "mysql",
  "node.js",
  "notion",
  "oracle",
  "pagerduty",
  "postgresql",
  "power bi",
  "python",
  "react",
  "redis",
  "rest api",
  "salesforce",
  "sap",
  "servicenow",
  "slack",
  "snowflake",
  "sql",
  "tableau",
  "terraform",
  "trello",
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
  return normalizeText(text)
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 12);
}

export function cleanListItem(text: string) {
  return text
    .replace(/^\s*(?:[-*•·▪]|(?:\d+|[a-z])[\].)])\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractDelimitedItems(text: string) {
  const normalized = cleanListItem(text);
  if (!normalized) return [];

  const rawParts = normalized
    .split(/\s*[|;,]\s*|\s{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (rawParts.length <= 1 && normalized.includes(",")) {
    return normalized
      .split(/\s*,\s*/)
      .map((part) => part.trim())
      .filter(Boolean);
  }

  return rawParts.length ? rawParts : [normalized];
}

export function extractKeywords(text: string, limit = 16) {
  const normalizedText = normalizeText(text).toLowerCase();
  const tokens = tokenize(text);
  const scores = new Map<string, number>();

  for (let i = 0; i < tokens.length; i += 1) {
    const token = canonicalizeToken(tokens[i]);
    if (!isUsefulToken(token)) continue;
    addPhraseScore(scores, token, scoreCandidate(token, 1, normalizedText));

    for (let size = 2; size <= 3; size += 1) {
      const slice = tokens.slice(i, i + size).map(canonicalizeToken);
      if (slice.length !== size) continue;
      const phrase = slice.join(" ");
      if (!isUsefulPhrase(slice, phrase)) continue;
      addPhraseScore(scores, phrase, scoreCandidate(phrase, size, normalizedText));
    }
  }

  return [...scores.entries()]
    .sort(
      (a, b) =>
        b[1] - a[1] || b[0].length - a[0].length || a[0].localeCompare(b[0]),
    )
    .slice(0, limit)
    .map(([phrase]) => phrase);
}

export function normalizeKeywordPhrase(value: string) {
  const tokens = tokenize(value).map(canonicalizeToken);
  const normalized = tokens.join(" ").trim();
  if (!normalized) return "";

  if (normalized === "rest") {
    return value.toLowerCase().includes("api") ? "rest api" : "rest";
  }

  return STRONG_NORMALIZATION_MAP.get(normalized) ?? normalized;
}

export function expandKeywordVariants(keywords: string[]) {
  const expanded = new Set<string>();

  for (const keyword of keywords) {
    const normalized = normalizeKeywordPhrase(keyword);
    if (!normalized) continue;
    expanded.add(normalized);

    for (const token of normalized.split(" ")) {
      if (isUsefulToken(token)) {
        expanded.add(token);
      }
    }
  }

  return [...expanded];
}

export function getWeakSynonyms(value: string) {
  const normalized = normalizeKeywordPhrase(value);
  return WEAK_SYNONYM_MAP.get(normalized) ?? [];
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

export function parseNumericValue(value: string) {
  const lower = value.toLowerCase();
  const digitMatch = lower.match(/\b(\d{1,2})\b/);
  if (digitMatch) return Number(digitMatch[1]);

  const wordValues: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
  };

  for (const [word, numericValue] of Object.entries(wordValues)) {
    if (new RegExp(`\\b${word}\\b`, "i").test(lower)) {
      return numericValue;
    }
  }

  return null;
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
  return normalizeText(text)
    .toLowerCase()
    .replace(/[^a-z0-9+#./ -]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function canonicalizeToken(token: string) {
  const cleaned = token.replace(/^[./-]+|[./-]+$/g, "");
  return STRONG_NORMALIZATION_MAP.get(cleaned) ?? cleaned;
}

function isUsefulToken(token: string) {
  if (!token || STOP_WORDS.has(token) || /^[0-9]+$/.test(token)) return false;
  if (KNOWN_TOOLS.has(token) || KNOWN_LANGUAGES.has(token)) return true;
  if (KNOWN_DEGREE_HINTS.has(token) || KNOWN_CERTIFICATION_HINTS.has(token)) {
    return true;
  }
  return !GENERIC_TERMS.has(token) && token.length >= 2;
}

function isUsefulPhrase(tokens: string[], phrase: string) {
  if (phrase.length < 4) return false;
  if (tokens.every((token) => !isUsefulToken(token))) return false;

  const meaningfulTokenCount = tokens.filter(isUsefulToken).length;
  if (!meaningfulTokenCount) return false;

  return (
    KNOWN_MULTIWORD_PHRASES.has(phrase) ||
    meaningfulTokenCount >= 2 ||
    tokens.some((token) => KNOWN_TOOLS.has(token) || KNOWN_LANGUAGES.has(token))
  );
}

function addPhraseScore(scores: Map<string, number>, phrase: string, score: number) {
  if (!phrase) return;
  scores.set(phrase, (scores.get(phrase) ?? 0) + score);
}

function scoreCandidate(candidate: string, size: number, normalizedText: string) {
  const occurrenceCount = Math.max(1, countOccurrences(normalizedText, candidate));
  const technicalBonus =
    KNOWN_MULTIWORD_PHRASES.has(candidate) ||
    KNOWN_TOOLS.has(candidate) ||
    KNOWN_LANGUAGES.has(candidate) ||
    /[#.+/]/.test(candidate)
      ? 3
      : candidate.length > 10
        ? 1
        : 0;
  return size * 2 + technicalBonus + occurrenceCount;
}
