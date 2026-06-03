"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Clipboard,
  Columns3,
  FileSearch,
  FileText,
  Gauge,
  Layers3,
  Link,
  Loader2,
  Pencil,
  Search,
  ShieldCheck,
  Upload,
  Wand2,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AtsHygienePanel } from "@/components/ats-hygiene-panel";
import { ExportPanel } from "@/components/export-panel";
import { TailoredDraftPanel } from "@/components/tailored-draft-panel";
import {
  TailoredSectionWorkspace,
  type TailoredWorkspaceSection,
} from "@/components/tailored-section-workspace";
import {
  isPhase1AnalysisResult,
  isTailoredDraftResult,
} from "@/lib/analysis-validation";
import { splitTextIntoSections } from "@/lib/analysis-utils";
import {
  buildTailoredSectionOverridesFromDraft,
  buildDraftPolishSignature,
  buildTailorInputSignature,
} from "@/lib/draft-composer";
import {
  buildExportPreview,
  buildExportPreviewSignature,
  collectValidatedExportPolishedItems,
} from "@/lib/export-model";
import { validateExportPreview } from "@/lib/export-validation";
import {
  applyTailoredSectionOverrides,
  getEligibleDraftPolishItemIds,
} from "@/lib/draft-validation";
import {
  CONFIRMED_EVIDENCE_STORAGE_KEY,
  sanitizeUserConfirmedEvidence,
} from "@/lib/user-evidence";
import type {
  ExportFormat,
  ExportPreview,
  ExportValidationResult,
  EditableTailoredSectionId,
  Phase1AnalysisResult,
  RegenerateSectionResponse,
  SectionText,
  TailoredDraftResult,
  TailoredSectionOverride,
  UserConfirmedEvidence,
} from "@/lib/types";

type CvEditorMode = "sections" | "full";

type StoredWorkspace = {
  cvText: string;
  jobText: string;
  jobUrl: string;
  forceLocal: boolean;
  parsedCvSections: SectionText[];
  cvFileName: string;
  cvEditorMode: CvEditorMode;
  result: Phase1AnalysisResult | null;
  tailoredDraft: TailoredDraftResult | null;
  tailoredSectionOverrides?: TailoredSectionOverride[];
  tailoredDraftSignature: string | null;
  tailoredDraftPolishSignature: string | null;
  exportPreviewOpen?: boolean;
  exportFormatPreference?: ExportFormat;
  exportBlockedAckSignature?: string | null;
  savedAt: string;
};

const storageKey = "smartcv.workspace.v1";
const WORKSPACE_SAVE_DEBOUNCE_MS = 300;
const CONFIRMED_EVIDENCE_SAVE_DEBOUNCE_MS = 200;

const sampleCv = `Alex Morgan
Technical Support Specialist
Brussels, Belgium | alex@example.com | +32 400 000 000

Summary
Technical support specialist with experience resolving customer issues, coordinating with product teams, and documenting recurring problems for SaaS users.

Experience
Senior Solution Support Engineer
Mediagenix | 2021 - Present
- Investigated customer issues across production workflows and coordinated fixes with engineering teams.
- Reproduced defects, analyzed logs, and documented steps for product and development teams.
- Supported customers during incidents and helped prioritize urgent cases.
- Created knowledge base notes for recurring support issues.

Customer Support Agent
Example Telecom | 2018 - 2021
- Managed customer tickets across phone, email, and chat channels.
- Explained technical issues to non-technical customers and escalated complex cases.

Skills
Technical troubleshooting, customer support, SaaS, incident handling, Jira, SQL basics, documentation, stakeholder communication

Education
Bachelor in Business Informatics`;

const sampleJob = `Technical Customer Support Analyst

We are looking for a customer-focused Technical Customer Support Analyst to troubleshoot SaaS platform issues, manage incidents, and work with engineering teams.

Responsibilities
- Investigate technical support tickets and reproduce customer-reported issues.
- Analyze logs, workflows, and configuration to identify root causes.
- Communicate with customers and internal stakeholders during incidents.
- Maintain knowledge base documentation and help improve support processes.

Required skills
- Technical troubleshooting in a SaaS environment
- Incident management and SLA-driven support
- Strong customer communication
- Jira or similar ticketing tools
- Basic SQL or API troubleshooting experience

Preferred skills
- Experience working with product or engineering teams
- Comfort documenting workflows and recurring issues`;

export function SmartCvApp() {
  const [cvText, setCvText] = useState(sampleCv);
  const [jobText, setJobText] = useState(sampleJob);
  const [jobUrl, setJobUrl] = useState("");
  const [forceLocal, setForceLocal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetchingJob, setFetchingJob] = useState(false);
  const [parsingCv, setParsingCv] = useState(false);
  const [error, setError] = useState("");
  const [cvFileName, setCvFileName] = useState("");
  const [cvPreviewImage, setCvPreviewImage] = useState("");
  const [cvEditorMode, setCvEditorMode] = useState<CvEditorMode>("sections");
  const [parsedCvSections, setParsedCvSections] = useState<SectionText[]>(
    () => splitTextIntoSections(sampleCv, "cv"),
  );
  const [result, setResult] = useState<Phase1AnalysisResult | null>(null);
  const [tailoredDraft, setTailoredDraft] = useState<TailoredDraftResult | null>(null);
  const [tailoredDraftSignature, setTailoredDraftSignature] = useState<string | null>(
    null,
  );
  const [tailoredDraftPolishSignature, setTailoredDraftPolishSignature] =
    useState<string | null>(null);
  const [tailoredSectionOverrides, setTailoredSectionOverrides] = useState<
    TailoredSectionOverride[]
  >([]);
  const [confirmedEvidence, setConfirmedEvidence] = useState<UserConfirmedEvidence[]>([]);
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftError, setDraftError] = useState("");
  const [regeneratingSectionId, setRegeneratingSectionId] =
    useState<EditableTailoredSectionId | null>(null);
  const [sectionWarnings, setSectionWarnings] = useState<
    Partial<Record<EditableTailoredSectionId, string>>
  >({});
  const [exportPreviewOpen, setExportPreviewOpen] = useState(true);
  const [exportFormatPreference, setExportFormatPreference] =
    useState<ExportFormat | null>(null);
  const [exportBlockedAckSignature, setExportBlockedAckSignature] = useState<
    string | null
  >(null);
  const [copiedDraft, setCopiedDraft] = useState(false);
  const [docxExportLoading, setDocxExportLoading] = useState(false);
  const [exportError, setExportError] = useState("");
  const [hasHydrated, setHasHydrated] = useState(false);

  const canAnalyze = cvText.trim().length > 80 && jobText.trim().length > 80;
  const tailorInputSignature = useMemo(
    () => buildTailorInputSignature(cvText, jobText, confirmedEvidence),
    [confirmedEvidence, cvText, jobText],
  );

  const statusCounts = useMemo(() => {
    if (!result) {
      return {
        supported: 0,
        weak: 0,
        missing: 0,
        blocked: 0,
      };
    }

    return {
      supported: result.matching.supportedCount,
      weak: result.matching.weakCount,
      missing: result.matching.missingCount,
      blocked: result.matching.blockedCount,
    };
  }, [result]);

  const currentRequirementFingerprints = useMemo(
    () =>
      new Set(
        result?.job.requirements.map((requirement) => requirement.fingerprint) ?? [],
      ),
    [result],
  );

  const appliedConfirmationCount = useMemo(
    () =>
      result
        ? result.job.requirements.filter(
            (requirement) =>
              requirement.matchedEvidence[0]?.evidenceSource === "user_confirmed",
          ).length
        : 0,
    [result],
  );

  const staleConfirmationCount = useMemo(
    () =>
      confirmedEvidence.filter(
        (item) => !currentRequirementFingerprints.has(item.requirementFingerprint),
      ).length,
    [confirmedEvidence, currentRequirementFingerprints],
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const stored = window.localStorage.getItem(storageKey);
      const storedConfirmedEvidence = window.localStorage.getItem(
        CONFIRMED_EVIDENCE_STORAGE_KEY,
      );
      let nextConfirmedEvidence: UserConfirmedEvidence[] = [];

      if (storedConfirmedEvidence) {
        try {
          nextConfirmedEvidence = sanitizeUserConfirmedEvidence(
            JSON.parse(storedConfirmedEvidence),
          );
          setConfirmedEvidence(nextConfirmedEvidence);
        } catch {
          window.localStorage.removeItem(CONFIRMED_EVIDENCE_STORAGE_KEY);
        }
      }

      if (stored) {
        try {
          const workspace = JSON.parse(stored) as Partial<StoredWorkspace>;
          const nextCvText =
            typeof workspace.cvText === "string" ? workspace.cvText : sampleCv;
          const nextJobText =
            typeof workspace.jobText === "string" ? workspace.jobText : sampleJob;
          const nextDraftSignature = buildTailorInputSignature(
            nextCvText,
            nextJobText,
            nextConfirmedEvidence,
          );

          setCvText(nextCvText);
          setJobText(nextJobText);
          setJobUrl(typeof workspace.jobUrl === "string" ? workspace.jobUrl : "");
          setForceLocal(Boolean(workspace.forceLocal));
          setCvFileName(
            typeof workspace.cvFileName === "string" ? workspace.cvFileName : "",
          );
          setCvEditorMode(
            isCvEditorMode(workspace.cvEditorMode)
              ? workspace.cvEditorMode
              : "sections",
          );
          setParsedCvSections(
            isSectionArray(workspace.parsedCvSections)
              ? workspace.parsedCvSections
              : splitTextIntoSections(
                  nextCvText,
                  "cv",
                ),
          );
          const storedTailoredDraft = isTailoredDraftResult(workspace.tailoredDraft)
            ? workspace.tailoredDraft
            : null;
          const expectedPolishSignature =
            storedTailoredDraft?.meta.polish?.attempted
              ? buildDraftPolishSignature(
                  nextDraftSignature,
                  getEligibleDraftPolishItemIds(storedTailoredDraft),
                  storedTailoredDraft.meta.polish.model,
                )
              : null;
          const nextTailoredDraft =
            storedTailoredDraft &&
            workspace.tailoredDraftSignature === nextDraftSignature &&
            (!storedTailoredDraft.meta.polish?.attempted ||
              workspace.tailoredDraftPolishSignature === expectedPolishSignature)
              ? storedTailoredDraft
              : null;
          setResult(
            nextTailoredDraft?.analysis ??
              (isPhase1AnalysisResult(workspace.result) ? workspace.result : null),
          );
          setTailoredDraft(nextTailoredDraft);
          setTailoredSectionOverrides(
            nextTailoredDraft && isTailoredSectionOverrideArray(workspace.tailoredSectionOverrides)
              ? workspace.tailoredSectionOverrides
              : nextTailoredDraft
                ? buildTailoredSectionOverridesFromDraft(
                    isSectionArray(workspace.parsedCvSections)
                      ? workspace.parsedCvSections
                      : splitTextIntoSections(nextCvText, "cv"),
                    nextTailoredDraft.draft.sections,
                  )
                : [],
          );
          setTailoredDraftSignature(nextTailoredDraft ? nextDraftSignature : null);
          setTailoredDraftPolishSignature(
            nextTailoredDraft?.meta.polish?.attempted
              ? expectedPolishSignature
              : null,
          );
          setExportPreviewOpen(
            typeof workspace.exportPreviewOpen === "boolean"
              ? workspace.exportPreviewOpen
              : true,
          );
          setExportFormatPreference(
            isExportFormat(workspace.exportFormatPreference)
              ? workspace.exportFormatPreference
              : null,
          );
          setExportBlockedAckSignature(
            typeof workspace.exportBlockedAckSignature === "string"
              ? workspace.exportBlockedAckSignature
              : null,
          );
        } catch {
          window.localStorage.removeItem(storageKey);
        }
      }

      setHasHydrated(true);
    }, 0);

    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!hasHydrated) return;

    const workspace: StoredWorkspace = {
      cvText,
      jobText,
      jobUrl,
      forceLocal,
      parsedCvSections,
      cvFileName,
      cvEditorMode,
      result,
      tailoredDraft,
      tailoredSectionOverrides,
      tailoredDraftSignature,
      tailoredDraftPolishSignature,
      exportPreviewOpen,
      exportFormatPreference: exportFormatPreference ?? undefined,
      exportBlockedAckSignature,
      savedAt: new Date().toISOString(),
    };

    const timeout = window.setTimeout(() => {
      window.localStorage.setItem(storageKey, JSON.stringify(workspace));
    }, WORKSPACE_SAVE_DEBOUNCE_MS);

    return () => window.clearTimeout(timeout);
  }, [
    cvEditorMode,
    cvFileName,
    cvText,
    exportBlockedAckSignature,
    exportFormatPreference,
    exportPreviewOpen,
    forceLocal,
    hasHydrated,
    jobText,
    jobUrl,
    parsedCvSections,
    result,
    tailoredDraft,
    tailoredDraftPolishSignature,
    tailoredDraftSignature,
    tailoredSectionOverrides,
  ]);

  useEffect(() => {
    if (!hasHydrated) return;

    const timeout = window.setTimeout(() => {
      window.localStorage.setItem(
        CONFIRMED_EVIDENCE_STORAGE_KEY,
        JSON.stringify(confirmedEvidence),
      );
    }, CONFIRMED_EVIDENCE_SAVE_DEBOUNCE_MS);

    return () => window.clearTimeout(timeout);
  }, [confirmedEvidence, hasHydrated]);

  function invalidateTailoredDraft() {
    setTailoredDraft(null);
    setTailoredDraftSignature(null);
    setTailoredDraftPolishSignature(null);
    setTailoredSectionOverrides([]);
    setRegeneratingSectionId(null);
    setSectionWarnings({});
    setExportBlockedAckSignature(null);
    setCopiedDraft(false);
    setDraftError("");
    setExportError("");
    setDocxExportLoading(false);
  }

  async function fetchJobText() {
    if (!jobUrl.trim()) return;
    setError("");
    setFetchingJob(true);

    try {
      const response = await fetch("/api/fetch-job", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: jobUrl }),
      });
      const payload = (await response.json()) as { error?: string; text?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Job fetch failed.");
      }
      setJobText(payload.text || "");
      setResult(null);
      invalidateTailoredDraft();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Job fetch failed.");
    } finally {
      setFetchingJob(false);
    }
  }

  async function parseCvPdf(file: File | null) {
    if (!file) return;

    setError("");
    setParsingCv(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/parse-cv", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as {
        error?: string;
        fileName?: string;
        text?: string;
        previewImage?: string;
        sections?: SectionText[];
      };
      if (!response.ok) {
        throw new Error(payload.error || "PDF parsing failed.");
      }

      const nextCvText = payload.text || "";

      setCvText(nextCvText);
      setCvFileName(payload.fileName || file.name);
      setCvPreviewImage(payload.previewImage || "");
      setCvEditorMode("sections");
      setParsedCvSections(
        isSectionArray(payload.sections) && payload.sections.length
          ? payload.sections
          : splitTextIntoSections(nextCvText, "cv"),
      );
      setResult(null);
      invalidateTailoredDraft();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not read the PDF CV.",
      );
    } finally {
      setParsingCv(false);
    }
  }

  async function analyze() {
    if (!canAnalyze) {
      setError("Paste enough CV and job text before analyzing.");
      return;
    }

    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          cvText,
          jobText,
          jobUrl,
          forceLocal,
          confirmedEvidence,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Analysis failed.");
      }
      if (!isPhase1AnalysisResult(payload)) {
        throw new Error("Analysis response did not match the Phase 1 schema.");
      }

      setResult(payload);
      invalidateTailoredDraft();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Analysis failed.");
    } finally {
      setLoading(false);
    }
  }

  function loadSample() {
    setCvText(sampleCv);
    setJobText(sampleJob);
    setJobUrl("");
    setCvFileName("");
    setCvPreviewImage("");
    setCvEditorMode("sections");
    setParsedCvSections(splitTextIntoSections(sampleCv, "cv"));
    setResult(null);
    invalidateTailoredDraft();
    setError("");
  }

  function clearInputs() {
    window.localStorage.removeItem(storageKey);
    window.localStorage.removeItem(CONFIRMED_EVIDENCE_STORAGE_KEY);
    setCvText("");
    setJobText("");
    setJobUrl("");
    setCvFileName("");
    setCvPreviewImage("");
    setCvEditorMode("sections");
    setParsedCvSections([]);
    setResult(null);
    invalidateTailoredDraft();
    setConfirmedEvidence([]);
    setExportPreviewOpen(true);
    setExportFormatPreference(null);
    setExportBlockedAckSignature(null);
    setError("");
  }

  function updateFullCv(value: string) {
    setCvText(value);
    setParsedCvSections(splitTextIntoSections(value, "cv"));
    setResult(null);
    invalidateTailoredDraft();
  }

  function updateCvSection(index: number, value: string) {
    const nextSections = parsedCvSections.map((section, sectionIndex) =>
      sectionIndex === index ? { ...section, text: value } : section,
    );
    setParsedCvSections(nextSections);
    setCvText(composeCvSections(nextSections));
    setResult(null);
    invalidateTailoredDraft();
  }

  const cvSectionLabels = result
    ? [...new Set(result.cv.sections.map((section) => section.label))].slice(0, 6)
    : [];
  const cvFactCount = result
    ? result.cv.facts.filter((fact) => fact.source === "cv").length
    : 0;
  const userFactCount = result
    ? result.cv.facts.filter((fact) => fact.source === "user_confirmed").length
    : 0;
  const workingTailoredDraft = useMemo<TailoredDraftResult | null>(
    () =>
      tailoredDraft
        ? applyTailoredSectionOverrides(
            tailoredDraft,
            parsedCvSections,
            tailoredSectionOverrides,
          )
        : null,
    [parsedCvSections, tailoredDraft, tailoredSectionOverrides],
  );
  const readyDraftItemCount = workingTailoredDraft
    ? workingTailoredDraft.draft.sections
        .flatMap((section) => section.items)
        .filter(
          (item) =>
            item.reviewState === "ready" && item.type !== "review_note",
        ).length
    : 0;
  const eligiblePolishCount = workingTailoredDraft
    ? getEligibleDraftPolishItemIds(workingTailoredDraft).length
    : 0;
  const polishedDraftItemCount = workingTailoredDraft?.meta.polish?.polishedCount ?? 0;
  const exportPreview = useMemo<ExportPreview | null>(
    () => (workingTailoredDraft ? buildExportPreview(workingTailoredDraft) : null),
    [workingTailoredDraft],
  );
  const exportPreviewSignature = useMemo(
    () =>
      workingTailoredDraft && exportPreview
        ? buildExportPreviewSignature(workingTailoredDraft, exportPreview)
        : null,
    [exportPreview, workingTailoredDraft],
  );
  const hasBlockedExportAcknowledgement = Boolean(
    exportPreviewSignature &&
      exportBlockedAckSignature &&
      exportBlockedAckSignature === exportPreviewSignature,
  );
  const requiresBlockedDraftAcknowledgement =
    exportPreview?.requiresBlockedAcknowledgement ?? false;
  const exportValidation = useMemo<ExportValidationResult | null>(
    () =>
      workingTailoredDraft && exportPreview
        ? validateExportPreview(workingTailoredDraft, exportPreview, {
            acknowledgedBlockedDraft: hasBlockedExportAcknowledgement,
          })
        : null,
    [exportPreview, hasBlockedExportAcknowledgement, workingTailoredDraft],
  );
  const includedDraftItemCount = exportPreview?.includedItemCount ?? 0;
  const excludedDraftItemCount = exportPreview?.excludedItemCount ?? 0;
  const pendingRequirementCount = result
    ? result.job.requirements.filter(
        (requirement) => requirement.evidenceStatus !== "supported",
      ).length
    : 0;
  const improvementSuggestionCount =
    result?.improvements?.sectionGroups.reduce(
      (sum, group) => sum + group.suggestions.length,
      0,
    ) ?? 0;
  const improvementQuestionCount = result?.improvements?.questions.length ?? 0;

  async function generateTailoredDraft() {
    if (!canAnalyze) {
      setDraftError("Paste enough CV and job text before generating a tailored draft.");
      return;
    }

    setDraftError("");
    setDraftLoading(true);

    try {
      const response = await fetch("/api/tailor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          cvText,
          jobText,
          jobUrl,
          forceLocal,
          confirmedEvidence,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Tailored draft generation failed.");
      }

      if (!isTailoredDraftResult(payload)) {
        throw new Error("Tailored draft response did not match the Phase 3 schema.");
      }

      setResult(payload.analysis);
      setTailoredDraft(payload);
      setTailoredSectionOverrides(
        buildTailoredSectionOverridesFromDraft(parsedCvSections, payload.draft.sections),
      );
      setSectionWarnings({});
      setTailoredDraftSignature(tailorInputSignature);
      setTailoredDraftPolishSignature(null);
      setExportPreviewOpen(true);
      setExportBlockedAckSignature(null);
      setExportError("");
      setCopiedDraft(false);
    } catch (reason) {
      setDraftError(
        reason instanceof Error
          ? reason.message
          : "Tailored draft generation failed.",
      );
    } finally {
      setDraftLoading(false);
    }
  }

  async function copyValidatedDraft() {
    if (!workingTailoredDraft?.draft.copyText.trim()) {
      return;
    }

    if (requiresBlockedDraftAcknowledgement && !hasBlockedExportAcknowledgement) {
      setDraftError(
        "Acknowledge the blocked draft warning in Export preview before copying the validated draft.",
      );
      setExportPreviewOpen(true);
      return;
    }

    try {
      await navigator.clipboard.writeText(workingTailoredDraft.draft.copyText);
      setCopiedDraft(true);
      window.setTimeout(() => setCopiedDraft(false), 2000);
    } catch {
      setDraftError("Could not copy the validated draft to the clipboard.");
    }
  }

  function setBlockedExportAcknowledgement(checked: boolean) {
    setExportBlockedAckSignature(
      checked && exportPreviewSignature ? exportPreviewSignature : null,
    );
  }

  function ensureExportReady() {
    if (!workingTailoredDraft || !exportPreview || !exportValidation) {
      setExportError("Generate a tailored draft before exporting.");
      return null;
    }

    if (!exportValidation.canExport) {
      setExportError(
        exportValidation.issues.find((issue) => issue.severity === "critical")
          ?.message ?? "This draft is not ready to export yet.",
      );
      return null;
    }

    setExportError("");
    return { preview: exportPreview, validation: exportValidation };
  }

  async function downloadTxtExport() {
    const ready = ensureExportReady();

    if (!ready) {
      return;
    }

    const blob = new Blob([ready.preview.plainText], {
      type: "text/plain;charset=utf-8",
    });
    triggerBlobDownload(blob, `${ready.preview.fileNameStem}.txt`);
    setExportFormatPreference("txt");
  }

  async function downloadDocxExport() {
    const ready = ensureExportReady();

    if (!ready || !workingTailoredDraft) {
      return;
    }

    setDocxExportLoading(true);
    setExportError("");

    try {
      const response = await fetch("/api/export/docx", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          cvText,
          jobText,
          jobUrl,
          forceLocal,
          format: "docx",
          confirmedEvidence,
          acknowledgedBlockedDraft: hasBlockedExportAcknowledgement,
          polishedItems: collectValidatedExportPolishedItems(workingTailoredDraft),
          sectionOverrides: tailoredSectionOverrides,
        }),
      });

      if (!response.ok) {
        const contentType = response.headers.get("content-type") ?? "";

        if (contentType.includes("application/json")) {
          const payload = (await response.json()) as { error?: string };
          throw new Error(payload.error || "Could not export a DOCX right now.");
        }

        throw new Error("Could not export a DOCX right now.");
      }

      const blob = await response.blob();
      triggerBlobDownload(
        blob,
        getDownloadFileName(
          response.headers.get("content-disposition"),
          `${ready.preview.fileNameStem}.docx`,
        ),
      );
      setExportFormatPreference("docx");
    } catch (reason) {
      setExportError(
        reason instanceof Error ? reason.message : "Could not export a DOCX right now.",
      );
    } finally {
      setDocxExportLoading(false);
    }
  }

  function printExportPreview() {
    const ready = ensureExportReady();

    if (!ready) {
      return;
    }

    const runPrint = () => {
      const previousTitle = document.title;
      const nextTitle = ready.preview.fileNameStem;
      let restored = false;
      const restore = () => {
        if (restored) {
          return;
        }

        restored = true;
        document.title = previousTitle;
      };

      document.title = nextTitle;
      window.addEventListener("afterprint", restore, { once: true });
      window.setTimeout(restore, 1500);
      window.print();
    };

    setExportError("");
    setExportFormatPreference("pdf");

    if (!exportPreviewOpen) {
      setExportPreviewOpen(true);
      window.setTimeout(runPrint, 120);
      return;
    }

    runPrint();
  }

  const workspaceSections = useMemo<TailoredWorkspaceSection[]>(
    () =>
      buildWorkspaceSections(
        parsedCvSections,
        tailoredSectionOverrides,
        result,
        sectionWarnings,
      ),
    [parsedCvSections, result, sectionWarnings, tailoredSectionOverrides],
  );

  function updateTailoredSectionText(
    sectionId: EditableTailoredSectionId,
    value: string,
  ) {
    setTailoredSectionOverrides((current) =>
      upsertSectionOverride(current, sectionId, value),
    );
    setSectionWarnings((current) => {
      if (!current[sectionId]) {
        return current;
      }

      const next = { ...current };
      delete next[sectionId];
      return next;
    });
    setCopiedDraft(false);
    setExportBlockedAckSignature(null);
  }

  async function regenerateTailoredSection(sectionId: EditableTailoredSectionId) {
    if (!tailoredDraft) {
      setDraftError("Generate a tailored CV before regenerating one section.");
      return;
    }

    const targetSection = workspaceSections.find(
      (section) => section.sectionId === sectionId,
    );

    if (!targetSection) {
      return;
    }

    setDraftError("");
    setRegeneratingSectionId(sectionId);

    try {
      const response = await fetch("/api/regenerate-section", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          cvText,
          jobText,
          jobUrl,
          forceLocal,
          confirmedEvidence,
          sectionId,
          sectionLabel: targetSection.title,
          originalSectionText: targetSection.originalText,
          currentTailoredSectionText: targetSection.tailoredText,
        }),
      });
      const payload = (await response.json()) as
        | { error?: string }
        | RegenerateSectionResponse;

      if (!response.ok) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Could not regenerate that section right now.",
        );
      }

      if (!isRegenerateSectionResponse(payload)) {
        throw new Error("Section regeneration returned an unexpected response.");
      }

      setTailoredSectionOverrides((current) =>
        upsertSectionOverride(current, sectionId, payload.text),
      );
      setSectionWarnings((current) => ({
        ...current,
        [sectionId]: payload.warnings[0],
      }));
      setCopiedDraft(false);
      setExportBlockedAckSignature(null);
    } catch (reason) {
      setSectionWarnings((current) => ({
        ...current,
        [sectionId]:
          reason instanceof Error
            ? reason.message
            : "Could not regenerate that section right now.",
      }));
    } finally {
      setRegeneratingSectionId(null);
    }
  }

  return (
    <div className="min-h-screen bg-[#f5f7f4] text-zinc-950">
      <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/95 backdrop-blur">
        <div className="flex min-h-16 flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between lg:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-emerald-700 text-white">
              <Layers3 className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-base font-semibold leading-5">SmartCV</h1>
              <p className="text-sm text-zinc-500">
                Evidence-based CV matching without invented experience
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="mr-1 hidden items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800 sm:inline-flex">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              {hasHydrated ? "Saved in this browser" : "Auto-save loading"}
            </div>
            <button
              type="button"
              onClick={loadSample}
              title="Load sample CV and job"
              className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 text-sm font-medium hover:bg-zinc-50"
            >
              <Clipboard className="h-4 w-4" aria-hidden="true" />
              Sample
            </button>
            <button
              type="button"
              onClick={clearInputs}
              title="Clear all inputs"
              className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 text-sm font-medium hover:bg-zinc-50"
            >
              <XCircle className="h-4 w-4" aria-hidden="true" />
              Clear
            </button>
            <button
              type="button"
              onClick={analyze}
              disabled={loading || draftLoading || !canAnalyze}
              title="Analyze job requirements without generating the tailored CV yet"
              className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 text-sm font-medium hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Search className="h-4 w-4" aria-hidden="true" />
              )}
              Analyze only
            </button>
            <button
              type="button"
              onClick={generateTailoredDraft}
              disabled={draftLoading || loading || !canAnalyze}
              title="Analyze and generate tailored CV"
              className="inline-flex h-9 items-center gap-2 rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
            >
              {draftLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Wand2 className="h-4 w-4" aria-hidden="true" />
              )}
              {tailoredDraft ? "Refresh tailored CV" : "Generate tailored CV"}
            </button>
          </div>
        </div>
      </header>

      {error ? (
        <div className="sticky top-16 z-10 border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 shadow-sm">
          <div className="mx-auto flex max-w-[1800px] items-start justify-between gap-3">
            <div className="flex gap-2">
              <AlertTriangle
                className="mt-0.5 h-4 w-4 flex-none"
                aria-hidden="true"
              />
              <p>{error}</p>
            </div>
            <button
              type="button"
              onClick={() => setError("")}
              className="rounded px-2 text-sm font-medium hover:bg-red-100"
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      <main className="grid min-h-[calc(100vh-65px)] xl:grid-cols-[390px_minmax(0,1fr)_360px]">
        <aside className="border-b border-zinc-200 bg-white p-4 xl:border-b-0 xl:border-r xl:p-5">
          <div className="space-y-4 xl:sticky xl:top-20">
            <div>
              <label
                htmlFor="job-url"
                className="mb-2 block text-sm font-medium text-zinc-700"
              >
                Job URL
              </label>
              <div className="flex gap-2">
                <div className="relative min-w-0 flex-1">
                  <Link
                    className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-400"
                    aria-hidden="true"
                  />
                  <input
                    id="job-url"
                    value={jobUrl}
                    onChange={(event) => {
                      setJobUrl(event.target.value);
                      setResult(null);
                      invalidateTailoredDraft();
                    }}
                    placeholder="https://..."
                    className="h-9 w-full rounded-md border border-zinc-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-emerald-600"
                  />
                </div>
                <button
                  type="button"
                  onClick={fetchJobText}
                  disabled={fetchingJob || !jobUrl.trim()}
                  title="Fetch job text"
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 text-sm font-medium hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {fetchingJob ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Search className="h-4 w-4" aria-hidden="true" />
                  )}
                  Fetch
                </button>
              </div>
            </div>

            <TextPanel
              id="job-text"
              label="Job description"
              value={jobText}
              onChange={(value) => {
                setJobText(value);
                setResult(null);
                invalidateTailoredDraft();
              }}
              rows={11}
            />

            <CvUploadPanel
              fileName={cvFileName}
              parsing={parsingCv}
              sections={parsedCvSections}
              onFile={parseCvPdf}
            />

            <CvPreviewPanel
              fileName={cvFileName}
              previewImage={cvPreviewImage}
              hasCvText={cvText.trim().length > 0}
            />

            <label className="flex items-center justify-between gap-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">
              <span>
                <span className="block font-medium text-zinc-800">
                  Local analyzer
                </span>
                <span className="text-zinc-500">
                  Skip OpenAI assistance and use deterministic analysis only.
                </span>
              </span>
              <input
                type="checkbox"
                checked={forceLocal}
                onChange={(event) => {
                  setForceLocal(event.target.checked);
                  invalidateTailoredDraft();
                }}
                className="h-4 w-4 accent-emerald-700"
              />
            </label>

            <PrivacyDisclosure />
          </div>
        </aside>

        <section className="min-w-0 border-b border-zinc-200 p-4 xl:border-b-0 xl:border-r xl:p-5">
          <div className="space-y-4">
            {result?.meta.warnings.length ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
                <div className="mb-2 font-semibold">Analysis warnings</div>
                <ul className="space-y-1">
                  {result.meta.warnings.map((warning, index) => (
                    <li key={`${warning}-${index}`}>{warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {workingTailoredDraft ? (
              <>
                <TailoredDraftPanel
                  analysisReady={Boolean(result)}
                  copied={copiedDraft}
                  draftError={draftError}
                  draftLoading={draftLoading}
                  exportPanel={
                    exportPreview && exportValidation ? (
                      <ExportPanel
                        acknowledgedBlockedDraft={hasBlockedExportAcknowledgement}
                        docxLoading={docxExportLoading}
                        error={exportError}
                        formatPreference={exportFormatPreference}
                        isOpen={exportPreviewOpen}
                        onAcknowledgedBlockedDraftChange={
                          setBlockedExportAcknowledgement
                        }
                        onDownloadDocx={downloadDocxExport}
                        onDownloadTxt={downloadTxtExport}
                        onPrint={printExportPreview}
                        onToggleOpen={() =>
                          setExportPreviewOpen((current) => !current)
                        }
                        preview={exportPreview}
                        validation={exportValidation}
                      />
                    ) : null
                  }
                  onCopy={copyValidatedDraft}
                  onGenerate={generateTailoredDraft}
                  result={workingTailoredDraft}
                />
                <TailoredSectionWorkspace
                  sections={workspaceSections}
                  regeneratingSectionId={regeneratingSectionId}
                  onRegenerateSection={regenerateTailoredSection}
                  onSectionTextChange={updateTailoredSectionText}
                />
              </>
            ) : (
              <>
                {result ? (
                  <TailoredDraftPanel
                    analysisReady={Boolean(result)}
                    copied={copiedDraft}
                    draftError={draftError}
                    draftLoading={draftLoading}
                    onCopy={copyValidatedDraft}
                    onGenerate={generateTailoredDraft}
                    result={null}
                  />
                ) : null}
                <OriginalCvEditor
                  cvText={cvText}
                  mode={cvEditorMode}
                  sections={parsedCvSections}
                  onModeChange={setCvEditorMode}
                  onFullChange={updateFullCv}
                  onSectionChange={updateCvSection}
                />
              </>
            )}
          </div>
        </section>

        <aside className="bg-[#f5f7f4] p-4 xl:p-5">
          <div className="space-y-4 xl:sticky xl:top-20">
            {result ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <MetricCard
                    icon={<Gauge className="h-4 w-4" aria-hidden="true" />}
                    label="ATS Parse"
                    value={`${result.scoring.atsParseScore}%`}
                    tone={result.scoring.atsParseScore >= 80 ? "green" : "amber"}
                  />
                  <MetricCard
                    icon={<CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
                    label="Job Match"
                    value={`${result.scoring.jobMatchScore}%`}
                    tone={result.scoring.jobMatchScore >= 70 ? "green" : "amber"}
                  />
                  <MetricCard
                    icon={<ShieldCheck className="h-4 w-4" aria-hidden="true" />}
                    label="Evidence"
                    value={`${result.scoring.evidenceConfidenceScore}%`}
                    tone={
                      result.scoring.evidenceConfidenceScore >= 70 ? "green" : "amber"
                    }
                  />
                  <MetricCard
                    icon={<Layers3 className="h-4 w-4" aria-hidden="true" />}
                    label="Readiness"
                    value={`${result.scoring.overallReadinessScore}%`}
                    tone={
                      result.scoring.overallReadinessScore >= 70 ? "green" : "amber"
                    }
                  />
                </div>

                <SummaryCard title="CV facts">
                  <SummaryLine
                    label="Original CV facts"
                    value={String(cvFactCount)}
                  />
                  <SummaryLine
                    label="User-confirmed facts"
                    value={String(userFactCount)}
                  />
                  <SummaryLine
                    label="Main sections"
                    value={cvSectionLabels.join(", ") || "None"}
                  />
                </SummaryCard>

                <SummaryCard title="Job requirements">
                  <SummaryLine
                    label="Requirements"
                    value={String(result.job.requirements.length)}
                  />
                  <SummaryLine
                    label="Supported"
                    value={String(statusCounts.supported)}
                  />
                  <SummaryLine label="Weak" value={String(statusCounts.weak)} />
                  <SummaryLine
                    label="Missing"
                    value={String(statusCounts.missing)}
                  />
                  <SummaryLine
                    label="Blocked"
                    value={String(statusCounts.blocked)}
                  />
                </SummaryCard>

                <SummaryCard title="Tailoring plan">
                  <SummaryLine
                    label="Draft suggestions"
                    value={String(improvementSuggestionCount)}
                  />
                  <SummaryLine
                    label="Needs confirmation"
                    value={String(improvementQuestionCount)}
                  />
                  <SummaryLine
                    label="Pending requirements"
                    value={String(pendingRequirementCount)}
                  />
                </SummaryCard>

                <SummaryCard title="User confirmations">
                  <SummaryLine
                    label="Saved confirmations"
                    value={String(confirmedEvidence.length)}
                  />
                  <SummaryLine
                    label="Applied to this job"
                    value={String(appliedConfirmationCount)}
                  />
                  <SummaryLine
                    label="Unmatched to this job"
                    value={String(staleConfirmationCount)}
                  />
                </SummaryCard>

                {workingTailoredDraft ? (
                  <SummaryCard title="Tailored draft">
                    <SummaryLine
                      label="Status"
                      value={
                        workingTailoredDraft.draft.status === "needs_review"
                          ? "Needs review"
                          : workingTailoredDraft.draft.status
                              .charAt(0)
                              .toUpperCase() +
                            workingTailoredDraft.draft.status.slice(1)
                      }
                    />
                    <SummaryLine
                      label="Copy-ready items"
                      value={String(readyDraftItemCount)}
                    />
                    <SummaryLine
                      label="Included in copy"
                      value={String(includedDraftItemCount)}
                    />
                    <SummaryLine
                      label="Excluded"
                      value={String(excludedDraftItemCount)}
                    />
                    <SummaryLine
                      label="Polish-eligible"
                      value={String(eligiblePolishCount)}
                    />
                    <SummaryLine
                      label="Validated polish"
                      value={String(polishedDraftItemCount)}
                    />
                  </SummaryCard>
                ) : null}

                <SummaryCard title="Score breakdown">
                  <SummaryLine
                    label="Requirement weight"
                    value={String(result.scoring.breakdown.totalRequirementWeight)}
                  />
                  <SummaryLine
                    label="Supported weight"
                    value={String(result.scoring.breakdown.supportedWeight)}
                  />
                  <SummaryLine
                    label="Weak weight"
                    value={String(result.scoring.breakdown.weakWeight)}
                  />
                  <SummaryLine
                    label="Blocked penalty"
                    value={String(result.scoring.breakdown.blockedHardBlockerPenalty)}
                  />
                  <SummaryLine
                    label="ATS penalty"
                    value={String(result.scoring.breakdown.atsPenalty)}
                  />
                </SummaryCard>

                <AtsHygienePanel warnings={result.ats.warnings} />
              </>
            ) : (
              <>
                <RightStartPanel />
                <WorkspaceGuide />
              </>
            )}
          </div>
        </aside>
      </main>
    </div>
  );
}

function isCvEditorMode(value: unknown): value is CvEditorMode {
  return value === "sections" || value === "full";
}

function isExportFormat(value: unknown): value is ExportFormat {
  return value === "txt" || value === "docx" || value === "pdf";
}

function isSectionArray(value: unknown): value is SectionText[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        item &&
        typeof item === "object" &&
        typeof item.label === "string" &&
        typeof item.text === "string",
    )
  );
}

function triggerBlobDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function getDownloadFileName(contentDisposition: string | null, fallback: string) {
  if (!contentDisposition) {
    return fallback;
  }

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }

  const asciiMatch = contentDisposition.match(/filename=\"?([^\";]+)\"?/i);
  if (asciiMatch?.[1]) {
    return asciiMatch[1];
  }

  return fallback;
}

function composeCvSections(sections: SectionText[]) {
  return sections
    .map((section) => {
      if (section.label === "Header") return section.text.trim();
      return `${section.label}\n${section.text.trim()}`.trim();
    })
    .filter(Boolean)
    .join("\n\n");
}

function isTailoredSectionOverrideArray(
  value: unknown,
): value is TailoredSectionOverride[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        item &&
        typeof item === "object" &&
        isEditableSectionId(item.sectionId) &&
        typeof item.text === "string",
    )
  );
}

function isEditableSectionId(value: unknown): value is EditableTailoredSectionId {
  return (
    value === "header" ||
    value === "summary" ||
    value === "skills" ||
    value === "experience" ||
    value === "projects" ||
    value === "education" ||
    value === "certifications" ||
    value === "languages"
  );
}

function isRegenerateSectionResponse(
  value: unknown,
): value is RegenerateSectionResponse {
  return (
    value !== null &&
    typeof value === "object" &&
    isEditableSectionId((value as RegenerateSectionResponse).sectionId) &&
    typeof (value as RegenerateSectionResponse).sectionLabel === "string" &&
    typeof (value as RegenerateSectionResponse).text === "string" &&
    Array.isArray((value as RegenerateSectionResponse).warnings)
  );
}

function upsertSectionOverride(
  current: TailoredSectionOverride[],
  sectionId: EditableTailoredSectionId,
  value: string,
) {
  const text = value;
  const hasExisting = current.some((item) => item.sectionId === sectionId);

  if (hasExisting) {
    return current.map((item) =>
      item.sectionId === sectionId ? { ...item, text } : item,
    );
  }

  return [...current, { sectionId, text }];
}

function buildWorkspaceSections(
  originalSections: SectionText[],
  overrides: TailoredSectionOverride[],
  result: Phase1AnalysisResult | null,
  sectionWarnings: Partial<Record<EditableTailoredSectionId, string>>,
): TailoredWorkspaceSection[] {
  const overrideMap = new Map(overrides.map((override) => [override.sectionId, override.text]));
  const orderedSectionIds: EditableTailoredSectionId[] = [
    "header",
    "summary",
    "skills",
    "experience",
    "projects",
    "education",
    "certifications",
    "languages",
  ];

  return orderedSectionIds.reduce<TailoredWorkspaceSection[]>((sections, sectionId) => {
      const originalText = getOriginalSectionText(originalSections, sectionId);
      const hasOverride = overrideMap.has(sectionId);
      const tailoredText = hasOverride
        ? (overrideMap.get(sectionId) ?? "").trim()
        : originalText;

      if (!originalText.trim() && !tailoredText.trim()) {
        return sections;
      }

      sections.push({
        sectionId,
        title: getSectionTitle(sectionId),
        originalText,
        tailoredText,
        badges: result ? buildSectionBadges(result, sectionId) : [],
        warning: sectionWarnings[sectionId],
      });

      return sections;
    }, []);
}

function getOriginalSectionText(
  sections: SectionText[],
  sectionId: EditableTailoredSectionId,
) {
  const match = sections.find(
    (section) => mapSectionLabelToSectionId(section.label) === sectionId,
  );

  return match?.text.trim() ?? "";
}

function mapSectionLabelToSectionId(
  label: string,
): EditableTailoredSectionId | null {
  const normalized = label.trim().toLowerCase();

  if (normalized === "header") return "header";
  if (
    normalized === "summary" ||
    normalized === "profile" ||
    normalized === "professional summary" ||
    normalized === "objective"
  ) {
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
  if (normalized === "education") return "education";
  if (normalized === "certifications" || normalized === "licenses") {
    return "certifications";
  }
  if (normalized === "languages") return "languages";

  return null;
}

function getSectionTitle(sectionId: EditableTailoredSectionId) {
  const titles: Record<EditableTailoredSectionId, string> = {
    header: "Header",
    summary: "Summary",
    skills: "Skills",
    experience: "Experience",
    projects: "Projects",
    education: "Education",
    certifications: "Certifications",
    languages: "Languages",
  };

  return titles[sectionId];
}

function buildSectionBadges(
  result: Phase1AnalysisResult,
  sectionId: EditableTailoredSectionId,
) {
  const labels = new Set<string>();

  for (const requirement of result.job.requirements) {
    const targetsSection =
      requirement.matchedEvidence.some((match) =>
        doesSourceSectionMapToDraftSection(match.anchors[0]?.section, sectionId),
      ) ||
      requirement.matchedEvidence.some((match) =>
        doesSourceSectionMapToDraftSection(
          result.cv.facts.find((fact) => fact.id === match.factId)?.sourceSection,
          sectionId,
        ),
      );

    if (!targetsSection) {
      continue;
    }

    if (requirement.evidenceStatus === "missing") {
      labels.add("Missing");
    } else if (requirement.evidenceStatus === "weak") {
      labels.add("Weak");
    } else if (requirement.category === "must_have") {
      labels.add("Must-have");
    } else if (requirement.category === "tool") {
      labels.add("Tool");
    } else if (requirement.category === "domain") {
      labels.add("Domain");
    } else if (requirement.category === "soft_skill") {
      labels.add("Soft skill");
    } else if (requirement.category === "nice_to_have") {
      labels.add("Preferred");
    }

    if (labels.size >= 3) {
      break;
    }
  }

  return [...labels];
}

function doesSourceSectionMapToDraftSection(
  sourceSection: string | undefined,
  sectionId: EditableTailoredSectionId,
) {
  if (!sourceSection) {
    return false;
  }

  return mapSectionLabelToSectionId(sourceSection) === sectionId;
}

function CvUploadPanel({
  fileName,
  parsing,
  sections,
  onFile,
}: {
  fileName: string;
  parsing: boolean;
  sections: SectionText[];
  onFile: (file: File | null) => void;
}) {
  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-emerald-700" aria-hidden="true" />
          <h2 className="text-sm font-semibold">CV PDF reader</h2>
        </div>
        <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 text-sm font-medium hover:bg-zinc-50">
          {parsing ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Upload className="h-4 w-4" aria-hidden="true" />
          )}
          Upload
          <input
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            disabled={parsing}
            onChange={(event) => onFile(event.target.files?.[0] ?? null)}
          />
        </label>
      </div>

      <p className="text-sm leading-5 text-zinc-600">
        Upload an existing CV PDF and SmartCV will extract the text into the
        editable master CV field.
      </p>

      {fileName ? (
        <div className="mt-3 rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-800">
          Loaded: {fileName}
        </div>
      ) : null}

      {sections.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {sections.map((section) => (
            <span
              key={`${section.label}-${section.text.length}`}
              className="rounded bg-white px-2 py-1 text-xs text-zinc-600"
            >
              {section.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CvPreviewPanel({
  fileName,
  previewImage,
  hasCvText,
}: {
  fileName: string;
  previewImage: string;
  hasCvText: boolean;
}) {
  return (
    <div className="rounded-md border border-zinc-200 bg-white p-3">
      <div className="mb-3 flex items-center gap-2">
        <FileSearch className="h-4 w-4 text-emerald-700" aria-hidden="true" />
        <h2 className="text-sm font-semibold">CV preview</h2>
      </div>
      {previewImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={previewImage}
          alt={fileName ? `${fileName} preview` : "CV preview"}
          className="max-h-[520px] w-full rounded border border-zinc-200 object-contain"
        />
      ) : (
        <div className="flex min-h-72 flex-col items-center justify-center rounded border border-dashed border-zinc-300 bg-zinc-50 p-4 text-center">
          <FileText className="mb-3 h-8 w-8 text-zinc-400" aria-hidden="true" />
          <p className="text-sm font-medium text-zinc-700">
            {hasCvText ? "Text CV loaded" : "No CV preview yet"}
          </p>
          <p className="mt-1 text-sm leading-5 text-zinc-500">
            Upload a PDF to show the first page as an image preview.
          </p>
        </div>
      )}
    </div>
  );
}

function OriginalCvEditor({
  cvText,
  mode,
  sections,
  onModeChange,
  onFullChange,
  onSectionChange,
}: {
  cvText: string;
  mode: CvEditorMode;
  sections: SectionText[];
  onModeChange: (mode: CvEditorMode) => void;
  onFullChange: (value: string) => void;
  onSectionChange: (index: number, value: string) => void;
}) {
  const editableSections = sections.length ? sections : splitTextIntoSections(cvText, "cv");

  return (
    <div className="rounded-md border border-zinc-200 bg-white p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Master CV editor</h2>
          <p className="mt-1 text-sm leading-6 text-zinc-600">
            Keep the source CV clean and factual. Phase 1A uses this text as the
            evidence base for every job match.
          </p>
        </div>
        <div className="inline-flex rounded-md border border-zinc-200 bg-white p-1">
          <button
            type="button"
            onClick={() => onModeChange("sections")}
            className={`inline-flex h-8 items-center gap-2 rounded px-3 text-sm font-medium ${
              mode === "sections"
                ? "bg-zinc-950 text-white"
                : "text-zinc-600 hover:bg-zinc-50"
            }`}
          >
            <Columns3 className="h-4 w-4" aria-hidden="true" />
            Sections
          </button>
          <button
            type="button"
            onClick={() => onModeChange("full")}
            className={`inline-flex h-8 items-center gap-2 rounded px-3 text-sm font-medium ${
              mode === "full"
                ? "bg-zinc-950 text-white"
                : "text-zinc-600 hover:bg-zinc-50"
            }`}
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
            Full CV
          </button>
        </div>
      </div>

      {mode === "sections" ? (
        <div className="space-y-3">
          {editableSections.length ? (
            editableSections.map((section, index) => (
              <div
                key={`${section.label}-${index}`}
                className="rounded-md border border-zinc-200 bg-zinc-50 p-3"
              >
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label
                    htmlFor={`cv-section-${index}`}
                    className="text-sm font-semibold text-zinc-800"
                  >
                    {section.label}
                  </label>
                  <span className="text-xs text-zinc-400">
                    {section.text.length} chars
                  </span>
                </div>
                <textarea
                  id={`cv-section-${index}`}
                  value={section.text}
                  onChange={(event) =>
                    onSectionChange(index, event.target.value)
                  }
                  rows={Math.min(12, Math.max(4, section.text.split("\n").length + 1))}
                  className="w-full resize-y rounded-md border border-zinc-200 bg-white p-3 text-sm leading-6 outline-none focus:border-emerald-600"
                />
              </div>
            ))
          ) : (
            <div className="rounded-md border border-dashed border-zinc-300 bg-zinc-50 p-5 text-sm text-zinc-600">
              Upload a PDF or paste CV text in full mode to create editable
              sections.
            </div>
          )}
        </div>
      ) : (
        <textarea
          value={cvText}
          onChange={(event) => onFullChange(event.target.value)}
          rows={30}
          className="w-full resize-y rounded-md border border-zinc-200 bg-white p-4 font-mono text-sm leading-6 outline-none focus:border-emerald-600"
        />
      )}
    </div>
  );
}

function RightStartPanel() {
  return (
    <div className="rounded-md border border-zinc-200 bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <Wand2 className="h-5 w-5 text-emerald-700" aria-hidden="true" />
        <h2 className="text-base font-semibold">Automation-first tailoring</h2>
      </div>
      <p className="text-sm leading-6 text-zinc-600">
        Upload a master CV, add the job posting, and let SmartCV generate a
        tailored draft anchored to truthful CV evidence. You only step in when a
        genuinely missing fact needs confirmation.
      </p>
    </div>
  );
}

function WorkspaceGuide() {
  return (
    <div className="rounded-md border border-zinc-200 bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-emerald-700" aria-hidden="true" />
        <h2 className="text-base font-semibold">Tailoring flow</h2>
      </div>
      <div className="space-y-3">
        <MiniStep
          title="1. Read"
          text="Upload or paste the master CV and the job posting."
        />
        <MiniStep
          title="2. Extract"
          text="SmartCV turns both texts into candidate facts and job requirements."
        />
        <MiniStep
          title="3. Generate"
          text="SmartCV builds the tailored CV draft first, using grounded evidence and safe deterministic wording."
        />
        <MiniStep
          title="4. Confirm"
          text="Only real missing or unclear facts become confirmation questions for you to answer."
        />
        <MiniStep
          title="5. Review"
          text="Use advanced analysis only when you want to inspect why SmartCV made the changes."
        />
      </div>
    </div>
  );
}

function PrivacyDisclosure() {
  return (
    <div className="rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950">
      <div className="mb-2 font-semibold">Privacy and truthfulness</div>
      <p className="leading-6">
        CV and job text may be saved in this browser&apos;s localStorage so your
        workspace can persist. Clear workspace removes that locally stored data.
        If configured, OpenAI may help server-side with requirement extraction
        and eligible wording polish, but deterministic local analysis and
        validation remain the source of truth. Only add evidence that is true
        and suitable for a real application.
      </p>
    </div>
  );
}

function TextPanel({
  id,
  label,
  value,
  onChange,
  rows,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows: number;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium text-zinc-700">
          {label}
        </label>
        <span className="text-xs text-zinc-400">{value.length} chars</span>
      </div>
      <textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        className="w-full resize-y rounded-md border border-zinc-200 bg-white p-3 font-mono text-sm leading-5 text-zinc-900 outline-none focus:border-emerald-600"
      />
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "green" | "amber";
}) {
  const styles = {
    green: "border-emerald-200 bg-emerald-50 text-emerald-800",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
  };

  return (
    <div className={`rounded-md border p-3 ${styles[tone]}`}>
      <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.08em]">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-semibold tracking-normal">{value}</div>
    </div>
  );
}

function SummaryCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-zinc-200 bg-white p-4">
      <h2 className="mb-3 text-base font-semibold">{title}</h2>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="text-zinc-600">{label}</span>
      <span className="text-right font-medium text-zinc-900">{value}</span>
    </div>
  );
}

function MiniStep({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
      <h3 className="mb-2 text-sm font-semibold text-zinc-900">{title}</h3>
      <p className="text-sm leading-6 text-zinc-600">{text}</p>
    </div>
  );
}
