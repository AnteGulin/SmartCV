export type AnalyzerMode = "local" | "openai";

export type RequirementCategory =
  | "must_have"
  | "nice_to_have"
  | "responsibility"
  | "tool"
  | "domain"
  | "soft_skill"
  | "hard_blocker";

export type EvidenceStatus =
  | "supported"
  | "weak"
  | "missing"
  | "blocked";

export type MatchType =
  | "exact"
  | "phrase"
  | "synonym"
  | "semantic"
  | "inferred";

export type EvidenceStrength = "strong" | "medium" | "weak";

export type AtsSeverity = "info" | "warning" | "critical";

export type AnalyzeRequest = {
  cvText: string;
  jobText: string;
  jobUrl?: string;
  forceLocal?: boolean;
};

export interface SectionText {
  label: string;
  text: string;
}

export interface TextAnchor {
  document: "cv" | "job";
  section?: string;
  snippet: string;
  start: number;
  end: number;
}

export interface CandidateFact {
  id: string;
  sourceSection: string;
  text: string;
  role?: string;
  company?: string;
  dateRange?: string;
  skills: string[];
  tools: string[];
  metrics: string[];
  confidence: number;
  anchors: TextAnchor[];
}

export interface EvidenceMatch {
  id: string;
  requirementId: string;
  factId: string;
  matchedText: string;
  matchType: MatchType;
  strength: EvidenceStrength;
  score: number;
  explanation: string;
  anchors: TextAnchor[];
}

export interface JobRequirement {
  id: string;
  text: string;
  category: RequirementCategory;
  importance: 1 | 2 | 3 | 4 | 5;
  keywords: string[];
  normalizedKeywords: string[];
  matchedEvidence: EvidenceMatch[];
  evidenceStatus: EvidenceStatus;
  confidenceReason: string;
  sourceSection?: string;
  anchors: TextAnchor[];
}

export interface ATSHygieneWarning {
  id: string;
  severity: AtsSeverity;
  category: string;
  message: string;
  recommendation: string;
}

export interface Scoring {
  atsParseScore: number;
  jobMatchScore: number;
  evidenceConfidenceScore: number;
  overallReadinessScore: number;
  breakdown: {
    supportedWeight: number;
    weakWeight: number;
    missingWeight: number;
    blockedWeight: number;
    atsPenalty: number;
  };
}

export interface RequirementHint {
  text: string;
  sourceSection?: string;
  anchorSnippet: string;
}

export interface OpenAIAssistResult {
  model: string;
  title?: string;
  requirements: RequirementHint[];
  warnings: string[];
}

export interface GroundedRequirementHint {
  text: string;
  sourceSection?: string;
  anchors: TextAnchor[];
}

export interface GroundedOpenAIAssist {
  title?: string;
  requirements: GroundedRequirementHint[];
  warnings: string[];
}

export interface Phase1AnalysisResult {
  meta: {
    version: "phase1.v1";
    mode: AnalyzerMode;
    model: string;
    generatedAt: string;
    warnings: string[];
  };
  cv: {
    rawTextLength: number;
    sections: SectionText[];
    facts: CandidateFact[];
  };
  job: {
    sourceUrl?: string;
    title: string;
    requirements: JobRequirement[];
  };
  matching: {
    supportedCount: number;
    weakCount: number;
    missingCount: number;
    blockedCount: number;
  };
  ats: {
    warnings: ATSHygieneWarning[];
  };
  scoring: Scoring;
}
