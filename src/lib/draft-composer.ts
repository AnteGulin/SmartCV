import { isGenericKeyword, normalizeText, uniqueStrings } from "@/lib/analysis-utils";
import type {
  CandidateFact,
  DraftSourceLabel,
  JobRequirement,
  Phase1AnalysisResult,
  TailoredDraftItem,
  TailoredDraftSection,
  UserConfirmedEvidence,
} from "@/lib/types";

type ComposedDraft = {
  sections: TailoredDraftSection[];
  warnings: string[];
  blockedRequirementIds: string[];
  missingHighImportanceRequirementIds: string[];
};

type FactGroup = {
  fact: CandidateFact;
  requirementIds: Set<string>;
  maxImportance: number;
  maxScore: number;
};

export function composeDeterministicDraft(
  analysis: Phase1AnalysisResult,
): ComposedDraft {
  const factsById = new Map(analysis.cv.facts.map((fact) => [fact.id, fact]));
  const supportedRequirements = [...analysis.job.requirements]
    .filter((requirement) => requirement.evidenceStatus === "supported")
    .sort(
      (left, right) =>
        right.importance - left.importance ||
        (right.matchedEvidence[0]?.score ?? 0) - (left.matchedEvidence[0]?.score ?? 0),
    );
  const blockedRequirements = analysis.job.requirements.filter(
    (requirement) => requirement.evidenceStatus === "blocked",
  );
  const missingHighImportanceRequirements = analysis.job.requirements.filter(
    (requirement) =>
      requirement.evidenceStatus === "missing" && requirement.importance >= 4,
  );
  const weakRequirements = analysis.job.requirements.filter(
    (requirement) => requirement.evidenceStatus === "weak",
  );

  const sections: TailoredDraftSection[] = [];
  const headerSection = buildHeaderSection(analysis);
  if (headerSection.items.length) {
    sections.push(headerSection);
  }

  const summarySection = buildSummarySection(supportedRequirements, factsById);
  if (summarySection.items.length) {
    sections.push(summarySection);
  }

  const skillsSection = buildSkillsSection(supportedRequirements, factsById);
  if (skillsSection.items.length) {
    sections.push(skillsSection);
  }

  const experienceSection = buildFactSection(
    "experience",
    "Experience",
    "experience_bullet",
    supportedRequirements,
    factsById,
  );
  if (experienceSection.items.length) {
    sections.push(experienceSection);
  }

  const projectSection = buildFactSection(
    "project",
    "Projects",
    "project_bullet",
    supportedRequirements,
    factsById,
  );
  if (projectSection.items.length) {
    sections.push(projectSection);
  }

  const educationSection = buildCredentialSection(
    "education",
    "Education",
    supportedRequirements,
    factsById,
  );
  if (educationSection.items.length) {
    sections.push(educationSection);
  }

  const certificationSection = buildCredentialSection(
    "certification",
    "Certifications",
    supportedRequirements,
    factsById,
  );
  if (certificationSection.items.length) {
    sections.push(certificationSection);
  }

  const languageSection = buildCredentialSection(
    "language",
    "Languages",
    supportedRequirements,
    factsById,
  );
  if (languageSection.items.length) {
    sections.push(languageSection);
  }

  const reviewNotesSection = buildReviewNotesSection(
    blockedRequirements,
    missingHighImportanceRequirements,
    weakRequirements,
    sections.flatMap((section) => section.items),
  );
  if (reviewNotesSection.items.length) {
    sections.push(reviewNotesSection);
  }

  const warnings: string[] = [];

  if (
    !sections.some(
      (section) =>
        section.id !== "header" &&
        section.id !== "review_notes" &&
        section.items.length > 0,
    )
  ) {
    warnings.push(
      "No safe CV-backed tailored claims were found, so the draft is mostly review guidance.",
    );
  }

  return {
    sections,
    warnings,
    blockedRequirementIds: blockedRequirements.map((requirement) => requirement.id),
    missingHighImportanceRequirementIds: missingHighImportanceRequirements.map(
      (requirement) => requirement.id,
    ),
  };
}

export function buildTailorInputSignature(
  cvText: string,
  jobText: string,
  confirmedEvidence: UserConfirmedEvidence[],
) {
  const normalizedEvidence = [...confirmedEvidence]
    .sort((left, right) =>
      left.requirementFingerprint.localeCompare(right.requirementFingerprint) ||
      left.id.localeCompare(right.id),
    )
    .map((item) =>
      [
        item.id,
        item.requirementFingerprint,
        item.evidenceType,
        item.updatedAt ?? item.createdAt,
        normalizeText(item.text),
      ].join("|"),
    )
    .join("||");

  const raw = [
    "phase3.v1",
    normalizeText(cvText),
    normalizeText(jobText),
    normalizedEvidence,
  ].join("||");

  let hash = 0;

  for (let index = 0; index < raw.length; index += 1) {
    hash = (hash * 31 + raw.charCodeAt(index)) % 2147483647;
  }

  return `phase3.v1:${hash}:${confirmedEvidence.length}`;
}

export function buildDraftPolishSignature(
  tailorInputSignature: string,
  itemIds: string[],
  model?: string,
) {
  const raw = [
    "phase3b.v1",
    tailorInputSignature,
    [...itemIds].sort().join("|"),
    model ?? "local",
  ].join("||");

  let hash = 0;

  for (let index = 0; index < raw.length; index += 1) {
    hash = (hash * 31 + raw.charCodeAt(index)) % 2147483647;
  }

  return `phase3b.v1:${hash}:${itemIds.length}`;
}

function buildHeaderSection(analysis: Phase1AnalysisResult): TailoredDraftSection {
  const header = analysis.cv.sections.find(
    (section) => section.label.toLowerCase() === "header",
  );

  if (!header) {
    return {
      id: "header",
      title: "Header",
      items: [],
    };
  }

  const items = header.text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length >= 3 && line.length <= 160)
    .slice(0, 4)
    .map<TailoredDraftItem>((line, index) => ({
      id: `draft_header_${index + 1}`,
      type: "header_line",
      text: line,
      evidenceIds: [],
      requirementIds: [],
      sourceLabel: "passthrough",
      reviewState: "ready",
      warnings: [],
    }));

  return {
    id: "header",
    title: "Header",
    items,
  };
}

function buildSummarySection(
  supportedRequirements: JobRequirement[],
  factsById: Map<string, CandidateFact>,
): TailoredDraftSection {
  const items = supportedRequirements
    .filter((requirement) => requirement.importance >= 4)
    .map((requirement) => {
      const bestMatch = requirement.matchedEvidence.find((match) => {
        const fact = factsById.get(match.factId);
        return (
          fact &&
          fact.source === "cv" &&
          isExperienceLikeFact(fact) &&
          match.score >= 0.74
        );
      });

      if (!bestMatch) {
        return null;
      }

      const fact = factsById.get(bestMatch.factId);

      if (!fact || fact.text.length < 40 || fact.text.length > 180) {
        return null;
      }

      return {
        requirement,
        fact,
        match: bestMatch,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .slice(0, 2)
    .map<TailoredDraftItem>(({ requirement, fact }, index) => ({
      id: `draft_summary_${index + 1}`,
      type: "summary_bullet",
      text: fact.text,
      evidenceIds: [fact.id],
      requirementIds: [requirement.id],
      sourceLabel: toDraftSourceLabel([fact]),
      reviewState: "ready",
      warnings: [],
    }));

  return {
    id: "summary",
    title: "Summary",
    items,
  };
}

function buildSkillsSection(
  supportedRequirements: JobRequirement[],
  factsById: Map<string, CandidateFact>,
): TailoredDraftSection {
  const cvTerms = new Map<string, { requirementIds: Set<string>; evidenceIds: Set<string> }>();
  const userTerms = new Map<string, { requirementIds: Set<string>; evidenceIds: Set<string> }>();

  for (const requirement of supportedRequirements) {
    const bestMatch = requirement.matchedEvidence[0];
    const fact = bestMatch ? factsById.get(bestMatch.factId) : undefined;

    if (!bestMatch || !fact) {
      continue;
    }

    if (!isSkillLikeRequirement(requirement)) {
      continue;
    }

    const terms = extractExactSupportedTerms(requirement, fact);

    for (const term of terms) {
      const targetMap = fact.source === "cv" ? cvTerms : userTerms;
      const existing = targetMap.get(term) ?? {
        requirementIds: new Set<string>(),
        evidenceIds: new Set<string>(),
      };

      existing.requirementIds.add(requirement.id);
      existing.evidenceIds.add(fact.id);
      targetMap.set(term, existing);
    }
  }

  const items: TailoredDraftItem[] = [];

  if (cvTerms.size) {
    items.push(
      buildSkillsLine(
        "draft_skills_cv",
        cvTerms,
        "cv_only",
        "ready",
      ),
    );
  }

  if (userTerms.size) {
    items.push(
      buildSkillsLine(
        "draft_skills_user",
        userTerms,
        "user_confirmed_only",
        "needs_review",
      ),
    );
  }

  return {
    id: "skills",
    title: "Skills",
    items,
  };
}

function buildFactSection(
  factKind: "experience" | "project",
  title: string,
  type: TailoredDraftItem["type"],
  supportedRequirements: JobRequirement[],
  factsById: Map<string, CandidateFact>,
): TailoredDraftSection {
  const groups = new Map<string, FactGroup>();

  for (const requirement of supportedRequirements) {
    const match = requirement.matchedEvidence.find((candidate) => {
      const fact = factsById.get(candidate.factId);
      return fact ? getFactKindFromSourceSection(fact.sourceSection) === factKind : false;
    });

    if (!match) {
      continue;
    }

    const fact = factsById.get(match.factId);

    if (!fact) {
      continue;
    }

    const existing = groups.get(fact.id) ?? {
      fact,
      requirementIds: new Set<string>(),
      maxImportance: 0,
      maxScore: 0,
    };

    existing.requirementIds.add(requirement.id);
    existing.maxImportance = Math.max(existing.maxImportance, requirement.importance);
    existing.maxScore = Math.max(existing.maxScore, match.score);
    groups.set(fact.id, existing);
  }

  const items = [...groups.values()]
    .sort(
      (left, right) =>
        right.maxImportance - left.maxImportance ||
        right.maxScore - left.maxScore ||
        Number(left.fact.source === "user_confirmed") -
          Number(right.fact.source === "user_confirmed"),
    )
    .slice(0, 8)
    .map<TailoredDraftItem>((group, index) => ({
      id: `draft_${factKind}_${index + 1}`,
      type,
      text: group.fact.text,
      evidenceIds: [group.fact.id],
      requirementIds: [...group.requirementIds],
      sourceLabel: toDraftSourceLabel([group.fact]),
      reviewState: group.fact.source === "cv" ? "ready" : "needs_review",
      warnings: [],
    }));

  return {
    id: factKind === "experience" ? "experience" : "projects",
    title,
    items,
  };
}

function buildCredentialSection(
  factKind: "education" | "certification" | "language",
  title: string,
  supportedRequirements: JobRequirement[],
  factsById: Map<string, CandidateFact>,
): TailoredDraftSection {
  const groups = new Map<string, FactGroup>();

  for (const requirement of supportedRequirements) {
    const match = requirement.matchedEvidence.find((candidate) => {
      const fact = factsById.get(candidate.factId);
      return fact ? getFactKindFromSourceSection(fact.sourceSection) === factKind : false;
    });

    if (!match) {
      continue;
    }

    const fact = factsById.get(match.factId);

    if (!fact) {
      continue;
    }

    const existing = groups.get(fact.id) ?? {
      fact,
      requirementIds: new Set<string>(),
      maxImportance: 0,
      maxScore: 0,
    };

    existing.requirementIds.add(requirement.id);
    existing.maxImportance = Math.max(existing.maxImportance, requirement.importance);
    existing.maxScore = Math.max(existing.maxScore, match.score);
    groups.set(fact.id, existing);
  }

  const items = [...groups.values()]
    .sort(
      (left, right) =>
        right.maxImportance - left.maxImportance ||
        right.maxScore - left.maxScore,
    )
    .map<TailoredDraftItem>((group, index) => ({
      id: `draft_${factKind}_${index + 1}`,
      type: factKind === "language" ? "language_line" : "credential_line",
      text: group.fact.text,
      evidenceIds: [group.fact.id],
      requirementIds: [...group.requirementIds],
      sourceLabel: toDraftSourceLabel([group.fact]),
      reviewState: group.fact.source === "cv" ? "ready" : "needs_review",
      warnings: [],
    }));

  return {
    id:
      factKind === "education"
        ? "education"
        : factKind === "certification"
          ? "certifications"
          : "languages",
    title,
    items,
  };
}

function buildReviewNotesSection(
  blockedRequirements: JobRequirement[],
  missingHighImportanceRequirements: JobRequirement[],
  weakRequirements: JobRequirement[],
  items: TailoredDraftItem[],
): TailoredDraftSection {
  const reviewItems: TailoredDraftItem[] = [];

  for (const [index, requirement] of blockedRequirements.entries()) {
    reviewItems.push({
      id: `review_blocked_${index + 1}`,
      type: "review_note",
      text: `Blocked hard blocker: ${requirement.text}`,
      evidenceIds: [],
      requirementIds: [requirement.id],
      sourceLabel: "passthrough",
      reviewState: "needs_review",
      warnings: [],
    });
  }

  for (const [index, requirement] of missingHighImportanceRequirements.entries()) {
    reviewItems.push({
      id: `review_missing_${index + 1}`,
      type: "review_note",
      text: `Missing high-importance requirement: ${requirement.text}`,
      evidenceIds: [],
      requirementIds: [requirement.id],
      sourceLabel: "passthrough",
      reviewState: "needs_review",
      warnings: [],
    });
  }

  for (const [index, requirement] of weakRequirements.entries()) {
    reviewItems.push({
      id: `review_weak_${index + 1}`,
      type: "review_note",
      text: `Needs confirmation before claiming: ${requirement.text}`,
      evidenceIds: [],
      requirementIds: [requirement.id],
      sourceLabel: "passthrough",
      reviewState: "needs_review",
      warnings: [],
    });
  }

  const userOnlyItems = items.filter(
    (item) => item.sourceLabel === "user_confirmed_only",
  );

  for (const [index, item] of userOnlyItems.entries()) {
    reviewItems.push({
      id: `review_user_only_${index + 1}`,
      type: "review_note",
      text: `User-confirmed item excluded from default copy until reviewed: ${item.text}`,
      evidenceIds: item.evidenceIds,
      requirementIds: item.requirementIds,
      sourceLabel: "passthrough",
      reviewState: "needs_review",
      warnings: [],
    });
  }

  return {
    id: "review_notes",
    title: "Review Notes",
    items: reviewItems,
  };
}

function buildSkillsLine(
  id: string,
  terms: Map<string, { requirementIds: Set<string>; evidenceIds: Set<string> }>,
  sourceLabel: DraftSourceLabel,
  reviewState: TailoredDraftItem["reviewState"],
): TailoredDraftItem {
  const orderedTerms = [...terms.keys()].slice(0, 12);

  return {
    id,
    type: "skills_line",
    text: orderedTerms.map(formatDraftTerm).join(", "),
    evidenceIds: uniqueStrings(
      orderedTerms.flatMap((term) => [...(terms.get(term)?.evidenceIds ?? [])]),
    ),
    requirementIds: uniqueStrings(
      orderedTerms.flatMap((term) => [...(terms.get(term)?.requirementIds ?? [])]),
    ),
    sourceLabel,
    reviewState,
    warnings: [],
  };
}

function extractExactSupportedTerms(
  requirement: JobRequirement,
  fact: CandidateFact,
) {
  const normalizedFactText = normalizeText(fact.text).toLowerCase();
  const factKeywordSet = new Set([
    ...fact.skills.map((value) => value.toLowerCase()),
    ...fact.tools.map((value) => value.toLowerCase()),
  ]);

  return requirement.normalizedKeywords.filter((keyword) => {
    if (isGenericKeyword(keyword) || keyword.length < 2) {
      return false;
    }

    return (
      normalizedFactText.includes(keyword) ||
      factKeywordSet.has(keyword) ||
      fact.tools.some((tool) => tool.toLowerCase() === keyword)
    );
  });
}

function toDraftSourceLabel(facts: CandidateFact[]): DraftSourceLabel {
  const sources = uniqueStrings(facts.map((fact) => fact.source));

  if (!sources.length) {
    return "passthrough";
  }

  if (sources.length > 1) {
    return "mixed";
  }

  return sources[0] === "cv" ? "cv_only" : "user_confirmed_only";
}

function isSkillLikeRequirement(requirement: JobRequirement) {
  return (
    requirement.category === "tool" ||
    requirement.category === "domain" ||
    requirement.category === "soft_skill" ||
    requirement.category === "must_have"
  );
}

function isExperienceLikeFact(fact: CandidateFact) {
  const factKind = getFactKindFromSourceSection(fact.sourceSection);
  return factKind === "experience" || factKind === "project";
}

function getFactKindFromSourceSection(sourceSection: string) {
  const normalized = sourceSection.toLowerCase();

  if (
    normalized === "experience" ||
    normalized === "employment" ||
    normalized === "work history" ||
    normalized === "professional experience"
  ) {
    return "experience";
  }

  if (normalized === "projects" || normalized === "project experience") {
    return "project";
  }

  if (normalized === "education") {
    return "education";
  }

  if (normalized === "certifications" || normalized === "licenses") {
    return "certification";
  }

  if (normalized === "languages") {
    return "language";
  }

  if (
    normalized === "skills" ||
    normalized === "technical skills" ||
    normalized === "core skills" ||
    normalized === "tools" ||
    normalized === "technologies"
  ) {
    return "skills";
  }

  return "other";
}

function formatDraftTerm(value: string) {
  const specialTerms: Record<string, string> = {
    api: "API",
    jira: "Jira",
    "node.js": "Node.js",
    "power bi": "Power BI",
    saas: "SaaS",
    sql: "SQL",
  };

  if (specialTerms[value]) {
    return specialTerms[value];
  }

  if (/^[a-z]{2,4}$/.test(value)) {
    return value.toUpperCase();
  }

  return value
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
