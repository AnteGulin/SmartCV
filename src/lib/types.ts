export type AnalyzerMode = "local" | "openai";

export type Confidence = "high" | "medium" | "low";

export type RiskLevel = "good" | "warning" | "danger";

export type LayerStatus = "ready" | "needs_review" | "blocked";

export type LayerSegment =
  | "headline"
  | "summary"
  | "experience"
  | "skills"
  | "education"
  | "format";

export type AnalyzeRequest = {
  cvText: string;
  jobText: string;
  jobUrl?: string;
  forceLocal?: boolean;
};

export type JobProfile = {
  title: string;
  seniority: string;
  requiredSkills: string[];
  preferredSkills: string[];
  responsibilities: string[];
  tools: string[];
  keywords: string[];
};

export type ParserSignal = {
  label: string;
  value: string;
  level: RiskLevel;
};

export type KeywordCoverage = {
  matched: string[];
  weak: string[];
  missing: string[];
};

export type EvidenceItem = {
  requirement: string;
  evidence: string;
  confidence: Confidence;
  action: "rewrite" | "keep" | "user_confirm";
};

export type TailoredLayer = {
  id: string;
  label: string;
  segment: LayerSegment;
  original: string;
  suggested: string;
  rationale: string;
  evidence: string[];
  confidence: Confidence;
  keywords: string[];
  status: LayerStatus;
};

export type GapItem = {
  requirement: string;
  reason: string;
  userAction: string;
};

export type AtsRisk = {
  area: string;
  level: RiskLevel;
  issue: string;
  fix: string;
};

export type AnalysisResult = {
  meta: {
    mode: AnalyzerMode;
    model: string;
    generatedAt: string;
    warning: string;
  };
  parser: {
    readiness: number;
    signals: ParserSignal[];
  };
  job: JobProfile;
  keywordCoverage: KeywordCoverage;
  evidenceMap: EvidenceItem[];
  layers: TailoredLayer[];
  gaps: GapItem[];
  atsRisks: AtsRisk[];
  finalDraft: string;
};
