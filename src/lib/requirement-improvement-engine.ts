import { normalizeText, uniqueStrings } from "@/lib/analysis-utils";
import {
  getConfirmationPrompt,
  getDefaultUserEvidenceType,
} from "@/lib/user-evidence";
import type {
  CandidateFact,
  ImprovementCoverage,
  ImprovementRequirementFacet,
  ImprovementSectionId,
  ImprovementTruthRisk,
  JobRequirement,
  RequirementImprovementDecision,
  RequirementImprovementQuestion,
  RequirementImprovementResult,
  RequirementImprovementSectionGroup,
  RequirementImprovementSuggestion,
  SectionText,
} from "@/lib/types";

const SECTION_ORDER: ImprovementSectionId[] = [
  "header",
  "summary",
  "skills",
  "experience",
  "projects",
  "education",
  "certifications",
  "languages",
];

const SECTION_TITLES: Record<ImprovementSectionId, string> = {
  header: "Header",
  summary: "Summary",
  skills: "Skills",
  experience: "Experience",
  projects: "Projects",
  education: "Education",
  certifications: "Certifications",
  languages: "Languages",
};

const LOCATION_PATTERNS = [
  /\bbased in\b/i,
  /\blocated in\b/i,
  /\bmust reside\b/i,
  /\bon-site\b/i,
  /\bonsite\b/i,
  /\bhybrid\b/i,
  /\bremote within\b/i,
];

const LANGUAGE_PATTERNS = [
  /\benglish\b/i,
  /\bfrench\b/i,
  /\bgerman\b/i,
  /\bdutch\b/i,
  /\bspanish\b/i,
  /\bitalian\b/i,
  /\bportuguese\b/i,
  /\bfluent\b/i,
  /\bnative\b/i,
  /\bprofessional proficiency\b/i,
  /\bc1\b/i,
  /\bc2\b/i,
  /\bb2\b/i,
];

const SENIORITY_PATTERNS = [
  /\bjunior\b/i,
  /\bmid[- ]level\b/i,
  /\bsenior\b/i,
  /\blead\b/i,
  /\bstaff\b/i,
  /\bprincipal\b/i,
  /\bmanager\b/i,
  /\bhead of\b/i,
  /\b\d+\+?\s+years?\b/i,
];

const TERM_EDGE_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "for",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
]);

const TERM_LEAD_VERBS = new Set([
  "analyze",
  "build",
  "communicate",
  "coordinate",
  "create",
  "document",
  "manage",
  "support",
  "track",
  "write",
  "wrote",
]);

type ImprovementContext = {
  cvSectionTextById: Map<ImprovementSectionId, string>;
  factsById: Map<string, CandidateFact>;
};

export function buildRequirementImprovements(
  cvSections: SectionText[],
  facts: CandidateFact[],
  requirements: JobRequirement[],
): RequirementImprovementResult {
  const context: ImprovementContext = {
    cvSectionTextById: buildCvSectionTextById(cvSections),
    factsById: new Map(facts.map((fact) => [fact.id, fact])),
  };
  const decisions = requirements.map((requirement) =>
    buildRequirementDecision(requirement, context),
  );
  const suggestions = decisions
    .flatMap((decision) => decision.suggestionId)
    .map((suggestionId) =>
      decisions.find((decision) => decision.suggestionId === suggestionId),
    )
    .filter(Boolean)
    .map((decision) => buildSuggestionFromDecision(decision as InternalDecision, context))
    .filter((suggestion): suggestion is RequirementImprovementSuggestion => Boolean(suggestion));
  const questions = decisions
    .filter((decision) => decision.question)
    .map((decision) => decision.question as RequirementImprovementQuestion);

  return {
    summary: {
      coveredCount: decisions.filter((decision) => decision.coverage === "covered").length,
      partiallyCoveredCount: decisions.filter(
        (decision) => decision.coverage === "partially_covered",
      ).length,
      missingCount: decisions.filter((decision) => decision.coverage === "missing").length,
      unclearCount: decisions.filter((decision) => decision.coverage === "unclear").length,
      lowRiskCount: decisions.filter((decision) => decision.truthRisk === "low").length,
      mediumRiskCount: decisions.filter((decision) => decision.truthRisk === "medium").length,
      highRiskCount: decisions.filter((decision) => decision.truthRisk === "high").length,
      confirmationQuestionCount: questions.length,
    },
    requirements: decisions.map(toPublicDecision),
    sectionGroups: groupSuggestionsBySection(suggestions),
    questions,
  };
}

type InternalDecision = RequirementImprovementDecision & {
  bestCvFact?: CandidateFact;
  question?: RequirementImprovementQuestion;
  suggestedText?: string;
};

function buildRequirementDecision(
  requirement: JobRequirement,
  context: ImprovementContext,
): InternalDecision {
  const bestCvFact = getBestCvFact(requirement, context.factsById);
  const facet = classifyFacet(requirement);
  const coverage = deriveCoverage(requirement, bestCvFact);
  const evidenceSnippets = bestCvFact ? [bestCvFact.text] : [];
  const evidenceIds = bestCvFact ? [bestCvFact.id] : [];
  const currentSectionId = bestCvFact
    ? toImprovementSectionId(bestCvFact.sourceSection)
    : undefined;
  const recommendedTargetSectionId = getRecommendedTargetSectionId(
    facet,
    currentSectionId,
    context.cvSectionTextById,
  );
  const supportedTerms = bestCvFact
    ? getSupportedRequirementTerms(requirement, bestCvFact)
    : [];

  if (!bestCvFact) {
    const question = buildImprovementQuestion(
      requirement,
      facet,
      coverage,
      recommendedTargetSectionId,
      "No grounded CV evidence was found for this requirement, so SmartCV needs user confirmation before suggesting wording.",
      "high",
    );

    return {
      requirementId: requirement.id,
      requirementText: requirement.text,
      facet,
      coverage,
      action: "ask_user_for_confirmation",
      targetSectionId: recommendedTargetSectionId,
      reason: question.reason,
      evidenceIds,
      evidenceSnippets,
      keywordsAdded: [],
      truthRisk: "high",
      questionId: question.id,
      bestCvFact: undefined,
      question,
    };
  }

  const skillsSuggestion = buildSkillsSuggestion(
    requirement,
    bestCvFact,
    facet,
    coverage,
    supportedTerms,
    context,
  );
  if (skillsSuggestion) {
    return {
      requirementId: requirement.id,
      requirementText: requirement.text,
      facet,
      coverage,
      action: "add_keyword_to_existing_truth",
      targetSectionId: skillsSuggestion.targetSectionId,
      reason: skillsSuggestion.reason,
      evidenceIds,
      evidenceSnippets,
      keywordsAdded: skillsSuggestion.keywordsAdded,
      truthRisk: skillsSuggestion.truthRisk,
      suggestionId: skillsSuggestion.id,
      bestCvFact,
      suggestedText: skillsSuggestion.suggestedText,
    };
  }

  const moveSuggestion = buildMoveSuggestion(
    requirement,
    bestCvFact,
    facet,
    coverage,
    currentSectionId,
    recommendedTargetSectionId,
  );
  if (moveSuggestion) {
    return {
      requirementId: requirement.id,
      requirementText: requirement.text,
      facet,
      coverage,
      action: "move_existing_evidence",
      targetSectionId: moveSuggestion.targetSectionId,
      reason: moveSuggestion.reason,
      evidenceIds,
      evidenceSnippets,
      keywordsAdded: [],
      truthRisk: moveSuggestion.truthRisk,
      suggestionId: moveSuggestion.id,
      bestCvFact,
      suggestedText: moveSuggestion.suggestedText,
    };
  }

  const summarySuggestion = buildSummarySuggestion(
    requirement,
    bestCvFact,
    facet,
    coverage,
    supportedTerms,
    context,
  );
  if (summarySuggestion) {
    return {
      requirementId: requirement.id,
      requirementText: requirement.text,
      facet,
      coverage,
      action: "rewrite_existing_evidence",
      targetSectionId: summarySuggestion.targetSectionId,
      reason: summarySuggestion.reason,
      evidenceIds,
      evidenceSnippets,
      keywordsAdded: summarySuggestion.keywordsAdded,
      truthRisk: summarySuggestion.truthRisk,
      suggestionId: summarySuggestion.id,
      bestCvFact,
      suggestedText: summarySuggestion.suggestedText,
    };
  }

  if (coverage === "missing" || coverage === "unclear") {
    const question = buildImprovementQuestion(
      requirement,
      facet,
      coverage,
      recommendedTargetSectionId,
      "The current CV evidence is not strong enough to suggest truthful wording safely.",
      bestCvFact.source === "cv" ? "medium" : "high",
    );

    return {
      requirementId: requirement.id,
      requirementText: requirement.text,
      facet,
      coverage,
      action: "ask_user_for_confirmation",
      targetSectionId: recommendedTargetSectionId,
      reason: question.reason,
      evidenceIds,
      evidenceSnippets,
      keywordsAdded: [],
      truthRisk: question.truthRisk,
      questionId: question.id,
      bestCvFact,
      question,
    };
  }

  return {
    requirementId: requirement.id,
    requirementText: requirement.text,
    facet,
    coverage,
    action: "do_not_add",
    targetSectionId: recommendedTargetSectionId,
    reason:
      coverage === "covered"
        ? "This requirement is already grounded in the current CV evidence, so no extra wording is suggested in this pass."
        : "SmartCV could not produce a grounded wording improvement safely in this pass.",
    evidenceIds,
    evidenceSnippets,
    keywordsAdded: [],
    truthRisk: coverage === "covered" ? "low" : "medium",
    bestCvFact,
  };
}

function buildSkillsSuggestion(
  requirement: JobRequirement,
  bestCvFact: CandidateFact,
  facet: ImprovementRequirementFacet,
  coverage: ImprovementCoverage,
  supportedTerms: string[],
  context: ImprovementContext,
) {
  if (
    !["tool", "domain", "soft_skill", "must_have", "preferred"].includes(facet) ||
    !context.cvSectionTextById.has("skills")
  ) {
    return null;
  }

  const originalText = context.cvSectionTextById.get("skills") ?? "";
  const termsToAdd = supportedTerms
    .filter((term) => !containsNormalizedText(originalText, term))
    .slice(0, 3);

  if (!termsToAdd.length) {
    return null;
  }

  const suggestedText = appendTermsToSkillsSection(originalText, termsToAdd);

  if (!suggestedText || suggestedText === originalText) {
    return null;
  }

  return {
    id: `improvement_${requirement.id}_skills`,
    targetSectionId: "skills" as const,
    originalText,
    suggestedText,
    reason:
      "This requirement is already supported by CV evidence, but the related keyword is not surfaced clearly in the Skills section.",
    keywordsAdded: termsToAdd,
    truthRisk: allTermsAreExplicit(bestCvFact, termsToAdd) ? ("low" as const) : ("medium" as const),
    coverage,
  };
}

function buildMoveSuggestion(
  requirement: JobRequirement,
  bestCvFact: CandidateFact,
  facet: ImprovementRequirementFacet,
  coverage: ImprovementCoverage,
  currentSectionId: ImprovementSectionId | undefined,
  recommendedTargetSectionId: ImprovementSectionId | undefined,
) {
  if (!currentSectionId || !recommendedTargetSectionId) {
    return null;
  }

  if (currentSectionId === recommendedTargetSectionId) {
    return null;
  }

  if (!["summary", "header", "skills"].includes(currentSectionId)) {
    return null;
  }

  if (!["must_have", "responsibility", "domain", "tool", "preferred"].includes(facet)) {
    return null;
  }

  if (bestCvFact.text.trim().length < 18) {
    return null;
  }

  return {
    id: `improvement_${requirement.id}_move`,
    targetSectionId: recommendedTargetSectionId,
    originalText: bestCvFact.text,
    suggestedText: bestCvFact.text,
    reason: `This evidence exists in the ${SECTION_TITLES[currentSectionId]} section, but it would be stronger and easier to scan in ${SECTION_TITLES[recommendedTargetSectionId]}.`,
    keywordsAdded: [],
    truthRisk: "low" as const,
    coverage,
  };
}

function buildSummarySuggestion(
  requirement: JobRequirement,
  bestCvFact: CandidateFact,
  facet: ImprovementRequirementFacet,
  coverage: ImprovementCoverage,
  supportedTerms: string[],
  context: ImprovementContext,
) {
  if (
    !context.cvSectionTextById.has("summary") ||
    !["tool", "domain", "soft_skill", "preferred"].includes(facet) ||
    bestCvFact.sourceSection.toLowerCase() === "summary"
  ) {
    return null;
  }

  const originalText = context.cvSectionTextById.get("summary") ?? "";
  const termsToAdd = supportedTerms
    .filter((term) => !containsNormalizedText(originalText, term))
    .slice(0, 2);

  if (!termsToAdd.length) {
    return null;
  }

  const suggestedText = appendTermsToSummary(originalText, termsToAdd);

  if (!suggestedText || suggestedText === originalText) {
    return null;
  }

  return {
    id: `improvement_${requirement.id}_summary`,
    targetSectionId: "summary" as const,
    originalText,
    suggestedText,
    reason:
      "The CV already contains grounded evidence for this requirement, but the summary does not surface that strength clearly yet.",
    keywordsAdded: termsToAdd,
    truthRisk: allTermsAreExplicit(bestCvFact, termsToAdd) ? ("low" as const) : ("medium" as const),
    coverage,
  };
}

function buildImprovementQuestion(
  requirement: JobRequirement,
  facet: ImprovementRequirementFacet,
  coverage: ImprovementCoverage,
  recommendedTargetSectionId: ImprovementSectionId | undefined,
  reason: string,
  truthRisk: ImprovementTruthRisk,
): RequirementImprovementQuestion {
  return {
    id: `improvement_question_${requirement.id}`,
    requirementId: requirement.id,
    requirementText: requirement.text,
    facet,
    prompt: getConfirmationPrompt(requirement),
    suggestedEvidenceType: getDefaultUserEvidenceType(requirement),
    reason:
      coverage === "partially_covered"
        ? `${reason} SmartCV found only partial support in the current CV.`
        : reason,
    truthRisk,
    recommendedTargetSectionId,
  };
}

function buildSuggestionFromDecision(
  decision: InternalDecision,
  context: ImprovementContext,
): RequirementImprovementSuggestion | null {
  if (
    !decision.suggestionId ||
    !decision.bestCvFact ||
    !decision.targetSectionId ||
    !decision.suggestedText
  ) {
    return null;
  }

  const originalText =
    decision.action === "add_keyword_to_existing_truth" ||
    decision.action === "rewrite_existing_evidence"
      ? context.cvSectionTextById.get(decision.targetSectionId) ?? decision.bestCvFact.text
      : decision.bestCvFact.text;

  if (
    decision.action !== "rewrite_existing_evidence" &&
    decision.action !== "move_existing_evidence" &&
    decision.action !== "add_keyword_to_existing_truth"
  ) {
    return null;
  }

  return {
    id: decision.suggestionId,
    requirementId: decision.requirementId,
    requirementText: decision.requirementText,
    targetSectionId: decision.targetSectionId,
    originalText,
    suggestedText: decision.suggestedText,
    action: decision.action,
    reason: decision.reason,
    cvEvidenceIds: decision.evidenceIds,
    cvEvidenceSnippets: decision.evidenceSnippets,
    keywordsAdded: decision.keywordsAdded,
    truthRisk: decision.truthRisk,
    coverage: decision.coverage,
  };
}

function groupSuggestionsBySection(
  suggestions: RequirementImprovementSuggestion[],
): RequirementImprovementSectionGroup[] {
  const groups = new Map<ImprovementSectionId, RequirementImprovementSuggestion[]>();

  for (const suggestion of suggestions) {
    const existing = groups.get(suggestion.targetSectionId) ?? [];
    existing.push(suggestion);
    groups.set(suggestion.targetSectionId, existing);
  }

  return SECTION_ORDER.filter((sectionId) => groups.has(sectionId)).map((sectionId) => ({
    sectionId,
    title: SECTION_TITLES[sectionId],
    suggestions: groups.get(sectionId) ?? [],
  }));
}

function toPublicDecision(decision: InternalDecision): RequirementImprovementDecision {
  return {
    requirementId: decision.requirementId,
    requirementText: decision.requirementText,
    facet: decision.facet,
    coverage: decision.coverage,
    action: decision.action,
    targetSectionId: decision.targetSectionId,
    reason: decision.reason,
    evidenceIds: decision.evidenceIds,
    evidenceSnippets: decision.evidenceSnippets,
    keywordsAdded: decision.keywordsAdded,
    truthRisk: decision.truthRisk,
    questionId: decision.questionId,
    suggestionId: decision.suggestionId,
  };
}

function buildCvSectionTextById(sections: SectionText[]) {
  const map = new Map<ImprovementSectionId, string>();

  for (const section of sections) {
    const sectionId = toImprovementSectionId(section.label);
    if (!sectionId || map.has(sectionId)) {
      continue;
    }

    map.set(sectionId, section.text.trim());
  }

  return map;
}

function getBestCvFact(
  requirement: JobRequirement,
  factsById: Map<string, CandidateFact>,
) {
  for (const match of requirement.matchedEvidence) {
    if (match.evidenceSource !== "cv") {
      continue;
    }

    const fact = factsById.get(match.factId);
    if (fact) {
      return fact;
    }
  }

  return undefined;
}

function classifyFacet(requirement: JobRequirement): ImprovementRequirementFacet {
  const text = requirement.text.toLowerCase();

  if (LANGUAGE_PATTERNS.some((pattern) => pattern.test(text))) {
    return "language";
  }

  if (LOCATION_PATTERNS.some((pattern) => pattern.test(text))) {
    return "location";
  }

  if (SENIORITY_PATTERNS.some((pattern) => pattern.test(text))) {
    return "seniority";
  }

  switch (requirement.category) {
    case "nice_to_have":
      return "preferred";
    case "responsibility":
      return "responsibility";
    case "tool":
      return "tool";
    case "domain":
      return "domain";
    case "soft_skill":
      return "soft_skill";
    default:
      return "must_have";
  }
}

function deriveCoverage(
  requirement: JobRequirement,
  bestCvFact?: CandidateFact,
): ImprovementCoverage {
  if (requirement.evidenceStatus === "supported" && bestCvFact) {
    return "covered";
  }

  if (requirement.evidenceStatus === "weak") {
    return bestCvFact ? "partially_covered" : "unclear";
  }

  if (requirement.evidenceStatus === "blocked") {
    return bestCvFact ? "partially_covered" : "unclear";
  }

  return "missing";
}

function getRecommendedTargetSectionId(
  facet: ImprovementRequirementFacet,
  currentSectionId: ImprovementSectionId | undefined,
  sectionTextById: Map<ImprovementSectionId, string>,
) {
  switch (facet) {
    case "tool":
    case "domain":
    case "soft_skill":
      return sectionTextById.has("skills") ? "skills" : currentSectionId;
    case "language":
      return sectionTextById.has("languages") ? "languages" : currentSectionId;
    case "location":
      return sectionTextById.has("header") ? "header" : currentSectionId;
    case "seniority":
    case "must_have":
    case "responsibility":
      return sectionTextById.has("experience")
        ? "experience"
        : sectionTextById.has("projects")
          ? "projects"
          : sectionTextById.has("summary")
            ? "summary"
            : currentSectionId;
    case "preferred":
      return sectionTextById.has("summary")
        ? "summary"
        : sectionTextById.has("experience")
          ? "experience"
          : currentSectionId;
    default:
      return currentSectionId;
  }
}

function getSupportedRequirementTerms(
  requirement: JobRequirement,
  fact: CandidateFact,
) {
  const normalizedFactText = normalizeText(fact.text).toLowerCase();
  const factTerms = new Set(
    uniqueStrings([
      ...fact.skills.map((skill) => normalizeText(skill).toLowerCase()),
      ...fact.tools.map((tool) => normalizeText(tool).toLowerCase()),
      ...fact.metrics.map((metric) => normalizeText(metric).toLowerCase()),
    ]),
  );

  const candidates = requirement.keywords
    .map((keyword, index) => {
      const normalizedKeyword =
        requirement.normalizedKeywords[index] ??
        normalizeText(keyword).toLowerCase();

      return {
        normalizedKeyword,
        rawKeyword: keyword,
        supported:
          normalizedKeyword.length >= 3 &&
          isUsefulSuggestionTerm(normalizedKeyword) &&
          (normalizedFactText.includes(normalizedKeyword) ||
            factTerms.has(normalizedKeyword)),
      };
    })
    .filter((candidate) => candidate.supported)
    .sort(
      (left, right) =>
        right.normalizedKeyword.length - left.normalizedKeyword.length ||
        left.rawKeyword.localeCompare(right.rawKeyword),
    );
  const selected: { normalizedKeyword: string; rawKeyword: string }[] = [];

  for (const candidate of candidates) {
    const isCoveredByExisting = selected.some((existing) =>
      existing.normalizedKeyword.includes(candidate.normalizedKeyword),
    );

    if (isCoveredByExisting) {
      continue;
    }

    selected.push(candidate);

    if (selected.length >= 4) {
      break;
    }
  }

  return selected.map((candidate) =>
    formatSuggestionTerm(candidate.normalizedKeyword),
  );
}

function appendTermsToSkillsSection(originalText: string, termsToAdd: string[]) {
  const existingTerms = originalText
    .split(/\n|,/)
    .map((term) => term.trim())
    .filter(Boolean);
  const mergedTerms = uniqueStrings([...existingTerms, ...termsToAdd]).slice(0, 20);

  return mergedTerms.join(", ");
}

function appendTermsToSummary(originalText: string, termsToAdd: string[]) {
  const trimmed = originalText.trim();
  if (!trimmed) {
    return "";
  }

  const base = trimmed.replace(/[.;:\s]+$/, "");
  const phrase = formatNaturalList(termsToAdd.map(formatSuggestionTerm));

  if (!phrase) {
    return trimmed;
  }

  return `${base}. Core strengths also include ${phrase}.`;
}

function allTermsAreExplicit(fact: CandidateFact, terms: string[]) {
  return terms.every((term) => containsNormalizedText(fact.text, term));
}

function formatNaturalList(values: string[]) {
  if (!values.length) {
    return "";
  }

  if (values.length === 1) {
    return values[0];
  }

  if (values.length === 2) {
    return `${values[0]} and ${values[1]}`;
  }

  return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
}

function formatSuggestionTerm(value: string) {
  return value
    .split(" ")
    .map((word) => {
      if (/^[A-Z0-9.+-]+$/.test(word)) {
        return word;
      }

      if (/^(api|bi|saas|sql)$/i.test(word)) {
        return word.toUpperCase();
      }

      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

function isUsefulSuggestionTerm(normalizedKeyword: string) {
  const words = normalizedKeyword.split(" ").filter(Boolean);

  if (!words.length || words.length > 3) {
    return false;
  }

  const first = words[0];
  const last = words[words.length - 1];

  if (TERM_EDGE_STOPWORDS.has(first) || TERM_EDGE_STOPWORDS.has(last)) {
    return false;
  }

  if (TERM_LEAD_VERBS.has(first)) {
    return false;
  }

  return words.some((word) => word.length >= 4);
}

function containsNormalizedText(text: string, candidate: string) {
  const normalizedText = normalizeText(text).toLowerCase();
  const normalizedCandidate = normalizeText(candidate).toLowerCase();

  return normalizedCandidate.length > 0 && normalizedText.includes(normalizedCandidate);
}

function toImprovementSectionId(label: string): ImprovementSectionId | undefined {
  const normalized = label.toLowerCase().trim();

  if (normalized === "header") return "header";
  if (normalized === "summary" || normalized === "profile" || normalized === "objective") {
    return "summary";
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
  if (
    normalized === "experience" ||
    normalized === "employment" ||
    normalized === "work history" ||
    normalized === "professional experience"
  ) {
    return "experience";
  }
  if (normalized === "projects" || normalized === "project experience") {
    return "projects";
  }
  if (normalized === "education") {
    return "education";
  }
  if (normalized === "certifications" || normalized === "licenses") {
    return "certifications";
  }
  if (normalized === "languages") {
    return "languages";
  }

  return undefined;
}
