import { normalizeKeywordPhrase, normalizeText } from "@/lib/analysis-utils";
import type {
  JobRequirement,
  TextAnchor,
  UserConfirmedEvidence,
  UserEvidenceType,
} from "@/lib/types";

const VALID_USER_EVIDENCE_TYPES = new Set<UserEvidenceType>([
  "experience",
  "skill",
  "tool",
  "certification",
  "education",
  "language",
  "work_authorization",
  "location",
  "availability",
  "other",
]);

const VERY_VAGUE_PATTERNS = [
  /^\s*(yes|yeah|yep|no|maybe|perhaps|possibly|sure|ok|okay)\s*$/i,
  /^\s*(i think so|not sure|n\/a|na|none)\s*$/i,
  /\bfamiliar with (?:it|this)\b/i,
  /\bsome experience\b/i,
  /\bkind of\b/i,
  /\bsort of\b/i,
];

const WORK_AUTHORIZATION_HINTS = [
  /\bauthori[sz]ed to work\b/i,
  /\beu citizen\b/i,
  /\bright to work\b/i,
  /\bwork permit\b/i,
  /\bvisa\b/i,
];

const LANGUAGE_HINTS = [
  /\bb1\b/i,
  /\bb2\b/i,
  /\bc1\b/i,
  /\bc2\b/i,
  /\bfluent\b/i,
  /\bnative\b/i,
  /\bprofessional(?: working)? proficiency\b/i,
];

const CERTIFICATION_HINTS = [/\bcert/i, /\blicen[cs]e\b/i, /\bclearance\b/i];
const EDUCATION_HINTS = [/\bdegree\b/i, /\bbachelor\b/i, /\bmaster\b/i, /\bdiploma\b/i, /\bphd\b/i];
const EXPERIENCE_HINTS = [
  /\bproject\b/i,
  /\brole\b/i,
  /\bcompany\b/i,
  /\bclient\b/i,
  /\bused\b/i,
  /\bbuilt\b/i,
  /\bmanaged\b/i,
  /\bsupported\b/i,
  /\bimplemented\b/i,
];

export const CONFIRMED_EVIDENCE_STORAGE_KEY = "smartcv.confirmedEvidence.v1";

export function buildRequirementFingerprint(text: string): string {
  const normalized = normalizeText(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s+#./-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return "";
  }

  return normalized.split(" ").slice(0, 18).join(" ");
}

export function createUserConfirmedEvidenceId(): string {
  return `user_evidence_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function isUserEvidenceType(value: unknown): value is UserEvidenceType {
  return typeof value === "string" && VALID_USER_EVIDENCE_TYPES.has(value as UserEvidenceType);
}

export function isVagueUserEvidenceText(text: string): boolean {
  const normalized = normalizeText(text);

  if (!normalized) {
    return true;
  }

  return VERY_VAGUE_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function isMeaningfulUserEvidenceText(
  text: string,
  evidenceType: UserEvidenceType,
): boolean {
  const normalized = normalizeText(text);

  if (!normalized || isVagueUserEvidenceText(normalized)) {
    return false;
  }

  const minimumLength =
    evidenceType === "language" ||
    evidenceType === "work_authorization" ||
    evidenceType === "location" ||
    evidenceType === "availability"
      ? 6
      : 12;

  if (normalized.length < minimumLength) {
    return false;
  }

  if (evidenceType === "work_authorization") {
    return WORK_AUTHORIZATION_HINTS.some((pattern) => pattern.test(normalized));
  }

  if (evidenceType === "language") {
    return LANGUAGE_HINTS.some((pattern) => pattern.test(normalized)) || normalized.split(" ").length >= 2;
  }

  if (evidenceType === "certification") {
    return CERTIFICATION_HINTS.some((pattern) => pattern.test(normalized)) || normalized.split(" ").length >= 2;
  }

  if (evidenceType === "education") {
    return EDUCATION_HINTS.some((pattern) => pattern.test(normalized)) || normalized.split(" ").length >= 3;
  }

  if (evidenceType === "experience" || evidenceType === "tool") {
    return EXPERIENCE_HINTS.some((pattern) => pattern.test(normalized)) || normalized.split(" ").length >= 5;
  }

  return normalized.split(" ").length >= 3;
}

export function buildUserEvidenceAnchor(text: string, requirementText?: string): TextAnchor[] {
  const normalized = normalizeText(text);

  if (!normalized) {
    return [];
  }

  return [
    {
      document: "user",
      section: requirementText ? `Confirmation for: ${requirementText}` : "User-confirmed evidence",
      snippet: normalized.slice(0, 280),
      start: 0,
      end: normalized.length,
    },
  ];
}

export function sanitizeUserConfirmedEvidence(value: unknown): UserConfirmedEvidence[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const sanitized: UserConfirmedEvidence[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const candidate = item as Partial<UserConfirmedEvidence>;
    const requirementText = normalizeText(candidate.requirementText ?? "");
    const evidenceType = isUserEvidenceType(candidate.evidenceType)
      ? candidate.evidenceType
      : "other";
    const text = normalizeText(candidate.text ?? "");

    if (!requirementText || !isMeaningfulUserEvidenceText(text, evidenceType)) {
      continue;
    }

    const fingerprint = buildRequirementFingerprint(requirementText);

    if (!fingerprint) {
      continue;
    }

    sanitized.push({
      id:
        typeof candidate.id === "string" && candidate.id.trim()
          ? candidate.id.trim()
          : createUserConfirmedEvidenceId(),
      requirementId:
        typeof candidate.requirementId === "string" && candidate.requirementId.trim()
          ? candidate.requirementId.trim()
          : undefined,
      requirementText,
      requirementFingerprint: fingerprint,
      evidenceType,
      text,
      createdAt:
        typeof candidate.createdAt === "string" && candidate.createdAt.trim()
          ? candidate.createdAt
          : new Date().toISOString(),
      updatedAt:
        typeof candidate.updatedAt === "string" && candidate.updatedAt.trim()
          ? candidate.updatedAt
          : undefined,
    });
  }

  const seen = new Set<string>();

  return sanitized.filter((item) => {
    const dedupeKey = `${item.requirementFingerprint}::${item.evidenceType}::${normalizeKeywordPhrase(item.text)}`;

    if (seen.has(dedupeKey)) {
      return false;
    }

    seen.add(dedupeKey);
    return true;
  });
}

export function getDefaultUserEvidenceType(
  requirement: Pick<JobRequirement, "category" | "text">,
): UserEvidenceType {
  const normalized = normalizeText(requirement.text).toLowerCase();

  if (/\bauthori[sz]ed to work\b|\bvisa\b|\bwork permit\b/.test(normalized)) {
    return "work_authorization";
  }

  if (/\bfluent\b|\bnative\b|\blanguage\b|\bgerman\b|\bfrench\b|\benglish\b/.test(normalized)) {
    return "language";
  }

  if (/\bcert/i.test(normalized) || /\blicen[cs]e\b/.test(normalized) || /\bclearance\b/.test(normalized)) {
    return "certification";
  }

  if (/\bdegree\b|\bbachelor\b|\bmaster\b|\bphd\b/.test(normalized)) {
    return "education";
  }

  if (/\bon[- ]?site\b|\bhybrid\b|\bbased in\b|\blocated in\b/.test(normalized)) {
    return "location";
  }

  if (/\bshift\b|\btime ?zone\b|\bweekend\b|\btravel\b/.test(normalized)) {
    return "availability";
  }

  if (requirement.category === "tool") {
    return "tool";
  }

  if (requirement.category === "must_have" || requirement.category === "responsibility") {
    return "experience";
  }

  if (requirement.category === "soft_skill") {
    return "skill";
  }

  return "other";
}

export function getConfirmationPrompt(
  requirement: Pick<JobRequirement, "category" | "text">,
): string {
  const normalized = normalizeText(requirement.text).toLowerCase();

  if (/\bauthori[sz]ed to work\b|\bvisa\b|\bwork permit\b/.test(normalized)) {
    return "State your work authorization only if accurate, for example EU citizen, local work permit, or authorized to work in the required country.";
  }

  if (/\bfluent\b|\bnative\b|\blanguage\b|\bgerman\b|\bfrench\b|\benglish\b/.test(normalized)) {
    return "State your language proficiency only if accurate, for example B2, C1, fluent, native, or professional working proficiency.";
  }

  if (/\bcert/i.test(normalized) || /\blicen[cs]e\b/.test(normalized) || /\bclearance\b/.test(normalized)) {
    return "State the exact certification, license, or clearance only if accurate and current.";
  }

  if (/\bdegree\b|\bbachelor\b|\bmaster\b|\bphd\b/.test(normalized)) {
    return "State the exact degree or education credential only if accurate, including institution or field if useful.";
  }

  if (requirement.category === "tool") {
    return "Describe where and how you used this tool professionally. Include company or project context if possible.";
  }

  if (requirement.category === "responsibility") {
    return "Describe a real work or project example where you handled this responsibility. Include context, scope, or outcomes if possible.";
  }

  return "Describe a real work, project, or qualification example that supports this requirement. Include company or project context if possible.";
}
