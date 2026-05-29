import {
  KNOWN_TOOLS,
  clamp,
  cleanListItem,
  countOccurrences,
  dedupeByNormalizedText,
  expandKeywordVariants,
  extractKeywords,
  findAnchor,
  hasDateLikeText,
  hasEducationLikeText,
  isGenericKeyword,
  normalizeKeywordPhrase,
  normalizeText,
  splitIntoSentences,
  splitTextIntoSections,
  uniqueStrings,
} from "@/lib/analysis-utils";
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
} from "@/lib/types";

const DEFAULT_LOCAL_MODEL = "local-deterministic-evidence-engine";

const HARD_BLOCKER_PATTERNS = [
  /\bwork authorization\b/i,
  /\bvisa\b/i,
  /\bcitizen(ship)?\b/i,
  /\bsecurity clearance\b/i,
  /\bclearance\b/i,
  /\bdriver'?s license\b/i,
  /\bdriving license\b/i,
  /\blicense required\b/i,
  /\bcertification required\b/i,
  /\bdegree required\b/i,
  /\bbachelor'?s?\b/i,
  /\bmaster'?s?\b/i,
  /\bon[- ]site\b/i,
  /\bhybrid\b/i,
  /\bin[- ]office\b/i,
  /\btravel\b/i,
  /\bfluent\b/i,
  /\bnative\b/i,
  /\blanguage\b/i,
];

const MUST_HAVE_PATTERNS = [
  /\bmust\b/i,
  /\brequired\b/i,
  /\bminimum\b/i,
  /\bneed\b/i,
  /\bmandatory\b/i,
  /\bat least\b/i,
  /\bproven experience\b/i,
  /\byears? of experience\b/i,
];

const NICE_TO_HAVE_PATTERNS = [
  /\bpreferred\b/i,
  /\bnice to have\b/i,
  /\bbonus\b/i,
  /\bplus\b/i,
  /\badvantage\b/i,
  /\bdesirable\b/i,
  /\bwould be great\b/i,
];

const RESPONSIBILITY_PATTERNS = [
  /\byou will\b/i,
  /\bresponsible for\b/i,
  /\bmanage\b/i,
  /\bdeliver\b/i,
  /\bsupport\b/i,
  /\bmaintain\b/i,
  /\bbuild\b/i,
  /\bown\b/i,
  /\bdrive\b/i,
  /\blead\b/i,
];

const DOMAIN_KEYWORDS = [
  "saas",
  "healthcare",
  "finance",
  "fintech",
  "ecommerce",
  "telecom",
  "manufacturing",
  "b2b",
  "b2c",
  "support operations",
  "customer success",
  "technical support",
];

const SOFT_SKILL_KEYWORDS = [
  "communication",
  "stakeholder",
  "collaboration",
  "leadership",
  "problem solving",
  "ownership",
  "teamwork",
  "presentation",
  "organized",
  "adaptable",
];

const JOB_BOILERPLATE_PATTERNS = [
  /equal opportunity/i,
  /all qualified applicants/i,
  /backgrounds/i,
  /benefits/i,
  /compensation/i,
  /salary/i,
  /privacy/i,
  /cookie/i,
  /our mission/i,
  /about us/i,
  /join our team/i,
];

const EXPERIENCE_SECTIONS = new Set([
  "experience",
  "employment",
  "work history",
  "professional experience",
  "projects",
]);

const SKILLS_SECTIONS = new Set([
  "skills",
  "technical skills",
  "core skills",
  "tools",
  "technologies",
]);

const EDUCATION_SECTIONS = new Set([
  "education",
  "certifications",
  "licenses",
]);

const SUMMARY_SECTIONS = new Set(["summary", "profile", "objective", "header"]);

type AnalyzeLocallyOptions = {
  assistant?: GroundedOpenAIAssist;
  mode?: AnalyzerMode;
  model?: string;
  warnings?: string[];
};

type IndexedFact = CandidateFact & {
  searchText: string;
  normalizedKeywords: string[];
  sectionWeight: number;
};

type RawRequirement = {
  text: string;
  sourceSection?: string;
  anchors: TextAnchor[];
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
  const matchedRequirements = matchRequirementsToFacts(requirements, cvFacts);
  const atsWarnings = runAtsHygieneChecks(cvText, cvSections, cvFacts);
  const scoring = computeScoring(matchedRequirements, atsWarnings);

  return {
    meta: {
      version: "phase1.v1",
      mode: options.mode ?? "local",
      model: options.model ?? DEFAULT_LOCAL_MODEL,
      generatedAt: new Date().toISOString(),
      warnings: options.warnings ?? [],
    },
    cv: {
      rawTextLength: normalizedCv.length,
      sections: cvSections,
      facts: cvFacts,
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
  };
}

function extractCandidateFacts(cvText: string, sections: SectionText[]) {
  const facts: CandidateFact[] = [];
  let factIndex = 1;

  for (const section of sections) {
    const normalizedLabel = section.label.toLowerCase();
    const nextFacts = EXPERIENCE_SECTIONS.has(normalizedLabel)
      ? extractExperienceFacts(section, cvText, factIndex)
      : extractGenericFacts(section, cvText, factIndex);

    facts.push(...nextFacts);
    factIndex += nextFacts.length;
  }

  return dedupeByNormalizedText(facts, (fact) => fact.text).slice(0, 120);
}

function extractExperienceFacts(
  section: SectionText,
  cvText: string,
  startIndex: number,
) {
  const lines = section.text.split("\n").map((line) => line.trim()).filter(Boolean);
  const facts: CandidateFact[] = [];
  let context: string[] = [];
  let factCounter = startIndex;

  for (const line of lines) {
    if (isBulletLine(line)) {
      const bulletText = cleanListItem(line);
      if (bulletText.length < 12) continue;
      facts.push(buildFact(section.label, bulletText, cvText, factCounter, context));
      factCounter += 1;
      continue;
    }

    if (looksLikeContextLine(line)) {
      context = [...context.slice(-2), line];
      continue;
    }

    for (const sentence of splitIntoSentences(line)) {
      if (sentence.length < 20) continue;
      facts.push(buildFact(section.label, sentence, cvText, factCounter, context));
      factCounter += 1;
    }
  }

  return facts;
}

function extractGenericFacts(
  section: SectionText,
  cvText: string,
  startIndex: number,
) {
  const normalizedLabel = section.label.toLowerCase();
  const lines = section.text.split("\n").map((line) => line.trim()).filter(Boolean);
  const facts: CandidateFact[] = [];
  let factCounter = startIndex;

  for (const line of lines) {
    if (SKILLS_SECTIONS.has(normalizedLabel)) {
      const anchors = findAnchor(cvText, line, "cv", section.label);
      facts.push({
        id: `fact_${factCounter}`,
        sourceSection: section.label,
        text: cleanListItem(line),
        skills: extractSkills(cleanListItem(line)),
        tools: extractTools(cleanListItem(line)),
        metrics: extractMetrics(cleanListItem(line)),
        confidence: 0.62,
        anchors,
      });
      factCounter += 1;
      continue;
    }

    if (line.length < 12) continue;
    const items = isBulletLine(line) ? [cleanListItem(line)] : splitIntoSentences(line);

    for (const item of items) {
      if (item.length < 12) continue;
      facts.push(buildFact(section.label, item, cvText, factCounter));
      factCounter += 1;
    }
  }

  return facts;
}

function buildFact(
  sectionLabel: string,
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
  const normalizedLabel = sectionLabel.toLowerCase();

  return {
    id: `fact_${factIndex}`,
    sourceSection: sectionLabel,
    text: factText,
    role: parsedContext.role,
    company: parsedContext.company,
    dateRange: parsedContext.dateRange,
    skills: extractSkills(combinedText),
    tools: extractTools(combinedText),
    metrics: extractMetrics(factText),
    confidence: getFactConfidence(normalizedLabel, factText),
    anchors,
  };
}

function inferJobTitle(jobText: string, jobUrl: string, assistantTitle?: string) {
  if (assistantTitle) return assistantTitle;

  const titlePatterns = [
    /job title[:\s]+([^\n.]+)/i,
    /position[:\s]+([^\n.]+)/i,
    /role[:\s]+([^\n.]+)/i,
    /hiring\s+(?:a|an)\s+([^\n.]+)/i,
  ];

  for (const pattern of titlePatterns) {
    const match = jobText.match(pattern);
    if (match?.[1]) {
      return cleanTitle(match[1]);
    }
  }

  const firstLine = jobText.split("\n").find((line) => {
    const trimmed = line.trim();
    return trimmed.length > 6 && trimmed.length < 90 && !trimmed.endsWith(".");
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
      })),
    );
  }

  return dedupeByNormalizedText(rawRequirements, (requirement) => requirement.text)
    .map((requirement, index) => buildRequirement(requirement, index + 1))
    .slice(0, 40);
}

function extractRequirementsFromSection(section: SectionText, jobText: string) {
  const normalizedLabel = section.label.toLowerCase();
  const isRelevantSection = isRelevantJobSection(normalizedLabel, section.text);
  const requirements: RawRequirement[] = [];
  const lines = section.text.split("\n").map((line) => line.trim()).filter(Boolean);

  for (const line of lines) {
    if (isLikelyJobTitleLine(line) || isBoilerplate(line)) continue;

    if (isBulletLine(line)) {
      const item = cleanListItem(line);
      if (item.length > 10) {
        requirements.push({
          text: item,
          sourceSection: section.label,
          anchors: findAnchor(jobText, item, "job", section.label),
        });
      }
      continue;
    }

    if (!isRelevantSection && !hasRequirementCue(line) && !hasToolCue(line)) {
      continue;
    }

    if (line.length < 18) continue;

    const items = splitIntoSentences(line);
    for (const item of items.length ? items : [line]) {
      if (!shouldKeepRequirementSentence(item, normalizedLabel)) continue;
      requirements.push({
        text: item,
        sourceSection: section.label,
        anchors: findAnchor(jobText, item, "job", section.label),
      });
    }
  }

  if (!requirements.length && isRelevantSection) {
    for (const sentence of splitIntoSentences(section.text)) {
      if (!shouldKeepRequirementSentence(sentence, normalizedLabel)) continue;
      requirements.push({
        text: sentence,
        sourceSection: section.label,
        anchors: findAnchor(jobText, sentence, "job", section.label),
      });
    }
  }

  return requirements.filter((requirement) => requirement.anchors.length > 0);
}

function extractFallbackRequirements(jobText: string) {
  return splitIntoSentences(jobText)
    .filter((sentence) => shouldKeepRequirementSentence(sentence, "general"))
    .map((sentence) => ({
      text: sentence,
      sourceSection: "General",
      anchors: findAnchor(jobText, sentence, "job", "General"),
    }))
    .filter((requirement) => requirement.anchors.length > 0);
}

function buildRequirement(rawRequirement: RawRequirement, index: number): JobRequirement {
  const category = classifyRequirement(rawRequirement.text, rawRequirement.sourceSection);
  const importance = determineImportance(
    category,
    rawRequirement.text,
    rawRequirement.sourceSection,
  );
  const keywords = extractKeywords(rawRequirement.text, 14);
  const normalizedKeywords = uniqueStrings(expandKeywordVariants(keywords));

  return {
    id: `req_${index}`,
    text: rawRequirement.text,
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
    const matches = indexedFacts
      .map((fact) => buildEvidenceMatch(requirement, fact))
      .filter((match): match is EvidenceMatch => Boolean(match))
      .sort(sortMatches)
      .slice(0, 3);

    const mediumCount = matches.filter((match) => match.strength === "medium").length;
    const hasStrong = matches.some((match) => match.strength === "strong");

    let evidenceStatus: EvidenceStatus = "missing";

    if (hasStrong || mediumCount >= 2) {
      evidenceStatus = "supported";
    } else if (matches.length > 0) {
      evidenceStatus = "weak";
    }

    if (requirement.category === "hard_blocker" && matches.length === 0) {
      evidenceStatus = "blocked";
    }

    return {
      ...requirement,
      matchedEvidence: matches,
      evidenceStatus,
      confidenceReason: buildConfidenceReason(requirement, matches, evidenceStatus),
    };
  });
}

function buildEvidenceMatch(
  requirement: JobRequirement,
  fact: IndexedFact,
): EvidenceMatch | null {
  const requirementText = normalizeKeywordPhrase(requirement.text);
  const exactRequirementMatch =
    requirementText.length > 8 && fact.searchText.includes(requirementText);
  const factKeywordSet = new Set(fact.normalizedKeywords);
  const exactKeywordMatches = requirement.normalizedKeywords.filter((keyword) =>
    factKeywordSet.has(keyword),
  );
  const phraseMatches = requirement.normalizedKeywords.filter(
    (keyword) => keyword.includes(" ") && fact.searchText.includes(keyword),
  );
  const synonymMatches = requirement.normalizedKeywords.filter(
    (keyword) =>
      keyword === "crm" &&
      (factKeywordSet.has("salesforce") || factKeywordSet.has("hubspot")),
  );

  const overlap = uniqueStrings([
    ...exactKeywordMatches,
    ...phraseMatches,
    ...synonymMatches,
  ]);
  const specificOverlap = overlap.filter((keyword) => !isGenericKeyword(keyword));
  const toolOverlap = overlap.filter((keyword) => KNOWN_TOOLS.has(keyword));

  if (!overlap.length && !exactRequirementMatch) {
    return null;
  }

  const sectionBonus = fact.sectionWeight;
  const confidenceBonus = fact.confidence * 0.08;
  const score = clamp(
    (exactRequirementMatch ? 0.52 : 0) +
      Math.min(0.34, specificOverlap.length * 0.12) +
      Math.min(0.12, toolOverlap.length * 0.08) +
      Math.min(0.1, phraseMatches.length * 0.05) +
      Math.min(0.08, synonymMatches.length * 0.04) +
      sectionBonus +
      confidenceBonus,
    0,
    0.99,
  );

  const matchType = determineMatchType(
    exactRequirementMatch,
    phraseMatches.length,
    synonymMatches.length,
    specificOverlap.length,
  );
  const strength = determineMatchStrength(
    requirement,
    fact,
    score,
    exactRequirementMatch,
    specificOverlap.length,
    toolOverlap.length,
    phraseMatches.length,
  );

  if (!strength) {
    return null;
  }

  return {
    id: `${requirement.id}_${fact.id}`,
    requirementId: requirement.id,
    factId: fact.id,
    matchedText: fact.text,
    matchType,
    strength,
    score: Number(score.toFixed(2)),
    explanation: buildMatchExplanation(fact, overlap, strength),
    anchors: fact.anchors,
  };
}

function determineMatchType(
  exactRequirementMatch: boolean,
  phraseMatchCount: number,
  synonymMatchCount: number,
  overlapCount: number,
): MatchType {
  if (exactRequirementMatch) return "exact";
  if (phraseMatchCount > 0) return "phrase";
  if (synonymMatchCount > 0) return "synonym";
  if (overlapCount > 0) return "inferred";
  return "semantic";
}

function determineMatchStrength(
  requirement: JobRequirement,
  fact: IndexedFact,
  score: number,
  exactRequirementMatch: boolean,
  specificOverlapCount: number,
  toolOverlapCount: number,
  phraseMatchCount: number,
): EvidenceStrength | null {
  if (
    exactRequirementMatch ||
    specificOverlapCount >= 3 ||
    (toolOverlapCount >= 1 && specificOverlapCount >= 2) ||
    (requirement.category === "hard_blocker" &&
      specificOverlapCount >= 2 &&
      !isWeakEvidenceSection(fact.sourceSection))
  ) {
    return downgradeStrengthIfNeeded(requirement, fact, "strong", toolOverlapCount);
  }

  if (
    specificOverlapCount >= 2 ||
    toolOverlapCount >= 1 ||
    phraseMatchCount >= 1 ||
    score >= 0.56
  ) {
    return downgradeStrengthIfNeeded(requirement, fact, "medium", toolOverlapCount);
  }

  if (specificOverlapCount >= 1 || score >= 0.28) {
    return downgradeStrengthIfNeeded(requirement, fact, "weak", toolOverlapCount);
  }

  return null;
}

function downgradeStrengthIfNeeded(
  requirement: JobRequirement,
  fact: IndexedFact,
  strength: EvidenceStrength,
  toolOverlapCount: number,
): EvidenceStrength {
  if (
    isWeakEvidenceSection(fact.sourceSection) &&
    strength === "strong" &&
    requirement.category !== "hard_blocker" &&
    toolOverlapCount === 0
  ) {
    return "weak";
  }

  if (SKILLS_SECTIONS.has(fact.sourceSection.toLowerCase()) && strength === "strong") {
    return toolOverlapCount > 0 ? "medium" : "weak";
  }

  return strength;
}

function buildConfidenceReason(
  requirement: JobRequirement,
  matches: EvidenceMatch[],
  evidenceStatus: EvidenceStatus,
) {
  if (!matches.length && evidenceStatus === "blocked") {
    return "This hard blocker has no grounded supporting evidence in the CV.";
  }

  if (!matches.length) {
    return "No grounded CV fact was strong enough to support this requirement.";
  }

  const strongest = matches[0];

  if (evidenceStatus === "supported") {
    return `Supported by ${strongest.strength} evidence from the ${matches[0].anchors[0]?.section ?? "CV"} section.`;
  }

  return `Only ${strongest.strength} evidence was found, so this requirement still needs review.`;
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

  if (!sectionLabels.has("experience") && !sectionLabels.has("employment") && !sectionLabels.has("work history")) {
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

  if ((cvText.match(/\|/g) ?? []).length >= 4 || /\t/.test(cvText) || /-{4,}|_{4,}/.test(cvText)) {
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

  if (/(font-size\s*:\s*0|display\s*:\s*none|opacity\s*:\s*0|color\s*:\s*#?fff\b|white text|hidden text|invisible text)/i.test(lowerCv)) {
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
  const totalImportance =
    requirements.reduce((sum, requirement) => sum + requirement.importance, 0) || 1;

  const supportedWeight = requirements
    .filter((requirement) => requirement.evidenceStatus === "supported")
    .reduce((sum, requirement) => sum + requirement.importance, 0);
  const weakWeight = requirements
    .filter((requirement) => requirement.evidenceStatus === "weak")
    .reduce((sum, requirement) => sum + requirement.importance, 0);
  const missingWeight = requirements
    .filter((requirement) => requirement.evidenceStatus === "missing")
    .reduce((sum, requirement) => sum + requirement.importance, 0);
  const blockedWeight = requirements
    .filter((requirement) => requirement.evidenceStatus === "blocked")
    .reduce((sum, requirement) => sum + requirement.importance, 0);

  const atsPenalty = warnings.reduce((sum, warning) => {
    if (warning.severity === "critical") return sum + 18;
    if (warning.severity === "warning") return sum + 8;
    return sum + 3;
  }, 0);

  const atsParseScore = clamp(100 - atsPenalty, 0, 100);

  const jobMatchScore = Math.round(
    (requirements.reduce((sum, requirement) => {
      const factor =
        requirement.evidenceStatus === "supported"
          ? 1
          : requirement.evidenceStatus === "weak"
            ? 0.45
            : 0;
      return sum + requirement.importance * factor;
    }, 0) /
      totalImportance) *
      100,
  );

  const evidenceConfidenceScore = Math.round(
    (requirements.reduce((sum, requirement) => {
      const bestScore = requirement.matchedEvidence[0]?.score ?? 0;
      const factor =
        requirement.evidenceStatus === "supported"
          ? 0.7 + bestScore * 0.3
          : requirement.evidenceStatus === "weak"
            ? 0.25 + bestScore * 0.35
            : requirement.evidenceStatus === "missing"
              ? 0.05
              : 0;
      return sum + requirement.importance * factor;
    }, 0) /
      totalImportance) *
      100,
  );

  const overallReadinessScore = Math.round(
    atsParseScore * 0.25 + jobMatchScore * 0.45 + evidenceConfidenceScore * 0.3,
  );

  return {
    atsParseScore,
    jobMatchScore,
    evidenceConfidenceScore,
    overallReadinessScore: clamp(overallReadinessScore, 0, 100),
    breakdown: {
      supportedWeight,
      weakWeight,
      missingWeight,
      blockedWeight,
      atsPenalty,
    },
  };
}

function indexFact(fact: CandidateFact): IndexedFact {
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

  return {
    ...fact,
    searchText: normalizeText(combinedText).toLowerCase(),
    normalizedKeywords: uniqueStrings(expandKeywordVariants(extractKeywords(combinedText, 16))),
    sectionWeight: getSectionWeight(fact.sourceSection),
  };
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

function classifyRequirement(text: string, sourceSection?: string): RequirementCategory {
  const lowerText = text.toLowerCase();
  const section = (sourceSection ?? "").toLowerCase();

  if (HARD_BLOCKER_PATTERNS.some((pattern) => pattern.test(lowerText))) {
    return "hard_blocker";
  }

  if (NICE_TO_HAVE_PATTERNS.some((pattern) => pattern.test(lowerText)) || section.includes("preferred")) {
    return "nice_to_have";
  }

  if (
    MUST_HAVE_PATTERNS.some((pattern) => pattern.test(lowerText)) ||
    section.includes("required") ||
    section.includes("minimum")
  ) {
    return detectToolOrSoftSkillCategory(lowerText) ?? "must_have";
  }

  if (section.includes("responsibilit") || section.includes("dut") || RESPONSIBILITY_PATTERNS.some((pattern) => pattern.test(lowerText))) {
    return "responsibility";
  }

  const specializedCategory = detectToolOrSoftSkillCategory(lowerText);
  if (specializedCategory) return specializedCategory;

  if (section.includes("skills") || section.includes("qualifications")) {
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

function detectToolOrSoftSkillCategory(text: string) {
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

function parseFactContext(context: string[]) {
  const trimmed = context.map((line) => line.trim()).filter(Boolean).slice(-2);
  if (!trimmed.length) {
    return {
      role: undefined,
      company: undefined,
      dateRange: undefined,
    };
  }

  const [first, second] = trimmed;
  const dateSource = trimmed.find((line) => hasDateLikeText(line));
  const dateRange = dateSource ? extractDateRange(dateSource) : undefined;

  const role = first && !hasDateLikeText(first) && first.length < 90 ? first : undefined;
  let company: string | undefined;

  if (second && second.includes("|")) {
    const companyCandidate = second
      .split("|")
      .map((part) => part.trim())
      .find((part) => part && !hasDateLikeText(part));
    company = companyCandidate || undefined;
  } else if (second && !hasDateLikeText(second) && second.length < 90) {
    company = second;
  }

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

function extractSkills(text: string) {
  return extractKeywords(text, 10).filter((keyword) => !KNOWN_TOOLS.has(keyword));
}

function extractTools(text: string) {
  const normalizedText = normalizeText(text).toLowerCase();
  return [...KNOWN_TOOLS].filter((tool) => normalizedText.includes(tool)).slice(0, 8);
}

function extractMetrics(text: string) {
  const metrics = [
    ...text.matchAll(
      /(?:[$€£]\s?\d[\d,.]*(?:\s?[kKmM])?|\b\d+(?:\.\d+)?%|\b\d+(?:\.\d+)?\s?(?:hours?|days?|weeks?|months?|years?|tickets?|users?|customers?|projects?|incidents?|sla|kpi|kpis|x))\b/gi,
    ),
  ].map((match) => match[0].trim());

  return uniqueStrings(metrics).slice(0, 6);
}

function getFactConfidence(sectionLabel: string, text: string) {
  if (EXPERIENCE_SECTIONS.has(sectionLabel)) return text.length > 35 ? 0.88 : 0.82;
  if (SKILLS_SECTIONS.has(sectionLabel)) return 0.62;
  if (EDUCATION_SECTIONS.has(sectionLabel)) return 0.74;
  if (SUMMARY_SECTIONS.has(sectionLabel)) return 0.48;
  return 0.68;
}

function buildMatchExplanation(
  fact: CandidateFact,
  overlap: string[],
  strength: EvidenceStrength,
) {
  const overlapPreview = overlap.slice(0, 3).join(", ");
  const sectionName = fact.sourceSection || "CV";

  if (SKILLS_SECTIONS.has(sectionName.toLowerCase())) {
    return `Skills evidence lists ${overlapPreview || "related terms"}, but it is not yet backed by a work example.`;
  }

  if (SUMMARY_SECTIONS.has(sectionName.toLowerCase())) {
    return `Summary wording mentions ${overlapPreview || "related terms"}, so the match stays more cautious.`;
  }

  return `${strength === "strong" ? "Work" : "Relevant"} evidence in ${sectionName} mentions ${overlapPreview || "related terms"}.`;
}

function isRelevantJobSection(label: string, text: string) {
  return (
    label.includes("require") ||
    label.includes("qualif") ||
    label.includes("responsibilit") ||
    label.includes("dut") ||
    label.includes("skill") ||
    label.includes("experience") ||
    label.includes("about you") ||
    label.includes("looking for") ||
    hasRequirementCue(text)
  );
}

function shouldKeepRequirementSentence(text: string, sectionLabel: string) {
  const normalizedText = normalizeText(text);
  if (normalizedText.length < 12 || isBoilerplate(normalizedText)) return false;
  if (isLikelyJobTitleLine(normalizedText)) return false;

  return (
    isRelevantJobSection(sectionLabel, normalizedText) ||
    hasRequirementCue(normalizedText) ||
    hasToolCue(normalizedText)
  );
}

function hasRequirementCue(text: string) {
  return (
    HARD_BLOCKER_PATTERNS.some((pattern) => pattern.test(text)) ||
    MUST_HAVE_PATTERNS.some((pattern) => pattern.test(text)) ||
    NICE_TO_HAVE_PATTERNS.some((pattern) => pattern.test(text)) ||
    RESPONSIBILITY_PATTERNS.some((pattern) => pattern.test(text)) ||
    /\bexperience with\b/i.test(text)
  );
}

function hasToolCue(text: string) {
  const lowerText = text.toLowerCase();
  return [...KNOWN_TOOLS].some((tool) => lowerText.includes(tool));
}

function isBoilerplate(text: string) {
  return JOB_BOILERPLATE_PATTERNS.some((pattern) => pattern.test(text));
}

function isBulletLine(line: string) {
  return /^\s*(?:[-*•·▪]|(?:\d+|[a-z])[\].)])\s+/.test(line);
}

function looksLikeContextLine(line: string) {
  return (
    line.length < 90 &&
    (hasDateLikeText(line) || /\|/.test(line) || /^[A-Z][A-Za-z0-9,&()'./ -]+$/.test(line))
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

function isWeakEvidenceSection(sectionLabel: string) {
  return SUMMARY_SECTIONS.has(sectionLabel.toLowerCase());
}

function getSectionWeight(sectionLabel: string) {
  const normalizedLabel = sectionLabel.toLowerCase();
  if (EXPERIENCE_SECTIONS.has(normalizedLabel)) return 0.14;
  if (EDUCATION_SECTIONS.has(normalizedLabel)) return 0.08;
  if (SKILLS_SECTIONS.has(normalizedLabel)) return 0.03;
  if (SUMMARY_SECTIONS.has(normalizedLabel)) return -0.06;
  return 0.04;
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

function hasKeywordStuffing(cvText: string) {
  const keywords = extractKeywords(cvText, 10);
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

function cleanTitle(title: string) {
  return title.replace(/[-|].*$/, "").replace(/\s+/g, " ").trim();
}
