"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Clipboard,
  Copy,
  Download,
  FileSearch,
  Gauge,
  Layers3,
  Link,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Wand2,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type {
  AnalysisResult,
  AtsRisk,
  EvidenceItem,
  ParserSignal,
  TailoredLayer,
} from "@/lib/types";

type TabId = "layers" | "evidence" | "ats" | "draft";

type StoredWorkspace = {
  cvText: string;
  jobText: string;
  jobUrl: string;
  forceLocal: boolean;
  result: AnalysisResult | null;
  activeTab: TabId;
  layerDrafts: Record<string, string>;
  finalDraft: string;
  acceptedLayerIds: string[];
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

const tabs: { id: TabId; label: string }[] = [
  { id: "layers", label: "Layers" },
  { id: "evidence", label: "Evidence" },
  { id: "ats", label: "ATS" },
  { id: "draft", label: "Draft" },
];

export function SmartCvApp() {
  const [cvText, setCvText] = useState(sampleCv);
  const [jobText, setJobText] = useState(sampleJob);
  const [jobUrl, setJobUrl] = useState("");
  const [forceLocal, setForceLocal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetchingJob, setFetchingJob] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("layers");
  const [layerDrafts, setLayerDrafts] = useState<Record<string, string>>({});
  const [finalDraft, setFinalDraft] = useState("");
  const [acceptedLayers, setAcceptedLayers] = useState<Set<string>>(new Set());
  const [hasHydrated, setHasHydrated] = useState(false);

  const canAnalyze = cvText.trim().length > 80 && jobText.trim().length > 80;

  const coverageTotal = useMemo(() => {
    if (!result) return 0;
    const { matched, weak, missing } = result.keywordCoverage;
    return matched.length + weak.length + missing.length;
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
          setResult(workspace.result ?? null);
          setActiveTab(
            isTabId(workspace.activeTab) ? workspace.activeTab : "layers",
          );
          setLayerDrafts(workspace.layerDrafts ?? {});
          setFinalDraft(
            typeof workspace.finalDraft === "string" ? workspace.finalDraft : "",
          );
          setAcceptedLayers(new Set(workspace.acceptedLayerIds ?? []));
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
      result,
      activeTab,
      layerDrafts,
      finalDraft,
      acceptedLayerIds: [...acceptedLayers],
      savedAt: new Date().toISOString(),
    };

    window.localStorage.setItem(storageKey, JSON.stringify(workspace));
  }, [
    acceptedLayers,
    activeTab,
    cvText,
    finalDraft,
    forceLocal,
    hasHydrated,
    jobText,
    jobUrl,
    layerDrafts,
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
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Job fetch failed.");
      setJobText(payload.text || "");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Job fetch failed.");
    } finally {
      setFetchingJob(false);
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
      if (!response.ok) throw new Error(payload.error || "Analysis failed.");

      const analysis = payload as AnalysisResult;
      setResult(analysis);
      setLayerDrafts(
        Object.fromEntries(
          analysis.layers.map((layer) => [layer.id, layer.suggested]),
        ),
      );
      setFinalDraft(analysis.finalDraft);
      setAcceptedLayers(new Set());
      setActiveTab("layers");
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
    setResult(null);
    setFinalDraft("");
    setLayerDrafts({});
    setAcceptedLayers(new Set());
    setActiveTab("layers");
    setError("");
  }

  function clearInputs() {
    window.localStorage.removeItem(storageKey);
    setCvText("");
    setJobText("");
    setJobUrl("");
    setResult(null);
    setFinalDraft("");
    setLayerDrafts({});
    setAcceptedLayers(new Set());
    setActiveTab("layers");
    setError("");
  }

  function updateLayer(id: string, value: string) {
    setLayerDrafts((current) => ({ ...current, [id]: value }));
  }

  function acceptLayer(layer: TailoredLayer) {
    setAcceptedLayers((current) => new Set(current).add(layer.id));
    setFinalDraft((current) => {
      const block = `${layer.label}\n${layerDrafts[layer.id] ?? layer.suggested}`;
      return current.trim() ? `${current.trim()}\n\n${block}` : block;
    });
  }

  function rebuildDraft() {
    if (!result) return;
    setFinalDraft(
      result.layers
        .map((layer) => `${layer.label}\n${layerDrafts[layer.id] ?? layer.suggested}`)
        .join("\n\n"),
    );
  }

  async function copyDraft() {
    await navigator.clipboard.writeText(finalDraft);
  }

  function downloadDraft() {
    const blob = new Blob([finalDraft], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "tailored-cv-draft.txt";
    anchor.click();
    URL.revokeObjectURL(url);
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
              <h1 className="text-base font-semibold leading-5">
                SmartCV
              </h1>
              <p className="text-sm text-zinc-500">
                Evidence-based ATS editing for real applications
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

      <main className="grid min-h-[calc(100vh-65px)] lg:grid-cols-[430px_minmax(0,1fr)]">
        <aside className="border-b border-zinc-200 bg-white p-4 lg:border-b-0 lg:border-r lg:p-5">
          <div className="space-y-4">
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
                    onChange={(event) => setJobUrl(event.target.value)}
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
              id="cv-text"
              label="CV"
              value={cvText}
              onChange={setCvText}
              rows={16}
            />
            <TextPanel
              id="job-text"
              label="Job description"
              value={jobText}
              onChange={setJobText}
              rows={14}
            />

            <label className="flex items-center justify-between gap-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">
              <span>
                <span className="block font-medium text-zinc-800">
                  Local analyzer
                </span>
                <span className="text-zinc-500">
                  Skip the model call and use deterministic checks.
                </span>
              </span>
              <input
                type="checkbox"
                checked={forceLocal}
                onChange={(event) => setForceLocal(event.target.checked)}
                className="h-4 w-4 accent-emerald-700"
              />
            </label>

            {error ? (
              <div className="flex gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />
                <p>{error}</p>
              </div>
            ) : null}
          </div>
        </aside>

        <section className="min-w-0 p-4 lg:p-6">
          {result ? (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-4">
                <Metric
                  icon={<Gauge className="h-4 w-4" aria-hidden="true" />}
                  label="Parser"
                  value={`${result.parser.readiness}%`}
                  tone={result.parser.readiness > 75 ? "green" : "amber"}
                />
                <Metric
                  icon={<CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
                  label="Matched"
                  value={`${result.keywordCoverage.matched.length}/${coverageTotal}`}
                  tone="green"
                />
                <Metric
                  icon={<AlertTriangle className="h-4 w-4" aria-hidden="true" />}
                  label="Gaps"
                  value={`${result.gaps.length}`}
                  tone={result.gaps.length ? "amber" : "green"}
                />
                <Metric
                  icon={<Sparkles className="h-4 w-4" aria-hidden="true" />}
                  label="Mode"
                  value={result.meta.mode}
                  tone={result.meta.mode === "openai" ? "blue" : "zinc"}
                />
              </div>

              {result.meta.warning ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  {result.meta.warning}
                </div>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex rounded-md border border-zinc-200 bg-white p-1">
                  {tabs.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={`h-8 rounded px-3 text-sm font-medium ${
                        activeTab === tab.id
                          ? "bg-zinc-950 text-white"
                          : "text-zinc-600 hover:bg-zinc-50"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={rebuildDraft}
                    title="Rebuild draft from layer edits"
                    className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 text-sm font-medium hover:bg-zinc-50"
                  >
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                    Rebuild draft
                  </button>
                  <button
                    type="button"
                    onClick={copyDraft}
                    title="Copy final draft"
                    className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 text-sm font-medium hover:bg-zinc-50"
                  >
                    <Copy className="h-4 w-4" aria-hidden="true" />
                    Copy
                  </button>
                </div>
              </div>

              {activeTab === "layers" ? (
                <LayerView
                  layers={result.layers}
                  drafts={layerDrafts}
                  acceptedLayers={acceptedLayers}
                  onChange={updateLayer}
                  onAccept={acceptLayer}
                />
              ) : null}

              {activeTab === "evidence" ? (
                <EvidenceView
                  evidence={result.evidenceMap}
                  coverage={result.keywordCoverage}
                />
              ) : null}

              {activeTab === "ats" ? (
                <AtsView risks={result.atsRisks} signals={result.parser.signals} />
              ) : null}

              {activeTab === "draft" ? (
                <DraftView
                  value={finalDraft}
                  onChange={setFinalDraft}
                  onCopy={copyDraft}
                  onDownload={downloadDraft}
                />
              ) : null}
            </div>
          ) : (
            <EmptyState />
          )}
        </section>
      </main>
    </div>
  );
}

function isTabId(value: unknown): value is TabId {
  return (
    value === "layers" ||
    value === "evidence" ||
    value === "ats" ||
    value === "draft"
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

function Metric({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "green" | "amber" | "blue" | "zinc";
}) {
  const tones = {
    green: "border-emerald-200 bg-emerald-50 text-emerald-800",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    blue: "border-sky-200 bg-sky-50 text-sky-800",
    zinc: "border-zinc-200 bg-white text-zinc-700",
  };

  return (
    <div className={`rounded-md border p-3 ${tones[tone]}`}>
      <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.08em]">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-semibold tracking-normal">{value}</div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
      <div className="rounded-md border border-zinc-200 bg-white p-5">
        <div className="mb-4 flex items-center gap-3">
          <FileSearch className="h-5 w-5 text-emerald-700" aria-hidden="true" />
          <h2 className="text-lg font-semibold">Ready to tailor</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <MiniStep title="1. Parse" text="Split CV and job text into structured fields." />
          <MiniStep title="2. Map" text="Connect job requirements to real CV evidence." />
          <MiniStep title="3. Edit" text="Rewrite section layers and keep the final draft editable." />
        </div>
      </div>

      <div className="rounded-md border border-zinc-200 bg-white p-5">
        <div className="mb-4 flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-emerald-700" aria-hidden="true" />
          <h2 className="text-lg font-semibold">Guardrails</h2>
        </div>
        <ul className="space-y-3 text-sm text-zinc-600">
          <li>No invented skills, dates, metrics, or tools.</li>
          <li>Keywords belong in real evidence, not dumped into skills.</li>
          <li>ATS export should stay single-column and text-first.</li>
        </ul>
      </div>
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

function LayerView({
  layers,
  drafts,
  acceptedLayers,
  onChange,
  onAccept,
}: {
  layers: TailoredLayer[];
  drafts: Record<string, string>;
  acceptedLayers: Set<string>;
  onChange: (id: string, value: string) => void;
  onAccept: (layer: TailoredLayer) => void;
}) {
  return (
    <div className="grid gap-3">
      {layers.map((layer) => (
        <article
          key={layer.id}
          className="rounded-md border border-zinc-200 bg-white p-4"
        >
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold">{layer.label}</h2>
                <StatusPill status={layer.status} />
                <ConfidencePill confidence={layer.confidence} />
              </div>
              <p className="mt-1 text-sm text-zinc-500">{layer.rationale}</p>
            </div>
            <button
              type="button"
              onClick={() => onAccept(layer)}
              title="Append this layer to the final draft"
              className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 text-sm font-medium hover:bg-zinc-50"
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              {acceptedLayers.has(layer.id) ? "Accepted" : "Accept"}
            </button>
          </div>

          <div className="grid gap-3 xl:grid-cols-2">
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500">
                Original
              </div>
              <pre className="min-h-32 whitespace-pre-wrap rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm leading-6 text-zinc-700">
                {layer.original || "No clear original section detected."}
              </pre>
            </div>
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500">
                Suggested
              </div>
              <textarea
                value={drafts[layer.id] ?? layer.suggested}
                onChange={(event) => onChange(layer.id, event.target.value)}
                rows={8}
                className="min-h-32 w-full resize-y rounded-md border border-zinc-200 bg-white p-3 text-sm leading-6 outline-none focus:border-emerald-600"
              />
            </div>
          </div>

          {layer.keywords.length ? (
            <KeywordRow keywords={layer.keywords} />
          ) : null}
        </article>
      ))}
    </div>
  );
}

function EvidenceView({
  evidence,
  coverage,
}: {
  evidence: EvidenceItem[];
  coverage: AnalysisResult["keywordCoverage"];
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
      <div className="space-y-3">
        {evidence.map((item) => (
          <article
            key={item.requirement}
            className="rounded-md border border-zinc-200 bg-white p-4"
          >
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold">{item.requirement}</h2>
              <ConfidencePill confidence={item.confidence} />
              <span className="rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-600">
                {item.action.replace("_", " ")}
              </span>
            </div>
            <p className="text-sm leading-6 text-zinc-600">
              {item.evidence || "No trustworthy CV evidence found yet."}
            </p>
          </article>
        ))}
      </div>

      <div className="rounded-md border border-zinc-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold">Keyword coverage</h2>
        <CoverageGroup title="Matched" keywords={coverage.matched} tone="green" />
        <CoverageGroup title="Weak" keywords={coverage.weak} tone="amber" />
        <CoverageGroup title="Missing" keywords={coverage.missing} tone="red" />
      </div>
    </div>
  );
}

function AtsView({
  risks,
  signals,
}: {
  risks: AtsRisk[];
  signals: ParserSignal[];
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <div className="rounded-md border border-zinc-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold">Parser signals</h2>
        <div className="space-y-3">
          {signals.map((signal) => (
            <div
              key={signal.label}
              className="flex items-start gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-3"
            >
              <RiskIcon level={signal.level} />
              <div>
                <h3 className="text-sm font-semibold">{signal.label}</h3>
                <p className="text-sm text-zinc-600">{signal.value}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-md border border-zinc-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold">Format risks</h2>
        <div className="space-y-3">
          {risks.map((risk) => (
            <div
              key={`${risk.area}-${risk.issue}`}
              className="rounded-md border border-zinc-200 bg-zinc-50 p-3"
            >
              <div className="mb-2 flex items-center gap-2">
                <RiskIcon level={risk.level} />
                <h3 className="text-sm font-semibold">{risk.area}</h3>
              </div>
              <p className="text-sm text-zinc-600">{risk.issue}</p>
              <p className="mt-2 text-sm font-medium text-zinc-800">{risk.fix}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DraftView({
  value,
  onChange,
  onCopy,
  onDownload,
}: {
  value: string;
  onChange: (value: string) => void;
  onCopy: () => void;
  onDownload: () => void;
}) {
  return (
    <div className="rounded-md border border-zinc-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Final editable draft</h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCopy}
            title="Copy draft"
            className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 text-sm font-medium hover:bg-zinc-50"
          >
            <Copy className="h-4 w-4" aria-hidden="true" />
            Copy
          </button>
          <button
            type="button"
            onClick={onDownload}
            title="Download draft as text"
            className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 text-sm font-medium hover:bg-zinc-50"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            TXT
          </button>
        </div>
      </div>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={26}
        className="w-full resize-y rounded-md border border-zinc-200 bg-white p-4 font-mono text-sm leading-6 outline-none focus:border-emerald-600"
      />
    </div>
  );
}

function StatusPill({ status }: { status: TailoredLayer["status"] }) {
  const styles = {
    ready: "bg-emerald-50 text-emerald-800 border-emerald-200",
    needs_review: "bg-amber-50 text-amber-800 border-amber-200",
    blocked: "bg-red-50 text-red-800 border-red-200",
  };

  return (
    <span className={`rounded border px-2 py-1 text-xs ${styles[status]}`}>
      {status.replace("_", " ")}
    </span>
  );
}

function ConfidencePill({
  confidence,
}: {
  confidence: TailoredLayer["confidence"];
}) {
  const styles = {
    high: "bg-emerald-50 text-emerald-800",
    medium: "bg-sky-50 text-sky-800",
    low: "bg-zinc-100 text-zinc-600",
  };

  return (
    <span className={`rounded px-2 py-1 text-xs ${styles[confidence]}`}>
      {confidence} confidence
    </span>
  );
}

function RiskIcon({ level }: { level: AtsRisk["level"] }) {
  if (level === "good") {
    return <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-emerald-700" />;
  }

  if (level === "danger") {
    return <XCircle className="mt-0.5 h-4 w-4 flex-none text-red-700" />;
  }

  return <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-amber-700" />;
}

function KeywordRow({ keywords }: { keywords: string[] }) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {keywords.map((keyword) => (
        <span
          key={keyword}
          className="rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-600"
        >
          {keyword}
        </span>
      ))}
    </div>
  );
}

function CoverageGroup({
  title,
  keywords,
  tone,
}: {
  title: string;
  keywords: string[];
  tone: "green" | "amber" | "red";
}) {
  const styles = {
    green: "bg-emerald-50 text-emerald-800",
    amber: "bg-amber-50 text-amber-800",
    red: "bg-red-50 text-red-800",
  };

  return (
    <div className="mb-4">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500">
        {title}
      </h3>
      <div className="flex flex-wrap gap-2">
        {keywords.length ? (
          keywords.map((keyword) => (
            <span
              key={keyword}
              className={`rounded px-2 py-1 text-xs ${styles[tone]}`}
            >
              {keyword}
            </span>
          ))
        ) : (
          <span className="text-sm text-zinc-400">None</span>
        )}
      </div>
    </div>
  );
}
