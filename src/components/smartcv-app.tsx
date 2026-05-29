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
import {
  RequirementEvidenceMap,
  type RequirementFilter,
} from "@/components/requirement-evidence-map";
import { isPhase1AnalysisResult } from "@/lib/analysis-validation";
import { splitTextIntoSections } from "@/lib/analysis-utils";
import type {
  Phase1AnalysisResult,
  SectionText,
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
  requirementFilter: RequirementFilter;
  savedAt: string;
};

const storageKey = "smartcv.workspace.v1";

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
  const [requirementFilter, setRequirementFilter] =
    useState<RequirementFilter>("all");
  const [hasHydrated, setHasHydrated] = useState(false);

  const canAnalyze = cvText.trim().length > 80 && jobText.trim().length > 80;

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

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const stored = window.localStorage.getItem(storageKey);

      if (stored) {
        try {
          const workspace = JSON.parse(stored) as Partial<StoredWorkspace>;

          setCvText(
            typeof workspace.cvText === "string" ? workspace.cvText : sampleCv,
          );
          setJobText(
            typeof workspace.jobText === "string"
              ? workspace.jobText
              : sampleJob,
          );
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
                  typeof workspace.cvText === "string"
                    ? workspace.cvText
                    : sampleCv,
                  "cv",
                ),
          );
          setResult(
            isPhase1AnalysisResult(workspace.result) ? workspace.result : null,
          );
          setRequirementFilter(
            isRequirementFilter(workspace.requirementFilter)
              ? workspace.requirementFilter
              : "all",
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
      requirementFilter,
      savedAt: new Date().toISOString(),
    };

    window.localStorage.setItem(storageKey, JSON.stringify(workspace));
  }, [
    cvEditorMode,
    cvFileName,
    cvText,
    forceLocal,
    hasHydrated,
    jobText,
    jobUrl,
    parsedCvSections,
    requirementFilter,
    result,
  ]);

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
      setRequirementFilter("all");
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
      setRequirementFilter("all");
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
      setRequirementFilter("all");
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
    setRequirementFilter("all");
    setError("");
  }

  function clearInputs() {
    window.localStorage.removeItem(storageKey);
    setCvText("");
    setJobText("");
    setJobUrl("");
    setCvFileName("");
    setCvPreviewImage("");
    setCvEditorMode("sections");
    setParsedCvSections([]);
    setResult(null);
    setRequirementFilter("all");
    setError("");
  }

  function updateFullCv(value: string) {
    setCvText(value);
    setParsedCvSections(splitTextIntoSections(value, "cv"));
    setResult(null);
  }

  function updateCvSection(index: number, value: string) {
    const nextSections = parsedCvSections.map((section, sectionIndex) =>
      sectionIndex === index ? { ...section, text: value } : section,
    );
    setParsedCvSections(nextSections);
    setCvText(composeCvSections(nextSections));
    setResult(null);
  }

  const cvSectionLabels = result
    ? [...new Set(result.cv.sections.map((section) => section.label))].slice(0, 6)
    : [];

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
              {hasHydrated ? "Saved locally" : "Auto-save loading"}
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
              disabled={loading || !canAnalyze}
              title="Analyze CV against job"
              className="inline-flex h-9 items-center gap-2 rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Wand2 className="h-4 w-4" aria-hidden="true" />
              )}
              Analyze
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
                onChange={(event) => setForceLocal(event.target.checked)}
                className="h-4 w-4 accent-emerald-700"
              />
            </label>
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

            <OriginalCvEditor
              cvText={cvText}
              mode={cvEditorMode}
              sections={parsedCvSections}
              onModeChange={setCvEditorMode}
              onFullChange={updateFullCv}
              onSectionChange={updateCvSection}
            />

            {result ? (
              <RequirementEvidenceMap
                requirements={result.job.requirements}
                filter={requirementFilter}
                onFilterChange={setRequirementFilter}
              />
            ) : null}
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
                    label="Facts extracted"
                    value={String(result.cv.facts.length)}
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

function isRequirementFilter(value: unknown): value is RequirementFilter {
  return (
    value === "all" ||
    value === "supported" ||
    value === "weak" ||
    value === "missing" ||
    value === "blocked"
  );
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

function composeCvSections(sections: SectionText[]) {
  return sections
    .map((section) => {
      if (section.label === "Header") return section.text.trim();
      return `${section.label}\n${section.text.trim()}`.trim();
    })
    .filter(Boolean)
    .join("\n\n");
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
        <h2 className="text-base font-semibold">Evidence-first analysis</h2>
      </div>
      <p className="text-sm leading-6 text-zinc-600">
        Analyze the master CV against a job posting to extract requirements,
        map them to grounded CV evidence, surface gaps, and flag ATS hygiene
        risks.
      </p>
    </div>
  );
}

function WorkspaceGuide() {
  return (
    <div className="rounded-md border border-zinc-200 bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-emerald-700" aria-hidden="true" />
        <h2 className="text-base font-semibold">Phase 1A flow</h2>
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
          title="3. Match"
          text="Each requirement is marked as supported, weak, missing, or blocked."
        />
      </div>
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
