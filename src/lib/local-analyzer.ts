import type {
  AnalysisResult,
  AtsRisk,
  Confidence,
  EvidenceItem,
  GapItem,
  JobProfile,
  KeywordCoverage,
  ParserSignal,
  TailoredLayer,
} from "@/lib/types";

const STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "also",
  "and",
  "are",
  "based",
  "been",
  "being",
  "both",
  "can",
  "candidate",
  "company",
  "from",
  "has",
  "have",
  "into",
  "job",
  "more",
  "must",
  "our",
  "position",
  "role",
  "that",
  "the",
  "their",
  "this",
  "through",
  "using",
  "with",
  "will",
  "work",
  "you",
  "your",
]);

const SKILL_HINTS = [
  "api",
  "apis",
  "azure",
  "crm",
  "customer",
  "debugging",
  "excel",
  "incident",
  "jira",
  "linux",
  "monitoring",
  "product",
  "python",
  "reporting",
  "saas",
  "salesforce",
  "scrum",
  "sla",
  "sql",
  "stakeholder",
  "support",
  "technical",
  "ticketing",
  "troubleshooting",
  "windows",
  "workflow",
];

export function analyzeLocally(
  cvText: string,
  jobText: string,
  jobUrl = "",
  warning = "Local heuristic mode. Add OPENAI_API_KEY for deeper evidence-based rewriting.",
): AnalysisResult {
  const cv = normalizeText(cvText);
  const job = normalizeText(jobText);
  const jobProfile = buildJobProfile(job, jobUrl);
  const cvKeywords = extractKeywords(cv, 45);
  const jobKeywords = jobProfile.keywords;
  const keywordCoverage = buildKeywordCoverage(jobKeywords, cvKeywords, cv);
  const evidenceMap = buildEvidenceMap(jobKeywords, cv);
  const parserSignals = buildParserSignals(cvText);
  const atsRisks = buildAtsRisks(cvText, parserSignals);
  const layers = buildLayers(cv, jobProfile, keywordCoverage, evidenceMap);
  const gaps = buildGaps(keywordCoverage.missing);
  const readiness = Math.max(
    35,
    Math.round(
      100 -
        atsRisks.filter((risk) => risk.level === "danger").length * 18 -
        atsRisks.filter((risk) => risk.level === "warning").length * 8,
    ),
  );
  const finalDraft = composeDraft(layers);

  return {
    meta: {
      mode: "local",
      model: "local-keyword-evidence-engine",
      generatedAt: new Date().toISOString(),
      warning,
    },
    parser: {
      readiness,
      signals: parserSignals,
    },
    job: jobProfile,
    keywordCoverage,
    evidenceMap,
    layers,
    gaps,
    atsRisks,
    finalDraft,
  };
}

function normalizeText(text: string) {
  return text.replace(/\r/g, "").replace(/[ \t]+/g, " ").trim();
}

function extractKeywords(text: string, limit: number) {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9+#./ -]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));

  const counts = new Map<string, number>();
  for (const token of tokens) {
    const normalized = token.replace(/^[./-]+|[./-]+$/g, "");
    if (normalized.length < 3) continue;
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }

  for (const hint of SKILL_HINTS) {
    if (text.toLowerCase().includes(hint)) {
      counts.set(hint, (counts.get(hint) ?? 0) + 4);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([keyword]) => keyword);
}

function buildJobProfile(job: string, jobUrl: string): JobProfile {
  const keywords = extractKeywords(job, 28);
  const title = inferTitle(job, jobUrl);
  const seniority = inferSeniority(job);
  const requiredSkills = pickTerms(job, [
    "required",
    "must have",
    "you have",
    "requirements",
    "minimum",
  ]);
  const preferredSkills = pickTerms(job, [
    "preferred",
    "nice to have",
    "plus",
    "bonus",
    "advantage",
  ]);
  const responsibilities = pickTerms(job, [
    "responsibilities",
    "you will",
    "what you will do",
    "duties",
  ]);
  const tools = keywords.filter((keyword) =>
    [
      "api",
      "azure",
      "excel",
      "jira",
      "python",
      "salesforce",
      "sap",
      "sql",
      "tableau",
      "zendesk",
    ].includes(keyword),
  );

  return {
    title,
    seniority,
    requiredSkills,
    preferredSkills,
    responsibilities,
    tools,
    keywords,
  };
}

function inferTitle(job: string, jobUrl: string) {
  const titlePatterns = [
    /job title[:\s]+([^\n.]+)/i,
    /position[:\s]+([^\n.]+)/i,
    /role[:\s]+([^\n.]+)/i,
    /hiring\s+(?:a|an)\s+([^\n.]+)/i,
  ];

  for (const pattern of titlePatterns) {
    const match = job.match(pattern);
    if (match?.[1]) return cleanTitle(match[1]);
  }

  const firstLine = job.split("\n").find((line) => {
    const trimmed = line.trim();
    return trimmed.length > 6 && trimmed.length < 90;
  });

  if (firstLine) return cleanTitle(firstLine);
  if (jobUrl) return "Target role from job URL";
  return "Target role";
}

function cleanTitle(title: string) {
  return title.replace(/[-|].*$/, "").replace(/\s+/g, " ").trim();
}

function inferSeniority(job: string) {
  const lower = job.toLowerCase();
  if (/\b(senior|lead|principal|manager)\b/.test(lower)) return "senior";
  if (/\b(junior|entry|graduate|intern)\b/.test(lower)) return "junior";
  return "mid-level or unspecified";
}

function pickTerms(job: string, labels: string[]) {
  const lines = job
    .split("\n")
    .map((line) => line.replace(/^[-*\u2022]\s*/, "").trim())
    .filter(Boolean);

  const picked = lines.filter((line) => {
    const lower = line.toLowerCase();
    return labels.some((label) => lower.includes(label));
  });

  return picked.slice(0, 8);
}

function buildKeywordCoverage(
  jobKeywords: string[],
  cvKeywords: string[],
  cv: string,
): KeywordCoverage {
  const lowerCv = cv.toLowerCase();
  const matched = jobKeywords.filter((keyword) => lowerCv.includes(keyword));
  const weak = jobKeywords.filter(
    (keyword) =>
      !matched.includes(keyword) &&
      cvKeywords.some(
        (cvKeyword) =>
          cvKeyword.includes(keyword) || keyword.includes(cvKeyword),
      ),
  );
  const missing = jobKeywords.filter(
    (keyword) => !matched.includes(keyword) && !weak.includes(keyword),
  );

  return {
    matched: matched.slice(0, 18),
    weak: weak.slice(0, 12),
    missing: missing.slice(0, 12),
  };
}

function buildEvidenceMap(jobKeywords: string[], cv: string): EvidenceItem[] {
  const sentences = cv
    .split(/\n|(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 20);

  return jobKeywords.slice(0, 14).map((requirement) => {
    const direct = sentences.find((sentence) =>
      sentence.toLowerCase().includes(requirement),
    );
    const partial = sentences.find((sentence) =>
      requirement
        .split(/[/-]/)
        .some((part) => part.length > 3 && sentence.toLowerCase().includes(part)),
    );
    const evidence = direct ?? partial ?? "";
    const confidence: Confidence = direct ? "high" : partial ? "medium" : "low";

    return {
      requirement,
      evidence,
      confidence,
      action: evidence ? "rewrite" : "user_confirm",
    };
  });
}

function buildParserSignals(cvText: string): ParserSignal[] {
  const lower = cvText.toLowerCase();
  const hasEmail = /[^\s@]+@[^\s@]+\.[^\s@]+/.test(cvText);
  const hasPhone = /(\+\d{1,3}[\s.-]?)?(\(?\d{2,4}\)?[\s.-]?){2,}/.test(cvText);
  const hasExperience = /\b(experience|employment|work history)\b/.test(lower);
  const hasEducation = /\b(education|degree|university|college)\b/.test(lower);
  const hasSkills = /\b(skills|tools|technologies|competencies)\b/.test(lower);
  const hasTableLike = /\|/.test(cvText) || /\t/.test(cvText);
  const hasIconContact = /[\u260e\u2709\ud83d\udcde\ud83d\udce7\ud83d\udccd]/u.test(cvText);

  return [
    {
      label: "Contact parsing",
      value: hasEmail || hasPhone ? "Readable contact fields" : "Contact fields may be missing",
      level: hasEmail || hasPhone ? "good" : "warning",
    },
    {
      label: "Standard headings",
      value:
        hasExperience && hasEducation && hasSkills
          ? "Experience, Education, and Skills detected"
          : "One or more standard headings are weak",
      level: hasExperience && hasEducation && hasSkills ? "good" : "warning",
    },
    {
      label: "Layout complexity",
      value: hasTableLike ? "Table-like structure detected" : "Plain text structure",
      level: hasTableLike ? "danger" : "good",
    },
    {
      label: "Icon dependency",
      value: hasIconContact ? "Contact icons detected" : "No icon-only contact labels",
      level: hasIconContact ? "warning" : "good",
    },
  ];
}

function buildAtsRisks(cvText: string, signals: ParserSignal[]): AtsRisk[] {
  const risks: AtsRisk[] = signals
    .filter((signal) => signal.level !== "good")
    .map((signal) => ({
      area: signal.label,
      level: signal.level,
      issue: signal.value,
      fix:
        signal.label === "Layout complexity"
          ? "Use a single-column layout and avoid tables for the ATS export."
          : "Use explicit text labels and standard section headings.",
    }));

  if (cvText.length < 1200) {
    risks.push({
      area: "Content depth",
      level: "warning",
      issue: "CV text looks short for a full profile.",
      fix: "Add role bullets with scope, tools, stakeholders, and outcomes.",
    });
  }

  return risks.length
    ? risks
    : [
        {
          area: "ATS format",
          level: "good",
          issue: "No obvious text-formatting risks detected.",
          fix: "Keep the export simple: standard headings, readable dates, no images for text.",
        },
      ];
}

function buildLayers(
  cv: string,
  job: JobProfile,
  coverage: KeywordCoverage,
  evidenceMap: EvidenceItem[],
): TailoredLayer[] {
  const summary = extractSection(cv, ["summary", "profile", "objective"]);
  const experience = extractSection(cv, [
    "experience",
    "employment",
    "work history",
  ]);
  const skills = extractSection(cv, ["skills", "tools", "technologies"]);
  const education = extractSection(cv, ["education", "certifications"]);
  const strongestKeywords = [...coverage.matched, ...coverage.weak].slice(0, 8);
  const evidence = evidenceMap
    .filter((item) => item.evidence)
    .slice(0, 5)
    .map((item) => item.evidence);

  const headline = job.title;
  const summarySuggestion = [
    `ATS-focused ${job.title.toLowerCase()} profile with evidence in ${strongestKeywords.slice(0, 3).join(", ") || "the target role requirements"}.`,
    evidence[0]
      ? `Strongest current proof: ${trimSentence(evidence[0])}`
      : "Review the gaps before adding new claims.",
  ].join(" ");

  const experienceSuggestion = evidence.length
    ? evidence
        .map((item) => {
          const keyword = strongestKeywords.find((term) =>
            item.toLowerCase().includes(term),
          );
          return `- Reframe around ${keyword ?? "job relevance"}: ${trimSentence(item)}`;
        })
        .join("\n")
    : "- Add role bullets only after confirming matching experience.";

  const skillSuggestion = [
    ...new Set([...coverage.matched, ...coverage.weak, ...job.tools]),
  ]
    .slice(0, 18)
    .join(" | ");

  return [
    {
      id: "headline",
      label: "Professional headline",
      segment: "headline",
      original: firstNonEmptyLine(cv),
      suggested: headline,
      rationale: "Mirrors the target role while staying editable.",
      evidence: [],
      confidence: "medium",
      keywords: strongestKeywords.slice(0, 5),
      status: "needs_review",
    },
    {
      id: "summary",
      label: "Summary",
      segment: "summary",
      original: summary,
      suggested: summarySuggestion,
      rationale: "Prioritizes job overlap and keeps unsupported claims out.",
      evidence,
      confidence: evidence.length ? "medium" : "low",
      keywords: strongestKeywords.slice(0, 8),
      status: evidence.length ? "needs_review" : "blocked",
    },
    {
      id: "experience",
      label: "Experience bullets",
      segment: "experience",
      original: experience,
      suggested: experienceSuggestion,
      rationale: "Turns existing CV evidence into job-language bullets.",
      evidence,
      confidence: evidence.length > 2 ? "medium" : "low",
      keywords: strongestKeywords.slice(0, 8),
      status: evidence.length ? "needs_review" : "blocked",
    },
    {
      id: "skills",
      label: "Skills",
      segment: "skills",
      original: skills,
      suggested: skillSuggestion || "Add verified skills here.",
      rationale: "Keeps skills aligned with detected CV and job overlap.",
      evidence: coverage.matched,
      confidence: coverage.matched.length > 4 ? "high" : "medium",
      keywords: strongestKeywords,
      status: "ready",
    },
    {
      id: "education",
      label: "Education and certifications",
      segment: "education",
      original: education,
      suggested: education || "Keep education/certifications in a standard ATS-readable section.",
      rationale: "Preserves factual credentials without inventing new ones.",
      evidence: education ? [education] : [],
      confidence: education ? "high" : "low",
      keywords: [],
      status: education ? "ready" : "needs_review",
    },
  ];
}

function extractSection(cv: string, aliases: string[]) {
  const lines = cv.split("\n");
  const headingIndex = lines.findIndex((line) => {
    const normalized = line.trim().toLowerCase().replace(/:$/, "");
    return aliases.some((alias) => normalized === alias);
  });

  if (headingIndex === -1) return "";

  const body: string[] = [];
  for (let i = headingIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^[A-Z][A-Z /&-]{2,}:?$/.test(line.trim()) && body.length) break;
    body.push(line);
  }

  return body.join("\n").trim();
}

function firstNonEmptyLine(text: string) {
  return text.split("\n").find((line) => line.trim())?.trim() ?? "";
}

function trimSentence(sentence: string) {
  return sentence.replace(/\s+/g, " ").replace(/^[-*]\s*/, "").trim();
}

function buildGaps(missing: string[]): GapItem[] {
  return missing.slice(0, 8).map((requirement) => ({
    requirement,
    reason: `No reliable evidence for "${requirement}" was found in the pasted CV.`,
    userAction: `Only add "${requirement}" if you can point to real experience, training, or a project.`,
  }));
}

function composeDraft(layers: TailoredLayer[]) {
  return layers
    .map((layer) => `${layer.label}\n${layer.suggested}`.trim())
    .join("\n\n");
}
