import {
  KNOWN_CERTIFICATION_HINTS,
  KNOWN_DEGREE_HINTS,
  KNOWN_LANGUAGES,
  KNOWN_TOOLS,
  clamp,
  cleanListItem,
  countOccurrences,
  dedupeByNormalizedText,
  expandKeywordVariants,
  extractDelimitedItems,
  extractKeywords,
  findAnchor,
  getWeakSynonyms,
  hasDateLikeText,
  hasEducationLikeText,
  isGenericKeyword,
  normalizeKeywordPhrase,
  normalizeText,
  parseNumericValue,
  splitIntoSentences,
  splitTextIntoSections,
  uniqueStrings,
} from "@/lib/analysis-utils";
import {
  buildRequirementFingerprint,
  buildUserEvidenceAnchor,
  isMeaningfulUserEvidenceText,
} from "@/lib/user-evidence";
import { buildRequirementImprovements } from "@/lib/requirement-improvement-engine";
import type {
  AnalyzerMode,
  ATSHygieneWarning,
  CandidateFact,
  EvidenceMatch,
  EvidenceStatus,
  EvidenceStrength,
  GroundedOpenAIAssist,
  JobRequirement,
  MatchType,
  Phase1AnalysisResult,
  RequirementCategory,
  SectionText,
  TextAnchor,
  UserConfirmedEvidence,
  UserEvidenceType,
} from "@/lib/types";

const DEFAULT_LOCAL_MODEL = "local-deterministic-evidence-engine";

const EXPERIENCE_SECTIONS = new Set([
  "experience",
  "employment",
  "work history",
  "professional experience",
]);

const PROJECT_SECTIONS = new Set(["projects", "project experience"]);

const SKILLS_SECTIONS = new Set([
  "skills",
  "technical skills",
  "core skills",
  "tools",
  "technologies",
]);

const EDUCATION_SECTIONS = new Set(["education"]);

const CERTIFICATION_SECTIONS = new Set(["certifications", "licenses"]);

const LANGUAGE_SECTIONS = new Set(["languages"]);

const SUMMARY_SECTIONS = new Set(["summary", "profile", "objective"]);

const HEADER_SECTIONS = new Set(["header"]);

const BOILERPLATE_SECTION_PATTERNS = [
  /\babout us\b/i,
  /\bbenefits\b/i,
  /\bcompensation\b/i,
  /\bdiversity\b/i,
  /\bequal opportunity\b/i,
  /\bhow to apply\b/i,
  /\bour culture\b/i,
  /\bour mission\b/i,
  /\bperks\b/i,
  /\bprivacy\b/i,
  /\bprocess\b/i,
  /\byou should not apply if\b/i,
  /\bwhy join\b/i,
];

const BOILERPLATE_TEXT_PATTERNS = [
  /\ball qualified applicants\b/i,
  /\bapply now\b/i,
  /\bbackground check\b/i,
  /\bbenefits include\b/i,
  /\bclick apply\b/i,
  /\bequal opportunity employer\b/i,
  /\bflexible work\b/i,
  /\bhealth insurance\b/i,
  /\bonly shortlisted candidates\b/i,
  /\bprivacy policy\b/i,
  /\bsubmit your application\b/i,
  /\bwe value diversity\b/i,
];

const HARD_NON_REQUIREMENT_PROSE_PATTERNS = [
  /^(?:dear|hello|hi|thanks)\b/i,
  /^(?:i am|i'm|iâ€™m|my name is)\b/i,
  /^meet\s+[a-z]/i,
  /^you do not have\b/i,
  /^you are not\b/i,
  /^you value in-office culture\b/i,
  /\bthank you for\b/i,
  /\bfollow us\b/i,
  /\bvisit our\b/i,
  /\bcopyright\b/i,
  /\ball rights reserved\b/i,
  /\bterms of (?:use|service)\b/i,
  /\bcookie policy\b/i,
];

const NON_REQUIREMENT_PROSE_PATTERNS = [
  /^(?:we(?:'re| are)|our team|our company|our mission|our culture)\b.*\b(?:excited|thrilled|proud|happy)\b/i,
  /\bhere at\b/i,
  /\bjoin us\b/i,
  /\bwe(?:'re| are)\s+(?:excited|thrilled|delighted|happy)\b/i,
  /\babout (?:us|the company|the team)\b/i,
  /\bwhy (?:ashby|join us|work here)\b/i,
  /\bwe build\b/i,
  /\bwe believe\b/i,
  /\bwe started\b/i,
  /\bbacked by\b/i,
  /\bfounded in\b/i,
  /\bseries [abcde]\b/i,
];

const REQUIREMENT_SECTION_PATTERNS = [
  /\brequire/i,
  /\bqualif/i,
  /\bskills and experience\b/i,
  /\byou have\b/i,
  /\bwe are looking for\b/i,
  /\bwhat we are looking for\b/i,
  /\bmust have\b/i,
  /\babout you\b/i,
  /\bwho you are\b/i,
  /\bwhat you bring\b/i,
  /\byour profile\b/i,
  /\byou should apply if\b/i,
  /\byou may be a good fit if\b/i,
];

const RESPONSIBILITY_SECTION_PATTERNS = [
  /\bresponsibilit/i,
  /\bdut/i,
  /\bwhat you will do\b/i,
  /\bwhat you'll do\b/i,
  /\bwhat you'll be doing\b/i,
  /\bwhat you get to do\b/i,
];

const PREFERRED_SECTION_PATTERNS = [
  /\bpreferred\b/i,
  /\bnice to have\b/i,
  /\bbonus\b/i,
];

const MUST_HAVE_PATTERNS = [
  /\bat least\b/i,
  /\bmust\b/i,
  /\bmandatory\b/i,
  /\bminimum\b/i,
  /\bneed\b/i,
  /\bproven experience\b/i,
  /\brequired\b/i,
  /\byears? of experience\b/i,
];

const NICE_TO_HAVE_PATTERNS = [
  /\badvantage\b/i,
  /\bbonus\b/i,
  /\bdesirable\b/i,
  /\bnice to have\b/i,
  /\bplus\b/i,
  /\bpreferred\b/i,
  /\bwould be great\b/i,
];

const RESPONSIBILITY_PATTERNS = [
  /\banaly[sz]e\b/i,
  /\bbuild\b/i,
  /\bcollaborate\b/i,
  /\bcoordinate\b/i,
  /\bdeliver\b/i,
  /\bdocument\b/i,
  /\bdrive\b/i,
  /\bexecute\b/i,
  /\bimprove\b/i,
  /\binvestigate\b/i,
  /\blead\b/i,
  /\bmaintain\b/i,
  /\bmanage\b/i,
  /\bown\b/i,
  /\bpartner\b/i,
  /\breproduce\b/i,
  /\bresponsible for\b/i,
  /\bsupport\b/i,
  /\btroubleshoot\b/i,
  /\byou will\b/i,
];

const HARD_BLOCKER_PATTERNS = [
  /\bauthori[sz]ed to work\b/i,
  /\bbased in\b/i,
  /\bbachelor'?s?\b/i,
  /\bcertification required\b/i,
  /\bcitizen(ship)?\b/i,
  /\bclearance\b/i,
  /\bdegree required\b/i,
  /\bdriver'?s license\b/i,
  /\bdriving license\b/i,
  /\beligible to work\b/i,
  /\bfluent\b/i,
  /\bhybrid\b/i,
  /\bin-office\b/i,
  /\blanguage\b/i,
  /\blicense required\b/i,
  /\blocated in\b/i,
  /\bmaster'?s?\b/i,
  /\bmust reside\b/i,
  /\bnative\b/i,
  /\bon-site\b/i,
  /\bonsite\b/i,
  /\bphd\b/i,
  /\bright to work\b/i,
  /\bsecurity clearance\b/i,
  /\bshift\b/i,
  /\bsponsorship\b/i,
  /\btime zone\b/i,
  /\btimezone\b/i,
  /\btravel\b/i,
  /\bvisa\b/i,
  /\bwork authorization\b/i,
];

const DOMAIN_KEYWORDS = [
  "b2b",
  "b2c",
  "customer success",
  "ecommerce",
  "finance",
  "fintech",
  "healthcare",
  "manufacturing",
  "root cause analysis",
  "saas",
  "support operations",
  "technical support",
  "telecom",
];

const SOFT_SKILL_KEYWORDS = [
  "collaboration",
  "communication",
  "leadership",
  "ownership",
  "presentation",
  "problem solving",
  "stakeholder management",
  "stakeholder",
  "teamwork",
];

const LANGUAGE_PROFICIENCY_PATTERNS = [
  /\bb1\b/i,
  /\bb2\b/i,
  /\bc1\b/i,
  /\bc2\b/i,
  /\bfluent\b/i,
  /\bnative\b/i,
  /\bprofessional proficiency\b/i,
  /\bproficient\b/i,
];

const AUTHORIZATION_PATTERNS = [
  /\bauthori[sz]ed to work\b/i,
  /\beu citizen\b/i,
  /\bright to work\b/i,
  /\bsponsorship not required\b/i,
  /\bvisa\b/i,
  /\bwork permit\b/i,
];

const CLEARANCE_PATTERNS = [/\bsecurity clearance\b/i, /\bsc clearance\b/i, /\bclearance\b/i];

const DRIVING_LICENSE_PATTERNS = [/\bdriver'?s license\b/i, /\bdriving license\b/i];

const TRAVEL_PATTERNS = [/\btravel\b/i, /\bwilling(?:ness)? to travel\b/i];

const SHIFT_PATTERNS = [
  /\bcet\b/i,
  /\bcest\b/i,
  /\best\b/i,
  /\bnight shift\b/i,
  /\bpst\b/i,
  /\brotating shift\b/i,
  /\btime ?zone\b/i,
  /\bweekend\b/i,
];

type AnalyzeLocallyOptions = {
  assistant?: GroundedOpenAIAssist;
  confirmedEvidence?: UserConfirmedEvidence[];
  mode?: AnalyzerMode;
  model?: string;
  warnings?: string[];
};

type FactKind =
  | "experience"
  | "project"
  | "skills"
  | "summary"
  | "education"
  | "certification"
  | "language"
  | "header"
  | "other";

type HardBlockerKind =
  | "authorization"
  | "location"
  | "language"
  | "degree"
  | "certification"
  | "clearance"
  | "driving_license"
  | "travel"
  | "shift"
  | "other";

type SectionIntent =
  | "boilerplate"
  | "must_have"
  | "preferred"
  | "responsibility"
  | "about_you"
  | "general";

type RequirementSignal = {
  hardBlockerKind?: HardBlockerKind;
  locationPhrase?: string;
  locationTokens: string[];
  explicitLanguageTerms: string[];
  explicitDegreeTerms: string[];
  explicitCertificationTerms: string[];
  requiredYears?: number;
  specificKeywords: string[];
  toolKeywords: string[];
};

type IndexedFact = CandidateFact & {
  factKind: FactKind;
  searchText: string;
  normalizedKeywords: string[];
  weakKeywordVariants: string[];
  sectionWeight: number;
  explicitLanguages: string[];
  explicitDegreeTerms: string[];
  explicitCertificationTerms: string[];
  explicitAuthorization: boolean;
  explicitClearance: boolean;
  explicitDrivingLicense: boolean;
  explicitTravel: boolean;
  explicitShiftAvailability: boolean;
  locationTokens: string[];
  derivedYears: number | null;
  explicitYears: number | null;
};

type RawRequirement = {
  text: string;
  sourceSection?: string;
  anchors: TextAnchor[];
  intent: SectionIntent;
};

type OverlapAnalysis = {
  exactKeywordMatches: string[];
  phraseMatches: string[];
  toolMatches: string[];
  weakSynonymMatches: string[];
  specificOverlap: string[];
  exactRequirementPhrase: boolean;
};

export function analyzeLocally(
  cvText: string,
  jobText: string,
  jobUrl = "",
  options: AnalyzeLocallyOptions = {},
): Phase1AnalysisResult {
  const normalizedCv = normalizeText(cvText);
  const normalizedJob = normalizeText(jobText);
  const cvSections = splitTextIntoSections(normalizedCv, "cv");
  const cvFacts = extractCandidateFacts(normalizedCv, cvSections);
  const jobSections = splitTextIntoSections(normalizedJob, "job");
  const jobTitle = inferJobTitle(normalizedJob, jobUrl, options.assistant?.title);
  const requirements = extractJobRequirements(
    normalizedJob,
    jobSections,
    options.assistant,
  );
  const metaWarnings = [...(options.warnings ?? [])];
  const requirementFingerprints = new Set(
    requirements.map((requirement) => requirement.fingerprint),
  );
  const applicableConfirmedEvidence = (options.confirmedEvidence ?? []).filter(
    (item) => requirementFingerprints.has(item.requirementFingerprint),
  );
  const staleConfirmedEvidenceCount =
    (options.confirmedEvidence ?? []).length - applicableConfirmedEvidence.length;
  const confirmedFacts = buildUserConfirmedFacts(applicableConfirmedEvidence);
  const allFacts = [...cvFacts, ...confirmedFacts];
  const matchedRequirements = matchRequirementsToFacts(requirements, allFacts);
  const atsWarnings = runAtsHygieneChecks(cvText, cvSections, cvFacts);
  const scoring = computeScoring(matchedRequirements, atsWarnings);
  const improvements = buildRequirementImprovements(
    cvSections,
    allFacts,
    matchedRequirements,
  );

  if (staleConfirmedEvidenceCount > 0) {
    metaWarnings.push(
      "Some saved user confirmations did not match the current job requirements and were not applied.",
    );
  }

  if (applicableConfirmedEvidence.length > 0 && confirmedFacts.length === 0) {
    metaWarnings.push(
      "Saved user confirmations were available, but they were too vague or incomplete to use as evidence.",
    );
  }

  return {
    meta: {
      version: "phase1.v1",
      mode: options.mode ?? "local",
      model: options.model ?? DEFAULT_LOCAL_MODEL,
      generatedAt: new Date().toISOString(),
      warnings: metaWarnings,
    },
    cv: {
      rawTextLength: normalizedCv.length,
      sections: cvSections,
      facts: allFacts,
    },
    job: {
      sourceUrl: jobUrl || undefined,
      title: jobTitle,
      requirements: matchedRequirements,
    },
    matching: {
      supportedCount: matchedRequirements.filter(
        (requirement) => requirement.evidenceStatus === "supported",
      ).length,
      weakCount: matchedRequirements.filter(
        (requirement) => requirement.evidenceStatus === "weak",
      ).length,
      missingCount: matchedRequirements.filter(
        (requirement) => requirement.evidenceStatus === "missing",
      ).length,
      blockedCount: matchedRequirements.filter(
        (requirement) => requirement.evidenceStatus === "blocked",
      ).length,
    },
    ats: {
      warnings: atsWarnings,
    },
    scoring,
    improvements,
  };
}

function extractCandidateFacts(cvText: string, sections: SectionText[]) {
  const facts: CandidateFact[] = [];
  let factIndex = 1;

  for (const section of sections) {
    const factKind = getFactKind(section.label);
    const nextFacts = extractFactsFromSection(section, cvText, factIndex, factKind);
    facts.push(...nextFacts);
    factIndex += nextFacts.length;
  }

  return dedupeByNormalizedText(facts, (fact) => fact.text).slice(0, 160);
}

function buildUserConfirmedFacts(confirmedEvidence: UserConfirmedEvidence[]) {
  const facts: CandidateFact[] = [];

  for (const [index, evidence] of confirmedEvidence.entries()) {
    if (!isMeaningfulUserEvidenceText(evidence.text, evidence.evidenceType)) {
      continue;
    }

    const factKind = getUserEvidenceFactKind(evidence.evidenceType, evidence.text);
    const parsedContext = parseFactContext([evidence.text]);

    facts.push({
      id: `user_fact_${index + 1}`,
      source: "user_confirmed",
      sourceSection: "User-confirmed evidence",
      text: evidence.text,
      role: parsedContext.role,
      company: parsedContext.company,
      dateRange: parsedContext.dateRange ?? extractDateRange(evidence.text),
      skills: extractFactKeywords(evidence.text, factKind),
      tools: extractTools(evidence.text),
      metrics: extractMetrics(evidence.text),
      confidence: getUserFactConfidence(evidence.evidenceType, evidence.text),
      anchors: buildUserEvidenceAnchor(evidence.text, evidence.requirementText),
      requirementFingerprint: evidence.requirementFingerprint,
      userEvidenceType: evidence.evidenceType,
    });
  }

  return dedupeByNormalizedText(facts, (fact) => fact.text).slice(0, 60);
}

function extractFactsFromSection(
  section: SectionText,
  cvText: string,
  startIndex: number,
  factKind: FactKind,
) {
  switch (factKind) {
    case "experience":
    case "project":
      return extractContextualFacts(section, cvText, startIndex, factKind);
    case "skills":
    case "language":
      return extractListFacts(section, cvText, startIndex, factKind);
    case "summary":
      return extractSentenceFacts(section, cvText, startIndex, factKind);
    case "header":
      return extractHeaderFacts(section, cvText, startIndex);
    case "education":
    case "certification":
      return extractGenericFacts(section, cvText, startIndex, factKind, false);
    default:
      return extractGenericFacts(section, cvText, startIndex, factKind, true);
  }
}

function extractContextualFacts(
  section: SectionText,
  cvText: string,
  startIndex: number,
  factKind: FactKind,
) {
  const facts: CandidateFact[] = [];
  const lines = section.text.split("\n").map((line) => line.trim()).filter(Boolean);
  let factCounter = startIndex;
  let context: string[] = [];

  for (const line of lines) {
    if (isBulletLine(line)) {
      const bullet = cleanListItem(line);
      if (bullet.length < 12) continue;
      facts.push(buildFact(section.label, factKind, bullet, cvText, factCounter, context));
      factCounter += 1;
      continue;
    }

    if (looksLikeRoleContextLine(line)) {
      context = [...context.slice(-2), line];
      continue;
    }

    for (const sentence of splitIntoSentences(line)) {
      if (sentence.length < 16) continue;
      facts.push(buildFact(section.label, factKind, sentence, cvText, factCounter, context));
      factCounter += 1;
    }
  }

  return facts;
}

function extractListFacts(
  section: SectionText,
  cvText: string,
  startIndex: number,
  factKind: FactKind,
) {
  const facts: CandidateFact[] = [];
  const lines = section.text.split("\n").map((line) => line.trim()).filter(Boolean);
  let factCounter = startIndex;

  for (const line of lines) {
    const listItems = extractDelimitedItems(line);
    for (const item of listItems) {
      if (item.length < 2) continue;
      facts.push(buildFact(section.label, factKind, item, cvText, factCounter));
      factCounter += 1;
    }
  }

  return facts;
}

function extractSentenceFacts(
  section: SectionText,
  cvText: string,
  startIndex: number,
  factKind: FactKind,
) {
  const facts: CandidateFact[] = [];
  let factCounter = startIndex;

  for (const sentence of splitIntoSentences(section.text)) {
    if (sentence.length < 18) continue;
    facts.push(buildFact(section.label, factKind, sentence, cvText, factCounter));
    factCounter += 1;
  }

  return facts;
}

function extractHeaderFacts(section: SectionText, cvText: string, startIndex: number) {
  const lines = section.text.split("\n").map((line) => line.trim()).filter(Boolean);
  const facts: CandidateFact[] = [];
  let factCounter = startIndex;

  for (const line of lines) {
    if (line.length < 6) continue;
    facts.push(buildFact(section.label, "header", line, cvText, factCounter));
    factCounter += 1;
  }

  return facts;
}

function extractGenericFacts(
  section: SectionText,
  cvText: string,
  startIndex: number,
  factKind: FactKind,
  splitLinesIntoSentences: boolean,
) {
  const lines = section.text.split("\n").map((line) => line.trim()).filter(Boolean);
  const facts: CandidateFact[] = [];
  let factCounter = startIndex;

  for (const line of lines) {
    if (line.length < 4) continue;

    const items = splitLinesIntoSentences
      ? isBulletLine(line)
        ? [cleanListItem(line)]
        : splitIntoSentences(line)
      : [cleanListItem(line)];

    for (const item of items) {
      if (item.length < 8) continue;
      facts.push(buildFact(section.label, factKind, item, cvText, factCounter));
      factCounter += 1;
    }
  }

  return facts;
}

function buildFact(
  sectionLabel: string,
  factKind: FactKind,
  factText: string,
  cvText: string,
  factIndex: number,
  context: string[] = [],
): CandidateFact {
  const contextText = context.join(" ");
  const combinedText = [contextText, factText].filter(Boolean).join(" ");
  const directAnchors = findAnchor(cvText, factText, "cv", sectionLabel);
  const anchors = directAnchors.length
    ? directAnchors
    : findAnchor(cvText, combinedText, "cv", sectionLabel);
  const parsedContext = parseFactContext(context);

  return {
    id: `fact_${factIndex}`,
    source: "cv",
    sourceSection: sectionLabel,
    text: factText,
    role: parsedContext.role,
    company: parsedContext.company,
    dateRange: parsedContext.dateRange,
    skills: extractFactKeywords(combinedText, factKind),
    tools: extractTools(combinedText),
    metrics: extractMetrics(factText),
    confidence: getFactConfidence(factKind, factText),
    anchors,
  };
}

function inferJobTitle(jobText: string, jobUrl: string, assistantTitle?: string) {
  if (assistantTitle) return assistantTitle;

  const titlePatterns = [
    /^job title\s*:\s*([^\n.]+)/im,
    /^position\s*:\s*([^\n.]+)/im,
    /^role\s*:\s*([^\n.]+)/im,
    /^hiring\s+(?:a|an)\s+([^\n.]+)/im,
  ];

  for (const pattern of titlePatterns) {
    const match = jobText.match(pattern);
    if (match?.[1]) {
      return cleanTitle(match[1]);
    }
  }

  const firstLine = jobText.split("\n").find((line) => {
    const trimmed = line.trim();
    return (
      trimmed.length > 6 &&
      trimmed.length < 90 &&
      !trimmed.endsWith(".") &&
      !/^(?:about this role|role responsibilities|role requirements|you should apply if|you should not apply if|about [a-z])/i.test(
        trimmed,
      )
    );
  });

  if (firstLine) return cleanTitle(firstLine);
  if (jobUrl) return "Target role from job URL";
  return "Target role";
}

function extractJobRequirements(
  jobText: string,
  sections: SectionText[],
  assistant?: GroundedOpenAIAssist,
) {
  const rawRequirements: RawRequirement[] = [];

  for (const section of sections) {
    rawRequirements.push(...extractRequirementsFromSection(section, jobText));
  }

  if (!rawRequirements.length) {
    rawRequirements.push(...extractFallbackRequirements(jobText));
  }

  if (assistant?.requirements.length) {
    rawRequirements.push(
      ...assistant.requirements.map((requirement) => ({
        text: requirement.text,
        sourceSection: requirement.sourceSection,
        anchors: requirement.anchors,
        intent: "general" as const,
      })),
    );
  }

  return dedupeByNormalizedText(rawRequirements, (requirement) => requirement.text)
    .map((requirement, index) => buildRequirement(requirement, index + 1))
    .slice(0, 50);
}

function extractRequirementsFromSection(section: SectionText, jobText: string) {
  const intent = getJobSectionIntent(section.label, section.text);
  if (intent === "boilerplate") return [];

  const requirements: RawRequirement[] = [];
  const lines = section.text.split("\n").map((line) => line.trim()).filter(Boolean);

  for (const line of lines) {
    if (isLikelyJobTitleLine(line) || isBoilerplateText(line)) continue;

    if (isBulletLine(line)) {
      for (const item of splitRequirementLineIntoItems(cleanListItem(line), intent)) {
        if (!shouldKeepRequirementItem(item, intent, section.label)) continue;
        requirements.push({
          text: item,
          sourceSection: section.label,
          anchors: findAnchor(jobText, item, "job", section.label),
          intent,
        });
      }
      continue;
    }

    for (const item of splitRequirementLineIntoItems(line, intent)) {
      if (!shouldKeepRequirementItem(item, intent, section.label)) continue;
      requirements.push({
        text: item,
        sourceSection: section.label,
        anchors: findAnchor(jobText, item, "job", section.label),
        intent,
      });
    }
  }

  return requirements.filter((requirement) => requirement.anchors.length > 0);
}

function extractFallbackRequirements(jobText: string) {
  return splitIntoSentences(jobText)
    .flatMap((sentence) => splitRequirementLineIntoItems(sentence, "general"))
    .filter((sentence) => shouldKeepRequirementItem(sentence, "general", "General"))
    .map((sentence) => ({
      text: sentence,
      sourceSection: "General",
      anchors: findAnchor(jobText, sentence, "job", "General"),
      intent: "general" as const,
    }))
    .filter((requirement) => requirement.anchors.length > 0);
}

function buildRequirement(rawRequirement: RawRequirement, index: number): JobRequirement {
  const category = classifyRequirement(
    rawRequirement.text,
    rawRequirement.sourceSection,
    rawRequirement.intent,
  );
  const importance = determineImportance(
    category,
    rawRequirement.text,
    rawRequirement.sourceSection,
  );
  const keywords = extractKeywords(rawRequirement.text, 16);
  const normalizedKeywords = uniqueStrings(expandKeywordVariants(keywords));

  return {
    id: `req_${index}`,
    text: rawRequirement.text,
    fingerprint: buildRequirementFingerprint(rawRequirement.text),
    category,
    importance,
    keywords,
    normalizedKeywords,
    matchedEvidence: [],
    evidenceStatus: "missing",
    confidenceReason: "No evidence has been matched yet.",
    sourceSection: rawRequirement.sourceSection,
    anchors: rawRequirement.anchors,
  };
}

function matchRequirementsToFacts(
  requirements: JobRequirement[],
  facts: CandidateFact[],
) {
  const indexedFacts = facts.map(indexFact);

  return requirements.map((requirement) => {
    const signal = analyzeRequirementSignal(requirement);
    const matches = indexedFacts
      .map((fact) => buildEvidenceMatch(requirement, signal, fact))
      .filter((match): match is EvidenceMatch => Boolean(match))
      .sort(sortMatches)
      .slice(0, 3);

    const evidenceStatus = determineEvidenceStatus(requirement, signal, matches);

    return {
      ...requirement,
      matchedEvidence: matches,
      evidenceStatus,
      confidenceReason: buildConfidenceReason(
        requirement,
        signal,
        matches,
        evidenceStatus,
      ),
    };
  });
}

function buildEvidenceMatch(
  requirement: JobRequirement,
  signal: RequirementSignal,
  fact: IndexedFact,
): EvidenceMatch | null {
  if (signal.hardBlockerKind) {
    return buildHardBlockerMatch(requirement, signal, fact);
  }

  const overlap = analyzeOverlap(requirement, signal, fact);
  const yearsMatch = signal.requiredYears
    ? assessYearsEvidence(requirement, signal, fact, overlap)
    : null;
  const generalMatch = buildGeneralMatch(requirement, signal, fact, overlap);

  if (yearsMatch && generalMatch) {
    return yearsMatch.score >= generalMatch.score ? yearsMatch : generalMatch;
  }

  return yearsMatch ?? generalMatch;
}

function buildHardBlockerMatch(
  requirement: JobRequirement,
  signal: RequirementSignal,
  fact: IndexedFact,
): EvidenceMatch | null {
  const lowerFactText = fact.searchText;

  switch (signal.hardBlockerKind) {
    case "authorization": {
      if (fact.explicitAuthorization) {
        const sameLocation =
          !signal.locationTokens.length ||
          signal.locationTokens.some((token) => lowerFactText.includes(token));

        return createMatch(
          requirement,
          fact,
          sameLocation ? "strong" : "medium",
          sameLocation ? "exact" : "phrase",
          sameLocation ? 0.94 : 0.68,
          sameLocation
            ? `Strong match because ${describeEvidenceOrigin(fact)} explicitly states work authorization${signal.locationPhrase ? ` and references ${signal.locationPhrase}` : ""}.`
            : `Medium match because ${describeEvidenceOrigin(fact)} explicitly states work authorization, but the location scope is not completely clear.`,
        );
      }

      if (fact.factKind === "header" && signal.locationTokens.some((token) => fact.locationTokens.includes(token))) {
        return createMatch(
          requirement,
          fact,
          "weak",
          "inferred",
          0.26,
          `Weak match because ${describeEvidenceOrigin(fact)} shows location details${signal.locationPhrase ? ` in ${signal.locationPhrase}` : ""}, but location does not prove work authorization.`,
        );
      }

      return null;
    }

    case "language": {
      const requiredLanguage = signal.explicitLanguageTerms[0];
      const hasLanguage = requiredLanguage
        ? fact.explicitLanguages.includes(requiredLanguage)
        : fact.explicitLanguages.length > 0;

      if (!hasLanguage) return null;

      const strongLanguage =
        fact.factKind === "language" || LANGUAGE_PROFICIENCY_PATTERNS.some((pattern) => pattern.test(fact.text));

      return createMatch(
        requirement,
        fact,
        strongLanguage ? "strong" : "medium",
        "exact",
        strongLanguage ? 0.92 : 0.64,
        strongLanguage
          ? `Strong match because ${describeEvidenceOrigin(fact)} explicitly states ${requiredLanguage ?? "the required language"} in a language-related fact.`
          : `Medium match because ${describeEvidenceOrigin(fact)} mentions ${requiredLanguage ?? "the language"}, but the proficiency level is limited or unclear.`,
      );
    }

    case "degree": {
      const exactDegree = signal.explicitDegreeTerms.filter((degree) =>
        fact.explicitDegreeTerms.includes(degree),
      );

      if (exactDegree.length) {
        return createMatch(
          requirement,
          fact,
          "strong",
          "exact",
          0.91,
          `Strong match because ${describeEvidenceOrigin(fact)} explicitly lists ${exactDegree[0]} in an education fact.`,
        );
      }

      if (fact.explicitDegreeTerms.length) {
        return createMatch(
          requirement,
          fact,
          "weak",
          "phrase",
          0.34,
          `Weak match because ${describeEvidenceOrigin(fact)} lists education credentials, but it does not clearly prove ${signal.explicitDegreeTerms.join(" / ")}.`,
        );
      }

      return null;
    }

    case "certification": {
      const exactCertification = signal.explicitCertificationTerms.filter((term) =>
        fact.explicitCertificationTerms.includes(term),
      );

      if (exactCertification.length) {
        return createMatch(
          requirement,
          fact,
          "strong",
          "exact",
          0.9,
          `Strong match because ${describeEvidenceOrigin(fact)} explicitly mentions ${exactCertification[0]} as a certification.`,
        );
      }

      if (fact.explicitCertificationTerms.length || /\bcertif/i.test(fact.text)) {
        return createMatch(
          requirement,
          fact,
          "weak",
          "phrase",
          0.32,
          `Weak match because ${describeEvidenceOrigin(fact)} mentions certifications, but the required certification is not explicit.`,
        );
      }

      return null;
    }

    case "clearance": {
      if (fact.explicitClearance) {
        return createMatch(
          requirement,
          fact,
          "strong",
          "exact",
          0.92,
          `Strong match because ${describeEvidenceOrigin(fact)} explicitly mentions security clearance.`,
        );
      }
      return null;
    }

    case "driving_license": {
      if (fact.explicitDrivingLicense) {
        return createMatch(
          requirement,
          fact,
          "strong",
          "exact",
          0.89,
          `Strong match because ${describeEvidenceOrigin(fact)} explicitly mentions a driving license.`,
        );
      }
      return null;
    }

    case "travel": {
      if (fact.explicitTravel) {
        return createMatch(
          requirement,
          fact,
          "medium",
          "phrase",
          0.62,
          `Medium match because ${describeEvidenceOrigin(fact)} explicitly mentions travel-related availability or travel-heavy work.`,
        );
      }
      return null;
    }

    case "shift": {
      if (fact.explicitShiftAvailability) {
        return createMatch(
          requirement,
          fact,
          "medium",
          "phrase",
          0.62,
          `Medium match because ${describeEvidenceOrigin(fact)} explicitly mentions timezone or shift availability.`,
        );
      }
      return null;
    }

    case "location": {
      const exactLocationMatch =
        signal.locationTokens.length > 0 &&
        signal.locationTokens.every((token) => fact.locationTokens.includes(token));

      if (exactLocationMatch) {
        return createMatch(
          requirement,
          fact,
          "strong",
          "exact",
          0.86,
          `Strong match because ${describeEvidenceOrigin(fact)} explicitly lists ${signal.locationPhrase ?? "the required location"}.`,
        );
      }

      if (signal.locationTokens.some((token) => fact.locationTokens.includes(token))) {
        return createMatch(
          requirement,
          fact,
          "weak",
          "phrase",
          0.32,
          `Weak match because ${describeEvidenceOrigin(fact)} references part of the required location${signal.locationPhrase ? ` (${signal.locationPhrase})` : ""}, but the match is incomplete.`,
        );
      }

      return null;
    }

    default: {
      const overlap = analyzeOverlap(requirement, signal, fact);
      if (!overlap.specificOverlap.length) return null;
      return createMatch(
        requirement,
        fact,
        "weak",
        overlap.weakSynonymMatches.length ? "synonym" : "phrase",
        0.28,
        `Weak match because ${describeEvidenceOrigin(fact)} contains related terms for this hard blocker, but the requirement is not explicitly proven.`,
      );
    }
  }
}

function assessYearsEvidence(
  requirement: JobRequirement,
  signal: RequirementSignal,
  fact: IndexedFact,
  overlap: OverlapAnalysis,
) {
  if (!signal.requiredYears) return null;

  const related =
    overlap.specificOverlap.length >= 1 ||
    overlap.toolMatches.length >= 1 ||
    overlap.phraseMatches.length >= 1 ||
    fact.role?.toLowerCase().includes(overlap.specificOverlap[0] ?? "");

  if (!related) return null;

  const explicitYears = fact.explicitYears;
  const derivedYears = fact.derivedYears;
  const bestYears = explicitYears ?? derivedYears;

  if (!bestYears) {
    return createMatch(
      requirement,
      fact,
      fact.factKind === "experience" || fact.factKind === "project" ? "weak" : "weak",
      "inferred",
      0.3,
      `Weak match because ${describeEvidenceOrigin(fact)} has related ${fact.factKind} evidence, but it does not clearly prove ${signal.requiredYears}+ years.`,
    );
  }

  const factContextStrong = fact.factKind === "experience" || fact.factKind === "project";
  const domainMatchStrong = overlap.phraseMatches.length > 0 || overlap.specificOverlap.length >= 2;

  if (bestYears >= signal.requiredYears && factContextStrong && domainMatchStrong) {
    return createMatch(
      requirement,
      fact,
      "strong",
      explicitYears ? "exact" : "inferred",
      0.91,
      `Strong match because ${describeEvidenceOrigin(fact)} shows ${formatYears(bestYears)} of related experience and the fact aligns with ${summarizeRequirementDomain(requirement)}.`,
    );
  }

  if (bestYears >= signal.requiredYears && factContextStrong) {
    return createMatch(
      requirement,
      fact,
      "medium",
      explicitYears ? "exact" : "inferred",
      0.67,
      `Medium match because ${describeEvidenceOrigin(fact)} appears to show ${formatYears(bestYears)} of related experience, but the domain wording is only partially aligned.`,
    );
  }

  if (bestYears < signal.requiredYears) {
    return createMatch(
      requirement,
      fact,
      "weak",
      explicitYears ? "exact" : "inferred",
      0.36,
      `Weak match because ${describeEvidenceOrigin(fact)} shows only ${formatYears(bestYears)} against a ${signal.requiredYears}+ year requirement.`,
    );
  }

  return createMatch(
    requirement,
    fact,
    "weak",
    "inferred",
    0.34,
    `Weak match because the dates suggest related experience, but ${describeEvidenceOrigin(fact)} is not specific enough to prove ${signal.requiredYears}+ years.`,
  );
}

function buildGeneralMatch(
  requirement: JobRequirement,
  signal: RequirementSignal,
  fact: IndexedFact,
  overlap: OverlapAnalysis,
) {
  if (
    !overlap.specificOverlap.length &&
    !overlap.toolMatches.length &&
    !overlap.weakSynonymMatches.length
  ) {
    return null;
  }

  const isExperienceContext =
    fact.factKind === "experience" || fact.factKind === "project";
  const isSkillsContext = fact.factKind === "skills";
  const isSummaryContext = fact.factKind === "summary";
  const isEducationLike =
    fact.factKind === "education" ||
    fact.factKind === "certification" ||
    fact.factKind === "language";
  const overlapCount = overlap.specificOverlap.length;
  const hasOnlyWeakSynonyms =
    !overlapCount && !overlap.toolMatches.length && overlap.weakSynonymMatches.length > 0;

  let strength: EvidenceStrength | null = null;

  if (requirement.category === "responsibility") {
    if (isExperienceContext && overlap.phraseMatches.length > 0 && overlapCount >= 2) {
      strength = "strong";
    } else if (isExperienceContext && (overlapCount >= 2 || overlap.phraseMatches.length > 0)) {
      strength = "medium";
    } else if (isSkillsContext || isSummaryContext) {
      strength = overlapCount || overlap.weakSynonymMatches.length ? "weak" : null;
    }
  } else if (requirement.category === "tool") {
    if (isExperienceContext && overlap.toolMatches.length > 0) {
      strength =
        overlap.phraseMatches.length > 0 || overlapCount >= 2 ? "strong" : "medium";
    } else if (isSkillsContext && overlap.toolMatches.length > 0) {
      strength = "medium";
    } else if (isSummaryContext && overlap.toolMatches.length > 0) {
      strength = "weak";
    }
  } else if (requirement.category === "soft_skill") {
    if (isExperienceContext && (overlap.phraseMatches.length > 0 || overlapCount >= 2)) {
      strength = "medium";
    } else if (isSkillsContext || isSummaryContext) {
      strength = overlapCount ? "weak" : null;
    }
  } else if (requirement.category === "domain" || requirement.category === "must_have") {
    if (isExperienceContext && overlap.phraseMatches.length > 0 && overlapCount >= 2) {
      strength = "strong";
    } else if (isExperienceContext && (overlapCount >= 2 || overlap.toolMatches.length > 0)) {
      strength = "medium";
    } else if (isSkillsContext && (overlapCount >= 1 || overlap.toolMatches.length > 0)) {
      strength = "medium";
    } else if (isSummaryContext && overlapCount >= 1) {
      strength = "weak";
    } else if (isEducationLike && overlapCount >= 1) {
      strength = "weak";
    }
  } else if (requirement.category === "nice_to_have") {
    if (isExperienceContext && (overlap.phraseMatches.length > 0 || overlapCount >= 2)) {
      strength = "medium";
    } else if (overlapCount >= 1 || overlap.toolMatches.length > 0 || overlap.weakSynonymMatches.length > 0) {
      strength = "weak";
    }
  }

  if (!strength && hasOnlyWeakSynonyms) {
    strength = "weak";
  }

  if (!strength) return null;

  if (isSummaryContext && strength !== "weak") {
    strength = "weak";
  }

  if (
    isSkillsContext &&
    requirement.category === "responsibility" &&
    strength !== "weak"
  ) {
    strength = "weak";
  }

  if (fact.source === "user_confirmed") {
    if (strength === "strong" && !canUserEvidenceBeStrong(requirement, fact, overlap)) {
      strength = "medium";
    }

    if (strength === "medium" && !canUserEvidenceBeMedium(requirement, fact, overlap)) {
      strength = "weak";
    }
  }

  const matchType = determineMatchType(overlap);
  const score = computeMatchScore(strength, overlap, fact, hasOnlyWeakSynonyms);

  return createMatch(
    requirement,
    fact,
    strength,
    matchType,
    score,
    buildGeneralMatchExplanation(requirement, fact, overlap, strength),
  );
}

function determineEvidenceStatus(
  requirement: JobRequirement,
  signal: RequirementSignal,
  matches: EvidenceMatch[],
): EvidenceStatus {
  const mediumCount = matches.filter((match) => match.strength === "medium").length;
  const strongCount = matches.filter((match) => match.strength === "strong").length;

  if (signal.hardBlockerKind) {
    return strongCount > 0 ? "supported" : "blocked";
  }

  if (strongCount > 0 || mediumCount >= 2) {
    return "supported";
  }

  if (matches.length > 0) {
    return "weak";
  }

  return "missing";
}

function buildConfidenceReason(
  requirement: JobRequirement,
  signal: RequirementSignal,
  matches: EvidenceMatch[],
  evidenceStatus: EvidenceStatus,
) {
  const bestMatch = matches[0];
  const bestSourceLabel =
    bestMatch?.evidenceSource === "user_confirmed" ? "user-confirmed evidence" : "the CV";

  if (evidenceStatus === "supported" && bestMatch) {
    return `${capitalize(bestMatch.strength)} evidence from ${bestSourceLabel} supports this requirement. ${bestMatch.explanation}`;
  }

  if (signal.hardBlockerKind) {
    if (bestMatch) {
      return `Blocked because the job requires explicit ${describeHardBlocker(signal.hardBlockerKind, requirement.text)}, and the current evidence is only partial. ${bestMatch.explanation}`;
    }

    return `Blocked because the job requires explicit ${describeHardBlocker(signal.hardBlockerKind, requirement.text)} and neither the CV nor any explicit user confirmation clearly states it.`;
  }

  if (signal.requiredYears) {
    if (bestMatch) {
      return `Weak because the available evidence is related, but it does not clearly prove ${signal.requiredYears}+ years for ${summarizeRequirementDomain(requirement)}.`;
    }

    return `Missing because no anchored fact clearly proves ${signal.requiredYears}+ years for ${summarizeRequirementDomain(requirement)}.`;
  }

  if (bestMatch) {
    return bestMatch.strength === "weak"
      ? `Weak because the current evidence is partial or generic. ${bestMatch.explanation}`
      : `Needs review because the evidence is not yet strong enough. ${bestMatch.explanation}`;
  }

  return `Missing because no CV fact explicitly supports "${requirement.text}".`;
}

function runAtsHygieneChecks(
  cvText: string,
  sections: SectionText[],
  facts: CandidateFact[],
) {
  const warnings: ATSHygieneWarning[] = [];
  const lowerCv = cvText.toLowerCase();
  const sectionLabels = new Set(sections.map((section) => section.label.toLowerCase()));
  const experienceSection = sections.find((section) =>
    EXPERIENCE_SECTIONS.has(section.label.toLowerCase()),
  );
  const hasEducationText =
    [...sectionLabels].some((label) => EDUCATION_SECTIONS.has(label)) ||
    facts.some((fact) => hasEducationLikeText(fact.text));

  if (!/[^\s@]+@[^\s@]+\.[^\s@]+/.test(cvText)) {
    warnings.push(
      buildAtsWarning(
        "ats_email",
        "warning",
        "contact",
        "Readable email address not detected.",
        "Use a plain-text email address in the header.",
      ),
    );
  }

  if (!/(\+\d{1,3}[\s.-]?)?(\(?\d{2,4}\)?[\s.-]?){2,}/.test(cvText)) {
    warnings.push(
      buildAtsWarning(
        "ats_phone",
        "warning",
        "contact",
        "Readable phone number not detected.",
        "Use a plain-text phone number instead of icons or images.",
      ),
    );
  }

  if (
    !sectionLabels.has("experience") &&
    !sectionLabels.has("employment") &&
    !sectionLabels.has("work history")
  ) {
    warnings.push(
      buildAtsWarning(
        "ats_experience_section",
        "critical",
        "structure",
        "No standard Experience section was detected.",
        "Add an Experience or Work History section heading for ATS parsing.",
      ),
    );
  }

  if (![...sectionLabels].some((label) => SKILLS_SECTIONS.has(label))) {
    warnings.push(
      buildAtsWarning(
        "ats_skills_section",
        "warning",
        "structure",
        "No standard Skills section was detected.",
        "Add a dedicated Skills or Technologies section with readable text.",
      ),
    );
  }

  if (!hasEducationText) {
    warnings.push(
      buildAtsWarning(
        "ats_education_section",
        "warning",
        "structure",
        "No clear Education or certification evidence was detected.",
        "Add an Education or Certifications section if those facts exist.",
      ),
    );
  }

  if (cvText.length < 700) {
    warnings.push(
      buildAtsWarning(
        "ats_short_cv",
        cvText.length < 450 ? "critical" : "warning",
        "content",
        "The CV text looks short for a full professional profile.",
        "Add more grounded experience bullets, tools, scope, and outcomes.",
      ),
    );
  }

  if (
    (cvText.match(/\|/g) ?? []).length >= 4 ||
    /\t/.test(cvText) ||
    /-{4,}|_{4,}/.test(cvText)
  ) {
    warnings.push(
      buildAtsWarning(
        "ats_layout_markers",
        "warning",
        "layout",
        "Table-like layout markers or separator-heavy formatting were detected.",
        "Use a simple single-column layout with standard text headings.",
      ),
    );
  }

  if ((cvText.match(/[\u2600-\u27bf\u{1F300}-\u{1FAFF}]/gu) ?? []).length >= 3) {
    warnings.push(
      buildAtsWarning(
        "ats_icons",
        "warning",
        "layout",
        "Heavy icon or symbol usage was detected.",
        "Use readable text labels for contact details and section content.",
      ),
    );
  }

  if (experienceSection && !hasDateLikeText(experienceSection.text)) {
    warnings.push(
      buildAtsWarning(
        "ats_missing_dates",
        "warning",
        "experience",
        "The Experience section does not show obvious dates.",
        "Use readable date ranges for each role.",
      ),
    );
  }

  if (hasKeywordStuffing(cvText)) {
    warnings.push(
      buildAtsWarning(
        "ats_keyword_stuffing",
        "warning",
        "content",
        "Repeated high-value terms suggest possible keyword stuffing.",
        "Keep keywords grounded in real experience instead of repeating them unnaturally.",
      ),
    );
  }

  if (hasWallOfText(sections)) {
    warnings.push(
      buildAtsWarning(
        "ats_wall_of_text",
        "warning",
        "readability",
        "Very long paragraphs were detected.",
        "Break dense paragraphs into shorter ATS-friendly bullets or sentences.",
      ),
    );
  }

  if (
    /(font-size\s*:\s*0|display\s*:\s*none|opacity\s*:\s*0|color\s*:\s*#?fff\b|white text|hidden text|invisible text)/i.test(
      lowerCv,
    )
  ) {
    warnings.push(
      buildAtsWarning(
        "ats_hidden_text",
        "critical",
        "integrity",
        "Suspicious hidden or invisible text indicators were detected.",
        "Remove deceptive ATS tricks such as hidden white text or invisible keywords.",
      ),
    );
  }

  return warnings;
}

function computeScoring(
  requirements: JobRequirement[],
  warnings: ATSHygieneWarning[],
) {
  const totalRequirementWeight =
    requirements.reduce((sum, requirement) => sum + requirement.importance, 0) || 1;
  const supportedWeight = sumImportance(requirements, "supported");
  const weakWeight = sumImportance(requirements, "weak");
  const missingWeight = sumImportance(requirements, "missing");
  const blockedWeight = sumImportance(requirements, "blocked");

  const atsPenalty = warnings.reduce((sum, warning) => {
    if (warning.severity === "critical") return sum + 20;
    if (warning.severity === "warning") return sum + 8;
    return sum + 3;
  }, 0);

  const atsParseScore = clamp(100 - atsPenalty, 0, 100);
  const blockedHardBlockerPenalty = Math.round(
    (blockedWeight / totalRequirementWeight) * 35,
  );

  const weightedCoveragePoints = requirements.reduce((sum, requirement) => {
    const factor =
      requirement.evidenceStatus === "supported"
        ? 1
        : requirement.evidenceStatus === "weak"
          ? 0.4
          : requirement.evidenceStatus === "missing"
            ? 0
            : -0.45;
    return sum + requirement.importance * factor;
  }, 0);

  const weightedEvidencePoints = requirements.reduce((sum, requirement) => {
    const bestScore = requirement.matchedEvidence[0]?.score ?? 0;
    const factor =
      requirement.evidenceStatus === "supported"
        ? 0.72 + bestScore * 0.28
        : requirement.evidenceStatus === "weak"
          ? 0.2 + bestScore * 0.25
          : requirement.evidenceStatus === "missing"
            ? 0.02
            : -0.4;
    return sum + requirement.importance * factor;
  }, 0);

  const jobMatchScore = clamp(
    Math.round((weightedCoveragePoints / totalRequirementWeight) * 100),
    0,
    100,
  );

  const evidenceConfidenceScore = clamp(
    Math.round((weightedEvidencePoints / totalRequirementWeight) * 100),
    0,
    100,
  );

  const overallReadinessScore = clamp(
    Math.round(
      atsParseScore * 0.2 +
        jobMatchScore * 0.45 +
        evidenceConfidenceScore * 0.35 -
        blockedHardBlockerPenalty,
    ),
    0,
    100,
  );

  return {
    atsParseScore,
    jobMatchScore,
    evidenceConfidenceScore,
    overallReadinessScore,
    breakdown: {
      totalRequirementWeight,
      supportedWeight,
      weakWeight,
      missingWeight,
      blockedWeight,
      blockedHardBlockerPenalty,
      atsPenalty,
    },
  };
}

function indexFact(fact: CandidateFact): IndexedFact {
  const factKind = getFactKindForFact(fact);
  const combinedText = [
    fact.text,
    fact.role,
    fact.company,
    fact.dateRange,
    fact.skills.join(" "),
    fact.tools.join(" "),
    fact.metrics.join(" "),
  ]
    .filter(Boolean)
    .join(" ");
  const normalizedKeywords = uniqueStrings(
    expandKeywordVariants(extractKeywords(combinedText, 18)),
  );

  return {
    ...fact,
    factKind,
    searchText: normalizeText(combinedText).toLowerCase(),
    normalizedKeywords,
    weakKeywordVariants: uniqueStrings(
      normalizedKeywords.flatMap((keyword) => getWeakSynonyms(keyword)),
    ),
    sectionWeight: getSectionWeight(factKind),
    explicitLanguages: detectExplicitLanguages(fact.text, factKind),
    explicitDegreeTerms: detectExplicitDegreeTerms(fact.text),
    explicitCertificationTerms: detectExplicitCertificationTerms(fact.text),
    explicitAuthorization: AUTHORIZATION_PATTERNS.some((pattern) => pattern.test(fact.text)),
    explicitClearance: CLEARANCE_PATTERNS.some((pattern) => pattern.test(fact.text)),
    explicitDrivingLicense: DRIVING_LICENSE_PATTERNS.some((pattern) => pattern.test(fact.text)),
    explicitTravel: TRAVEL_PATTERNS.some((pattern) => pattern.test(fact.text)),
    explicitShiftAvailability: SHIFT_PATTERNS.some((pattern) => pattern.test(fact.text)),
    locationTokens: extractLocationTokens(fact.text),
    derivedYears: deriveYearsFromDateRange(fact.dateRange),
    explicitYears: extractExplicitYears(fact.text),
  };
}

function analyzeRequirementSignal(requirement: JobRequirement): RequirementSignal {
  const hardBlockerKind = detectHardBlockerKind(requirement.text);
  const years = extractRequiredYears(requirement.text);

  return {
    hardBlockerKind,
    locationPhrase: hardBlockerKind === "location" ? extractLocationPhrase(requirement.text) : undefined,
    locationTokens: hardBlockerKind === "location" ? extractLocationTokens(requirement.text) : [],
    explicitLanguageTerms: detectExplicitLanguages(requirement.text, "language"),
    explicitDegreeTerms: detectExplicitDegreeTerms(requirement.text),
    explicitCertificationTerms: detectExplicitCertificationTerms(requirement.text),
    requiredYears: years,
    specificKeywords: requirement.normalizedKeywords.filter(
      (keyword) => !isGenericKeyword(keyword),
    ),
    toolKeywords: requirement.normalizedKeywords.filter((keyword) => KNOWN_TOOLS.has(keyword)),
  };
}

function analyzeOverlap(
  requirement: JobRequirement,
  signal: RequirementSignal,
  fact: IndexedFact,
): OverlapAnalysis {
  const factKeywordSet = new Set(fact.normalizedKeywords);
  const exactKeywordMatches = signal.specificKeywords.filter((keyword) =>
    factKeywordSet.has(keyword),
  );
  const phraseMatches = signal.specificKeywords.filter(
    (keyword) => keyword.includes(" ") && fact.searchText.includes(keyword),
  );
  const toolMatches = signal.toolKeywords.filter(
    (keyword) => factKeywordSet.has(keyword) || fact.searchText.includes(keyword),
  );
  const weakSynonymMatches = uniqueStrings(
    signal.specificKeywords.flatMap((keyword) => {
      const direct = getWeakSynonyms(keyword).filter(
        (target) => factKeywordSet.has(target) || fact.searchText.includes(target),
      );
      const reverse = fact.normalizedKeywords
        .filter((factKeyword) => getWeakSynonyms(factKeyword).includes(keyword))
        .map(() => keyword);
      return [...direct.map(() => keyword), ...reverse];
    }),
  );
  const specificOverlap = uniqueStrings([
    ...exactKeywordMatches,
    ...phraseMatches,
    ...toolMatches,
  ]).filter((keyword) => !isGenericKeyword(keyword));
  const exactRequirementPhrase = requirement.keywords.some((keyword) => {
    const normalized = normalizeKeywordPhrase(keyword);
    return normalized.includes(" ") && fact.searchText.includes(normalized);
  });

  return {
    exactKeywordMatches,
    phraseMatches,
    toolMatches,
    weakSynonymMatches,
    specificOverlap,
    exactRequirementPhrase,
  };
}

function createMatch(
  requirement: JobRequirement,
  fact: IndexedFact,
  strength: EvidenceStrength,
  matchType: MatchType,
  score: number,
  explanation: string,
): EvidenceMatch {
  return {
    id: `${requirement.id}_${fact.id}`,
    requirementId: requirement.id,
    factId: fact.id,
    evidenceSource: fact.source,
    matchedText: fact.text,
    matchType,
    strength,
    score: Number(clamp(score, 0, 0.99).toFixed(2)),
    explanation,
    anchors: fact.anchors,
  };
}

function determineMatchType(overlap: OverlapAnalysis): MatchType {
  if (overlap.exactRequirementPhrase) return "exact";
  if (overlap.phraseMatches.length > 0) return "phrase";
  if (overlap.weakSynonymMatches.length > 0) return "synonym";
  if (overlap.specificOverlap.length > 0 || overlap.toolMatches.length > 0) {
    return "inferred";
  }
  return "semantic";
}

function computeMatchScore(
  strength: EvidenceStrength,
  overlap: OverlapAnalysis,
  fact: IndexedFact,
  hasOnlyWeakSynonyms: boolean,
) {
  const base =
    strength === "strong" ? 0.82 : strength === "medium" ? 0.58 : 0.34;
  const overlapBonus = Math.min(0.1, overlap.specificOverlap.length * 0.03);
  const phraseBonus = overlap.phraseMatches.length ? 0.05 : 0;
  const toolBonus = overlap.toolMatches.length ? 0.04 : 0;
  const weakPenalty = hasOnlyWeakSynonyms ? 0.08 : 0;
  const summaryPenalty = fact.factKind === "summary" ? 0.1 : 0;
  const skillsPenalty = fact.factKind === "skills" ? 0.05 : 0;
  const userEvidencePenalty = fact.source === "user_confirmed" ? 0.06 : 0;

  return clamp(
    base +
      overlapBonus +
      phraseBonus +
      toolBonus +
      fact.sectionWeight -
      weakPenalty -
      summaryPenalty -
      skillsPenalty -
      userEvidencePenalty,
    0,
    0.99,
  );
}

function buildGeneralMatchExplanation(
  requirement: JobRequirement,
  fact: IndexedFact,
  overlap: OverlapAnalysis,
  strength: EvidenceStrength,
) {
  const matchedTerms = [
    ...overlap.toolMatches,
    ...overlap.phraseMatches,
    ...overlap.exactKeywordMatches,
    ...overlap.weakSynonymMatches,
  ];
  const preview = uniqueStrings(matchedTerms).slice(0, 3).join(", ");

  if (overlap.weakSynonymMatches.length && !overlap.specificOverlap.length) {
    return `Weak match because ${describeEvidenceOrigin(fact)} only shows related terms such as ${preview}, not the exact requirement wording.`;
  }

  if (fact.factKind === "skills") {
    return requirement.category === "tool"
      ? `Medium match because ${preview || "the tool"} appears in ${describeSkillsEvidenceOrigin(fact)}, but there is limited experience-context evidence.`
      : `Weak match because ${describeEvidenceOrigin(fact)} mentions ${preview || "related terms"} in skills-only evidence, without enough experience-context support.`;
  }

  if (fact.factKind === "summary") {
    return `Weak match because ${describeEvidenceOrigin(fact)} mentions ${preview || "related terms"} in summary-style wording, which is not enough for strong proof.`;
  }

  if (strength === "strong") {
    return `Strong match because ${describeEvidenceOrigin(fact)} explicitly mentions ${preview || "the required terms"} in a ${capitalize(fact.factKind)} fact.`;
  }

  if (strength === "medium") {
    return `Medium match because ${describeEvidenceOrigin(fact)} shows ${preview || "related terms"} in a ${capitalize(fact.factKind)} fact, but the context is narrower than the job requirement.`;
  }

  return `Weak match because ${describeEvidenceOrigin(fact)} only partially overlaps with ${preview || "the requirement wording"}.`;
}

function canUserEvidenceBeStrong(
  requirement: JobRequirement,
  fact: IndexedFact,
  overlap: OverlapAnalysis,
) {
  if (!hasProfessionalContext(fact.text)) {
    return false;
  }

  if (fact.userEvidenceType === "skill" || fact.factKind === "skills") {
    return false;
  }

  if (requirement.category === "responsibility") {
    return (
      (fact.factKind === "experience" || fact.factKind === "project") &&
      overlap.phraseMatches.length > 0 &&
      overlap.specificOverlap.length >= 2
    );
  }

  if (requirement.category === "tool") {
    return overlap.toolMatches.length > 0 && overlap.specificOverlap.length >= 2;
  }

  if (requirement.category === "soft_skill") {
    return false;
  }

  return overlap.specificOverlap.length >= 2 && overlap.phraseMatches.length > 0;
}

function canUserEvidenceBeMedium(
  requirement: JobRequirement,
  fact: IndexedFact,
  overlap: OverlapAnalysis,
) {
  if (fact.userEvidenceType === "skill" && requirement.category === "responsibility") {
    return false;
  }

  if (fact.userEvidenceType === "other" && !hasProfessionalContext(fact.text)) {
    return false;
  }

  return (
    overlap.specificOverlap.length > 0 ||
    overlap.toolMatches.length > 0 ||
    overlap.weakSynonymMatches.length > 0 ||
    hasProfessionalContext(fact.text)
  );
}

function describeEvidenceOrigin(fact: IndexedFact) {
  return fact.source === "user_confirmed"
    ? "the user-confirmed evidence"
    : "the CV";
}

function describeSkillsEvidenceOrigin(fact: IndexedFact) {
  return fact.source === "user_confirmed"
    ? "the user-confirmed evidence"
    : "the CV Skills section";
}

function sortMatches(a: EvidenceMatch, b: EvidenceMatch) {
  return (
    strengthRank(b.strength) - strengthRank(a.strength) ||
    b.score - a.score ||
    a.factId.localeCompare(b.factId)
  );
}

function strengthRank(value: EvidenceStrength) {
  return value === "strong" ? 3 : value === "medium" ? 2 : 1;
}

function getFactKind(sectionLabel: string): FactKind {
  const normalized = sectionLabel.toLowerCase();
  if (EXPERIENCE_SECTIONS.has(normalized)) return "experience";
  if (PROJECT_SECTIONS.has(normalized)) return "project";
  if (SKILLS_SECTIONS.has(normalized)) return "skills";
  if (EDUCATION_SECTIONS.has(normalized)) return "education";
  if (CERTIFICATION_SECTIONS.has(normalized)) return "certification";
  if (LANGUAGE_SECTIONS.has(normalized)) return "language";
  if (SUMMARY_SECTIONS.has(normalized)) return "summary";
  if (HEADER_SECTIONS.has(normalized)) return "header";
  return "other";
}

function getFactKindForFact(fact: CandidateFact): FactKind {
  if (fact.source === "user_confirmed") {
    return getUserEvidenceFactKind(fact.userEvidenceType, fact.text);
  }

  return getFactKind(fact.sourceSection);
}

function getUserEvidenceFactKind(
  evidenceType?: UserEvidenceType,
  text = "",
): FactKind {
  switch (evidenceType) {
    case "experience":
      return hasProfessionalContext(text) ? "experience" : "summary";
    case "tool":
    case "skill":
      return hasProfessionalContext(text) ? "experience" : "skills";
    case "certification":
      return "certification";
    case "education":
      return "education";
    case "language":
      return "language";
    case "location":
    case "availability":
    case "work_authorization":
      return "other";
    default:
      return hasProfessionalContext(text) ? "experience" : "other";
  }
}

function getJobSectionIntent(label: string, text: string): SectionIntent {
  const normalizedLabel = label.toLowerCase();

  if (
    BOILERPLATE_SECTION_PATTERNS.some((pattern) => pattern.test(normalizedLabel)) ||
    BOILERPLATE_TEXT_PATTERNS.some((pattern) => pattern.test(text))
  ) {
    return "boilerplate";
  }

  if (RESPONSIBILITY_SECTION_PATTERNS.some((pattern) => pattern.test(normalizedLabel))) {
    return "responsibility";
  }

  if (PREFERRED_SECTION_PATTERNS.some((pattern) => pattern.test(normalizedLabel))) {
    return "preferred";
  }

  if (REQUIREMENT_SECTION_PATTERNS.some((pattern) => pattern.test(normalizedLabel))) {
    return normalizedLabel.includes("about you") || normalizedLabel.includes("you have")
      ? "about_you"
      : "must_have";
  }

  return "general";
}

function classifyRequirement(
  text: string,
  sourceSection?: string,
  intent: SectionIntent = "general",
): RequirementCategory {
  const lowerText = text.toLowerCase();
  const section = (sourceSection ?? "").toLowerCase();

  if (detectHardBlockerKind(text)) {
    return "hard_blocker";
  }

  if (intent === "preferred" || NICE_TO_HAVE_PATTERNS.some((pattern) => pattern.test(lowerText))) {
    return "nice_to_have";
  }

  if (intent === "responsibility" || RESPONSIBILITY_PATTERNS.some((pattern) => pattern.test(lowerText))) {
    return "responsibility";
  }

  const specializedCategory = detectToolDomainOrSoftSkill(lowerText);
  if (specializedCategory) {
    return specializedCategory;
  }

  if (
    intent === "must_have" ||
    intent === "about_you" ||
    MUST_HAVE_PATTERNS.some((pattern) => pattern.test(lowerText)) ||
    section.includes("qualif")
  ) {
    return "must_have";
  }

  return "must_have";
}

function determineImportance(
  category: RequirementCategory,
  text: string,
  sourceSection?: string,
): 1 | 2 | 3 | 4 | 5 {
  const lowerText = text.toLowerCase();
  const section = (sourceSection ?? "").toLowerCase();

  switch (category) {
    case "hard_blocker":
    case "must_have":
      return 5;
    case "nice_to_have":
      return 2;
    case "domain":
      return 3;
    case "soft_skill":
      return MUST_HAVE_PATTERNS.some((pattern) => pattern.test(lowerText)) ? 3 : 2;
    case "tool":
      return MUST_HAVE_PATTERNS.some((pattern) => pattern.test(lowerText)) || section.includes("required")
        ? 4
        : 3;
    case "responsibility":
      return /lead|own|drive|manage|architect|design/i.test(lowerText) ? 4 : 3;
    default:
      return 3;
  }
}

function detectToolDomainOrSoftSkill(text: string): RequirementCategory | null {
  const hasTool = [...KNOWN_TOOLS].some((tool) => text.includes(tool));
  if (hasTool) return "tool";

  if (DOMAIN_KEYWORDS.some((keyword) => text.includes(keyword))) {
    return "domain";
  }

  if (SOFT_SKILL_KEYWORDS.some((keyword) => text.includes(keyword))) {
    return "soft_skill";
  }

  return null;
}

function detectHardBlockerKind(text: string): HardBlockerKind | undefined {
  const lower = text.toLowerCase();

  if (/(work authorization|authorized to work|right to work|eligible to work|visa|sponsorship)/i.test(lower)) {
    return "authorization";
  }
  if (/(security clearance|clearance)/i.test(lower)) {
    return "clearance";
  }
  if (/(driver'?s license|driving license)/i.test(lower)) {
    return "driving_license";
  }
  if (/(travel|willingness to travel)/i.test(lower)) {
    return "travel";
  }
  if (
    /\b(?:time zone|timezone|shift|weekend|night shift|cest|cet|est|pst)\b/i.test(
      lower,
    )
  ) {
    return "shift";
  }
  if (/(based in|located in|must reside|on-site|onsite|hybrid|in-office|relocate)/i.test(lower)) {
    return "location";
  }
  if (
    [...KNOWN_LANGUAGES].some((language) => lower.includes(language)) &&
    /(fluent|native|proficient|language|c1|c2|b2)/i.test(lower)
  ) {
    return "language";
  }
  if ([...KNOWN_DEGREE_HINTS].some((term) => lower.includes(term))) {
    return "degree";
  }
  if ([...KNOWN_CERTIFICATION_HINTS].some((term) => lower.includes(term))) {
    return "certification";
  }
  if (HARD_BLOCKER_PATTERNS.some((pattern) => pattern.test(lower))) {
    return "other";
  }
  return undefined;
}

function parseFactContext(context: string[]) {
  const trimmed = context.map((line) => line.trim()).filter(Boolean).slice(-3);
  if (!trimmed.length) {
    return {
      role: undefined,
      company: undefined,
      dateRange: undefined,
    };
  }

  const dateSource = trimmed.find((line) => hasDateLikeText(line));
  const dateRange = dateSource ? extractDateRange(dateSource) : undefined;
  const role = trimmed.find(
    (line) =>
      !hasDateLikeText(line) &&
      !line.includes("|") &&
      line.length < 90 &&
      /^[A-Z][A-Za-z0-9,&()'./ -]+$/.test(line),
  );
  const companyLine = trimmed.find((line) => line.includes("|")) ?? trimmed[1];
  const company = companyLine
    ? companyLine
        .split("|")
        .map((part) => part.trim())
        .find((part) => part && !hasDateLikeText(part))
    : undefined;

  return {
    role,
    company,
    dateRange,
  };
}

function extractDateRange(text: string) {
  const match = text.match(
    /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4}\s*[-–]\s*(?:present|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4})|\b(?:19|20)\d{2}\s*[-–]\s*(?:present|(?:19|20)\d{2})/i,
  );
  return match?.[0];
}

function extractFactKeywords(text: string, factKind: FactKind) {
  const keywords = extractKeywords(text, factKind === "skills" ? 12 : 10);
  return keywords.filter((keyword) => !KNOWN_TOOLS.has(keyword));
}

function extractTools(text: string) {
  return [...KNOWN_TOOLS].filter((tool) => containsTerm(text, tool)).slice(0, 10);
}

function extractMetrics(text: string) {
  const metrics = [
    ...text.matchAll(
      /(?:[$€£]\s?\d[\d,.]*(?:\s?[kKmM])?|\b\d+(?:\.\d+)?%|\b\d+(?:\.\d+)?\s?(?:hours?|days?|weeks?|months?|years?|tickets?|users?|customers?|projects?|incidents?|sla|kpi|kpis|x))\b/gi,
    ),
  ].map((match) => match[0].trim());

  return uniqueStrings(metrics).slice(0, 6);
}

function detectExplicitLanguages(text: string, factKind: FactKind) {
  const lower = text.toLowerCase();
  const languages = [...KNOWN_LANGUAGES].filter((language) => containsTerm(lower, language));

  if (!languages.length) return [];
  if (factKind === "language") return languages;

  return languages.filter(
    (language) =>
      new RegExp(`\\b${language}\\b\\s*(?:[:\\-]|\\(|$)`, "i").test(text) ||
      LANGUAGE_PROFICIENCY_PATTERNS.some((pattern) => pattern.test(text)),
  );
}

function detectExplicitDegreeTerms(text: string) {
  const lower = text.toLowerCase();
  return [...KNOWN_DEGREE_HINTS]
    .filter((term) => containsTerm(lower, term))
    .map(normalizeKeywordPhrase);
}

function detectExplicitCertificationTerms(text: string) {
  const lower = text.toLowerCase();
  return [...KNOWN_CERTIFICATION_HINTS]
    .filter((term) => containsTerm(lower, term))
    .map(normalizeKeywordPhrase);
}

function extractExplicitYears(text: string) {
  const match = text.match(
    /\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\+?\s+years?\b/i,
  );
  return match ? parseNumericValue(match[0]) : null;
}

function extractRequiredYears(text: string) {
  const match = text.match(
    /\b(?:at least|min(?:imum)?|over|more than)?\s*(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\+?\s+years?\b/i,
  );
  const parsedYears = match ? parseNumericValue(match[0]) : null;
  return parsedYears ?? undefined;
}

function deriveYearsFromDateRange(dateRange?: string) {
  if (!dateRange) return null;

  const lower = dateRange.toLowerCase();
  const yearMatches = [...lower.matchAll(/\b(19|20)\d{2}\b/g)].map((match) =>
    Number(match[0]),
  );
  if (!yearMatches.length) return null;

  const startYear = yearMatches[0];
  const endYear = lower.includes("present")
    ? new Date().getUTCFullYear()
    : yearMatches[1];

  if (!startYear || !endYear || endYear < startYear) return null;
  return endYear - startYear + (lower.includes("present") ? 1 : 0);
}

function hasProfessionalContext(text: string) {
  return /\b(company|client|project|product|role|team|customer|used|built|managed|supported|implemented|delivered|owned|led|worked)\b/i.test(
    text,
  );
}

function getFactConfidence(factKind: FactKind, text: string) {
  if (factKind === "experience" || factKind === "project") {
    return text.length > 30 ? 0.9 : 0.84;
  }
  if (factKind === "skills") return 0.56;
  if (factKind === "summary") return 0.44;
  if (factKind === "education" || factKind === "certification" || factKind === "language") {
    return 0.78;
  }
  if (factKind === "header") return 0.66;
  return 0.68;
}

function getUserFactConfidence(evidenceType: UserEvidenceType, text: string) {
  const explicit =
    evidenceType === "work_authorization"
      ? AUTHORIZATION_PATTERNS.some((pattern) => pattern.test(text))
      : evidenceType === "language"
        ? LANGUAGE_PROFICIENCY_PATTERNS.some((pattern) => pattern.test(text))
        : evidenceType === "certification"
          ? /cert|license|clearance/i.test(text)
          : evidenceType === "education"
            ? /degree|bachelor|master|phd|diploma/i.test(text)
            : hasProfessionalContext(text);

  if (evidenceType === "work_authorization" || evidenceType === "language") {
    return explicit ? 0.74 : 0.48;
  }

  if (evidenceType === "certification" || evidenceType === "education") {
    return explicit ? 0.72 : 0.52;
  }

  if (evidenceType === "experience" || evidenceType === "tool") {
    return explicit ? 0.68 : 0.5;
  }

  return explicit ? 0.64 : 0.48;
}

function getSectionWeight(factKind: FactKind) {
  switch (factKind) {
    case "experience":
    case "project":
      return 0.12;
    case "education":
    case "certification":
    case "language":
      return 0.08;
    case "skills":
      return 0.02;
    case "summary":
      return -0.08;
    case "header":
      return -0.04;
    default:
      return 0.03;
  }
}

function splitRequirementLineIntoItems(text: string, intent: SectionIntent) {
  const normalized = normalizeText(text);
  if (!normalized) return [];

  const sentenceCandidates = normalized
    .split(/\s*;\s*/)
    .flatMap((segment) => splitIntoSentences(segment).length ? splitIntoSentences(segment) : [segment]);
  const items: string[] = [];

  for (const candidate of sentenceCandidates) {
    const cleaned = cleanListItem(candidate);
    if (!cleaned) continue;

    const colonParts = cleaned.split(/:\s+/);
    const normalizedCandidate =
      colonParts.length === 2 && colonParts[0].split(" ").length <= 4
        ? colonParts[1]
        : cleaned;

    const splitItems = splitCompoundRequirementSentence(normalizedCandidate, intent);
    items.push(...splitItems);
  }

  return dedupeByNormalizedText(items, (item) => item);
}

function splitCompoundRequirementSentence(text: string, intent: SectionIntent) {
  const normalized = normalizeText(text);
  if (!normalized) return [];
  if (intent === "responsibility") return [normalized];

  const strippedLeadIn = normalized.replace(
    /^(?:you have|we are looking for|we're looking for|we’re looking for|must have|nice to have|experience with|experience in|proficiency in|knowledge of|skills and experience|what you bring)[:\s-]*/i,
    "",
  );

  const commaCount = (strippedLeadIn.match(/,/g) ?? []).length;
  const canSplitList =
    commaCount >= 1 &&
    /\b(?:and|or)\b/i.test(strippedLeadIn) &&
    /(?:experience|knowledge|proficiency|skills?|tools?|platforms?)/i.test(normalized);

  if (!canSplitList) return [normalized];

  const parts = strippedLeadIn
    .replace(/\band\b/gi, ",")
    .split(/\s*,\s*/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 3 && part.split(" ").length <= 6);

  return parts.length >= 2 ? parts : [normalized];
}

function shouldKeepRequirementItem(
  text: string,
  intent: SectionIntent,
  sectionLabel: string,
) {
  const normalized = normalizeText(text);
  if (normalized.length < 3) return false;
  if (isNonRequirementText(normalized, intent, sectionLabel)) return false;
  if (isLikelyJobTitleLine(normalized)) return false;
  if (/^(apply|click|submit|learn more)\b/i.test(normalized)) return false;

  if (intent === "responsibility") {
    return normalized.length >= 12 && hasResponsibilityCue(normalized);
  }

  if (intent === "must_have" || intent === "preferred" || intent === "about_you") {
    return (
      normalized.length >= 4 &&
      (hasQualificationCue(normalized) ||
        hasToolCue(normalized) ||
        Boolean(detectHardBlockerKind(normalized)) ||
        hasCandidateFacingCue(normalized))
    );
  }

  return (
    hasRequirementCue(normalized) ||
    hasQualificationCue(normalized) ||
    hasToolCue(normalized) ||
    Boolean(detectHardBlockerKind(normalized)) ||
    DOMAIN_KEYWORDS.some((keyword) => normalized.toLowerCase().includes(keyword)) ||
    SOFT_SKILL_KEYWORDS.some((keyword) => normalized.toLowerCase().includes(keyword)) ||
    sectionLooksRelevant(sectionLabel)
  );
}

function sectionLooksRelevant(label: string) {
  const lowerLabel = label.toLowerCase();
  return (
    REQUIREMENT_SECTION_PATTERNS.some((pattern) => pattern.test(lowerLabel)) ||
    RESPONSIBILITY_SECTION_PATTERNS.some((pattern) => pattern.test(lowerLabel)) ||
    PREFERRED_SECTION_PATTERNS.some((pattern) => pattern.test(lowerLabel))
  );
}

function hasRequirementCue(text: string) {
  return (
    HARD_BLOCKER_PATTERNS.some((pattern) => pattern.test(text)) ||
    MUST_HAVE_PATTERNS.some((pattern) => pattern.test(text)) ||
    NICE_TO_HAVE_PATTERNS.some((pattern) => pattern.test(text)) ||
    /\bexperience with\b/i.test(text) ||
    /\byou have\b/i.test(text) ||
    /\bwe are looking for\b/i.test(text) ||
    /\byou should apply if\b/i.test(text) ||
    /\byou may be a good fit if\b/i.test(text)
  );
}

function hasToolCue(text: string) {
  return [...KNOWN_TOOLS].some((tool) => containsTerm(text, tool));
}

function hasResponsibilityCue(text: string) {
  return (
    RESPONSIBILITY_PATTERNS.some((pattern) => pattern.test(text)) ||
    /^\b(?:investigate|analy[sz]e|maintain|coordinate|collaborate|document|troubleshoot|support|lead|manage|own|drive|build|deliver|improve|partner|reproduce)\b/i.test(
      text,
    ) ||
    /\byou(?:'ll| will)\b/i.test(text)
  );
}

function hasCandidateFacingCue(text: string) {
  return (
    /\byou(?:'ll| will| have| are| bring| may| should)\b/i.test(text) ||
    /\bability to\b/i.test(text) ||
    /\bcomfortable\b/i.test(text) ||
    /\bbackground in\b/i.test(text) ||
    /\bfamiliar(?:ity)? with\b/i.test(text)
  );
}

function hasQualificationCue(text: string) {
  return (
    /\bexperience (?:with|in)\b/i.test(text) ||
    /\bproficien(?:cy|t)\b/i.test(text) ||
    /\bknowledge of\b/i.test(text) ||
    /\bstrong\b/i.test(text) ||
    /\bability to\b/i.test(text) ||
    /\bfamiliar(?:ity)? with\b/i.test(text) ||
    /\bbackground in\b/i.test(text) ||
    /\bunderstanding of\b/i.test(text) ||
    /\bexcellent\b/i.test(text) ||
    /\bflu(?:ent|ency)\b/i.test(text) ||
    /\byears? of experience\b/i.test(text)
  );
}

function extractLocationPhrase(text: string) {
  const match = text.match(
    /\b(?:based in|located in|must reside in|onsite in|on-site in|hybrid in)\s+([a-z ,.-]+)/i,
  );
  return match?.[1]?.replace(/[.,;]$/, "").trim();
}

function extractLocationTokens(text: string) {
  const locationPhrase = extractLocationPhrase(text);
  if (!locationPhrase) {
    return [];
  }

  return normalizeText(locationPhrase)
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length > 2 && !["and", "the"].includes(token))
    .map((token) => token.replace(/[^a-z]/g, ""))
    .filter(Boolean);
}

function describeHardBlocker(kind: HardBlockerKind, text: string) {
  switch (kind) {
    case "authorization":
      return text.toLowerCase().includes("belgium")
        ? "work authorization in Belgium"
        : "work authorization";
    case "location":
      return extractLocationPhrase(text) ? `location in ${extractLocationPhrase(text)}` : "location";
    case "language":
      return detectExplicitLanguages(text, "language")[0] ?? "language proficiency";
    case "degree":
      return "degree requirement";
    case "certification":
      return "certification requirement";
    case "clearance":
      return "security clearance";
    case "driving_license":
      return "driving license";
    case "travel":
      return "travel availability";
    case "shift":
      return "shift or timezone availability";
    default:
      return "hard-blocker requirement";
  }
}

function summarizeRequirementDomain(requirement: JobRequirement) {
  return (
    requirement.keywords.find((keyword) => keyword.includes(" ")) ??
    requirement.keywords[0] ??
    "the role area"
  );
}

function buildAtsWarning(
  id: string,
  severity: ATSHygieneWarning["severity"],
  category: string,
  message: string,
  recommendation: string,
): ATSHygieneWarning {
  return {
    id,
    severity,
    category,
    message,
    recommendation,
  };
}

function sumImportance(requirements: JobRequirement[], status: EvidenceStatus) {
  return requirements
    .filter((requirement) => requirement.evidenceStatus === status)
    .reduce((sum, requirement) => sum + requirement.importance, 0);
}

function hasKeywordStuffing(cvText: string) {
  const keywords = extractKeywords(cvText, 12);
  return keywords.some((keyword) => {
    if (isGenericKeyword(keyword)) return false;
    return countOccurrences(cvText, keyword) >= 8;
  });
}

function hasWallOfText(sections: SectionText[]) {
  return sections.some((section) =>
    section.text
      .split(/\n{2,}/)
      .some((paragraph) => paragraph.trim().length > 500),
  );
}

function containsTerm(text: string, term: string) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(
    normalizeText(text).toLowerCase(),
  );
}

function isBoilerplateText(text: string) {
  return BOILERPLATE_TEXT_PATTERNS.some((pattern) => pattern.test(text));
}

function isNonRequirementText(
  text: string,
  intent: SectionIntent,
  sectionLabel: string,
) {
  if (isBoilerplateText(text)) return true;
  if (HARD_NON_REQUIREMENT_PROSE_PATTERNS.some((pattern) => pattern.test(text))) {
    return true;
  }
  if (NON_REQUIREMENT_PROSE_PATTERNS.some((pattern) => pattern.test(text))) {
    return !hasCandidateFacingCue(text) && !hasQualificationCue(text) && !hasToolCue(text);
  }

  const normalizedSectionLabel = sectionLabel.toLowerCase();
  const headingOnly =
    text.split(" ").length <= 6 &&
    !/[.!?]$/.test(text) &&
    !hasRequirementCue(text) &&
    !hasQualificationCue(text) &&
    !hasResponsibilityCue(text) &&
    !hasToolCue(text) &&
    !Boolean(detectHardBlockerKind(text));

  if (headingOnly) {
    return true;
  }

  if (
    intent === "general" &&
    !sectionLooksRelevant(normalizedSectionLabel) &&
    !hasRequirementCue(text) &&
    !hasQualificationCue(text) &&
    !hasResponsibilityCue(text) &&
    !hasToolCue(text) &&
    !Boolean(detectHardBlockerKind(text)) &&
    !DOMAIN_KEYWORDS.some((keyword) => text.toLowerCase().includes(keyword)) &&
    !SOFT_SKILL_KEYWORDS.some((keyword) => text.toLowerCase().includes(keyword))
  ) {
    return true;
  }

  return false;
}

function isBulletLine(line: string) {
  return /^\s*(?:[-*•·▪]|(?:\d+|[a-z])[\].)])\s+/.test(line);
}

function looksLikeRoleContextLine(line: string) {
  return (
    line.length < 100 &&
    (hasDateLikeText(line) ||
      /\|/.test(line) ||
      /^[A-Z][A-Za-z0-9,&()'./ -]+$/.test(line))
  );
}

function isLikelyJobTitleLine(line: string) {
  return (
    line.length > 6 &&
    line.length < 90 &&
    !line.endsWith(".") &&
    /^[A-Z][A-Za-z0-9,&()'./ -]+$/.test(line)
  );
}

function cleanTitle(title: string) {
  return title.replace(/[-|].*$/, "").replace(/\s+/g, " ").trim();
}

function formatYears(years: number) {
  return `${years} year${years === 1 ? "" : "s"}`;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
