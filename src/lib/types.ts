export type AnalyzerMode = "local" | "openai";
export type EvidenceSource = "cv" | "user_confirmed";

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
export type UserEvidenceType =
  | "experience"
  | "skill"
  | "tool"
  | "certification"
  | "education"
  | "language"
  | "work_authorization"
  | "location"
  | "availability"
  | "other";

export type AnalyzeRequest = {
  cvText: string;
  jobText: string;
  jobUrl?: string;
  forceLocal?: boolean;
  confirmedEvidence?: UserConfirmedEvidence[];
};

export type TailorRequest = AnalyzeRequest;

export interface SectionText {
  label: string;
  text: string;
}

export interface TextAnchor {
  document: "cv" | "job" | "user";
  section?: string;
  snippet: string;
  start: number;
  end: number;
}

export interface UserConfirmedEvidence {
  id: string;
  requirementId?: string;
  requirementText: string;
  requirementFingerprint: string;
  evidenceType: UserEvidenceType;
  text: string;
  createdAt: string;
  updatedAt?: string;
}

export interface CandidateFact {
  id: string;
  source: EvidenceSource;
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
  requirementFingerprint?: string;
  userEvidenceType?: UserEvidenceType;
}

export interface EvidenceMatch {
  id: string;
  requirementId: string;
  factId: string;
  evidenceSource: EvidenceSource;
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
  fingerprint: string;
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
    totalRequirementWeight: number;
    supportedWeight: number;
    weakWeight: number;
    missingWeight: number;
    blockedWeight: number;
    blockedHardBlockerPenalty: number;
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

export type DraftItemType =
  | "header_line"
  | "summary_bullet"
  | "skills_line"
  | "experience_bullet"
  | "project_bullet"
  | "credential_line"
  | "language_line"
  | "review_note";

export type DraftItemReviewState = "ready" | "needs_review" | "dropped";

export type DraftSourceLabel =
  | "cv_only"
  | "user_confirmed_only"
  | "mixed"
  | "passthrough";

export type DraftStatus = "ready" | "needs_review" | "blocked";

export interface DraftValidationIssue {
  id: string;
  itemId?: string;
  severity: "info" | "warning" | "critical";
  category:
    | "unsupported_claim"
    | "missing_requirement_support"
    | "blocked_requirement"
    | "unverified_metric"
    | "unverified_years"
    | "user_confirmed_only"
    | "missing_anchor"
    | "copy_excluded";
  message: string;
  recommendation: string;
}

export interface TailoredDraftItem {
  id: string;
  type: DraftItemType;
  text: string;
  evidenceIds: string[];
  requirementIds: string[];
  sourceLabel: DraftSourceLabel;
  reviewState: DraftItemReviewState;
  warnings: DraftValidationIssue[];
}

export interface TailoredDraftSection {
  id:
    | "header"
    | "summary"
    | "skills"
    | "experience"
    | "projects"
    | "education"
    | "certifications"
    | "languages"
    | "review_notes";
  title: string;
  items: TailoredDraftItem[];
}

export interface TailoredDraftResult {
  meta: {
    version: "phase3.v1";
    generatedAt: string;
    mode: "local";
    warnings: string[];
  };
  analysis: Phase1AnalysisResult;
  draft: {
    status: DraftStatus;
    sections: TailoredDraftSection[];
    copyText: string;
  };
  validation: {
    issues: DraftValidationIssue[];
    blockedRequirementIds: string[];
    missingHighImportanceRequirementIds: string[];
    userConfirmedOnlyItemCount: number;
    droppedItemCount: number;
  };
}
