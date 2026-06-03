"use client";

import { Copy, Loader2, Wand2 } from "lucide-react";
import type { ReactNode } from "react";
import type { TailoredDraftResult } from "@/lib/types";

export function TailoredDraftPanel({
  analysisReady,
  copied,
  draftError,
  draftLoading,
  exportPanel,
  onCopy,
  onGenerate,
  result,
}: {
  analysisReady: boolean;
  copied: boolean;
  draftError: string;
  draftLoading: boolean;
  exportPanel?: ReactNode;
  onCopy: () => void;
  onGenerate: () => void;
  result: TailoredDraftResult | null;
}) {
  const generateLabel = result ? "Refresh tailored CV" : "Generate tailored CV";
  const hasCopyReadyDraft = Boolean(result?.draft.copyText.trim());
  const questionCount = result?.analysis.improvements?.questions.length ?? 0;

  return (
    <section className="rounded-md border border-zinc-200 bg-white p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Tailored CV draft</h2>
          <p className="mt-1 text-sm leading-6 text-zinc-600">
            SmartCV generates the best truthful tailored draft it can from your
            existing CV facts. Unsupported claims stay out instead of blocking the
            rewrite.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onGenerate}
            disabled={draftLoading}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
          >
            {draftLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Wand2 className="h-4 w-4" aria-hidden="true" />
            )}
            {generateLabel}
          </button>
          <button
            type="button"
            onClick={onCopy}
            disabled={!hasCopyReadyDraft}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Copy className="h-4 w-4" aria-hidden="true" />
            {copied ? "Copied" : "Copy tailored CV"}
          </button>
        </div>
      </div>

      {draftError ? (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-900">
          {draftError}
        </div>
      ) : null}

      {result ? (
        <div className="space-y-4">
          <div
            className={`rounded-md border px-3 py-3 text-sm ${
              hasCopyReadyDraft
                ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                : "border-amber-200 bg-amber-50 text-amber-950"
            }`}
          >
            <div className="mb-2 font-semibold">
              {hasCopyReadyDraft
                ? "Tailored draft ready for review"
                : "SmartCV needs more grounded copy before it can present a full tailored draft"}
            </div>
            <p className="leading-6">
              {hasCopyReadyDraft
                ? "Review the tailored sections below, edit anything you want, and regenerate only the sections that need a stronger rewrite."
                : "SmartCV kept unsupported claims out. You can still review the safe section workspace below and refine it section by section."}
            </p>
            {questionCount ? (
              <p className="mt-2 text-xs font-medium uppercase tracking-[0.08em]">
                Analysis still has {questionCount} unresolved job-specific questions in
                the data layer, but they do not block draft generation.
              </p>
            ) : null}
          </div>

          {result.meta.warnings.length ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
              <div className="mb-2 font-semibold">Draft warnings</div>
              <ul className="space-y-1">
                {result.meta.warnings.map((warning, index) => (
                  <li key={`${warning}-${index}`}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {exportPanel}
        </div>
      ) : (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-5">
          <div className="max-w-3xl">
            <h3 className="text-base font-semibold text-emerald-950">
              Generate tailored CV from this analysis
            </h3>
            <p className="mt-2 text-sm leading-6 text-emerald-900">
              SmartCV is ready to turn the analysis into a tailored CV draft. The
              tailored workspace becomes the main review surface after generation.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onGenerate}
                disabled={!analysisReady || draftLoading}
                className="inline-flex h-10 items-center gap-2 rounded-md bg-emerald-900 px-4 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-300"
              >
                {draftLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Wand2 className="h-4 w-4" aria-hidden="true" />
                )}
                Generate tailored CV
              </button>
              <p className="text-sm leading-6 text-emerald-900/80">
                {analysisReady
                  ? "SmartCV will rewrite what it can truthfully, keep the structure visible, and leave unsupported claims out."
                  : "Add a fuller CV and job description before generating the tailored CV."}
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
