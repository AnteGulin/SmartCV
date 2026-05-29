"use client";

import { Copy, Loader2, Sparkles, Wand2 } from "lucide-react";
import { DraftValidationPanel } from "@/components/draft-validation-panel";
import type { TailoredDraftItem, TailoredDraftResult } from "@/lib/types";

export function TailoredDraftPanel({
  copied,
  draftError,
  draftLoading,
  polishEligibleCount,
  polishError,
  polishLoading,
  onCopy,
  onGenerate,
  onPolish,
  result,
}: {
  copied: boolean;
  draftError: string;
  draftLoading: boolean;
  polishEligibleCount: number;
  polishError: string;
  polishLoading: boolean;
  onCopy: () => void;
  onGenerate: () => void;
  onPolish: () => void;
  result: TailoredDraftResult | null;
}) {
  return (
    <section className="rounded-md border border-zinc-200 bg-white p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Tailored draft</h2>
          <p className="mt-1 text-sm leading-6 text-zinc-600">
            Deterministic wording remains the source of truth. OpenAI polish can only
            refine eligible CV-backed bullets after strict validation.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {result ? <StatusPill status={result.draft.status} /> : null}
          <button
            type="button"
            onClick={onGenerate}
            disabled={draftLoading || polishLoading}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
          >
            {draftLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Wand2 className="h-4 w-4" aria-hidden="true" />
            )}
            Generate tailored draft
          </button>
          <button
            type="button"
            onClick={onPolish}
            disabled={!result || draftLoading || polishLoading || !polishEligibleCount}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {polishLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            )}
            Polish wording
          </button>
          <button
            type="button"
            onClick={onCopy}
            disabled={!result?.draft.copyText.trim()}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Copy className="h-4 w-4" aria-hidden="true" />
            {copied ? "Copied" : "Copy validated draft"}
          </button>
        </div>
      </div>

      {draftError ? (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-900">
          {draftError}
        </div>
      ) : null}

      {polishError ? (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
          {polishError}
        </div>
      ) : null}

      {result ? (
        <div className="space-y-4">
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

          <DraftValidationPanel result={result} />

          <div className="space-y-4">
            {result.draft.sections.map((section) =>
              section.items.length ? (
                <div
                  key={section.id}
                  className="rounded-md border border-zinc-200 bg-zinc-50 p-4"
                >
                  <h3 className="mb-3 text-base font-semibold text-zinc-950">
                    {section.title}
                  </h3>
                  <div className="space-y-3">
                    {section.items.map((item) => (
                      <article
                        key={item.id}
                        className="rounded-md border border-zinc-200 bg-white p-3"
                      >
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <SourcePill source={item.sourceLabel} />
                          <ReviewPill reviewState={item.reviewState} />
                          {item.polish ? <PolishPill polishState={item.polish.state} /> : null}
                          <span className="rounded bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700">
                            Evidence {item.evidenceIds.length}
                          </span>
                          <span className="rounded bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700">
                            Requirements {item.requirementIds.length}
                          </span>
                        </div>
                        <DraftItemBody item={item} />
                        {item.warnings.length || item.polish?.warnings.length ? (
                          <div className="mt-3 space-y-2">
                            {item.warnings.map((warning) => (
                              <div
                                key={warning.id}
                                className="rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs leading-5 text-zinc-700"
                              >
                                <span className="font-semibold">
                                  {warning.severity.charAt(0).toUpperCase() +
                                    warning.severity.slice(1)}
                                  :
                                </span>{" "}
                                {warning.message}
                              </div>
                            ))}
                            {item.polish?.warnings.map((warning) => (
                              <div
                                key={warning.id}
                                className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900"
                              >
                                <span className="font-semibold">
                                  {warning.severity.charAt(0).toUpperCase() +
                                    warning.severity.slice(1)}
                                  :
                                </span>{" "}
                                {warning.message}
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </article>
                    ))}
                  </div>
                </div>
              ) : null,
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-zinc-300 bg-zinc-50 p-5 text-sm leading-6 text-zinc-600">
          Generate a deterministic tailored draft from the supported evidence once
          you are happy with the current analysis and any user confirmations.
        </div>
      )}
    </section>
  );
}

function DraftItemBody({ item }: { item: TailoredDraftItem }) {
  const polishedText = item.polish?.polishedText;
  const hasValidatedPolish =
    item.polish?.state === "validated" &&
    Boolean(polishedText) &&
    polishedText !== item.text;

  if (!hasValidatedPolish) {
    return (
      <p className="whitespace-pre-wrap text-sm leading-6 text-zinc-900">{item.text}</p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
        <div className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-emerald-800">
          Validated polished wording
        </div>
        <p className="whitespace-pre-wrap text-sm leading-6 text-zinc-900">
          {polishedText}
        </p>
      </div>
      <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
        <div className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500">
          Deterministic source text
        </div>
        <p className="whitespace-pre-wrap text-sm leading-6 text-zinc-800">
          {item.text}
        </p>
      </div>
    </div>
  );
}

function StatusPill({
  status,
}: {
  status: TailoredDraftResult["draft"]["status"];
}) {
  const styles = {
    ready: "border-emerald-200 bg-emerald-50 text-emerald-800",
    needs_review: "border-amber-200 bg-amber-50 text-amber-800",
    blocked: "border-red-200 bg-red-50 text-red-800",
  };

  return (
    <span className={`rounded border px-2 py-1 text-xs font-medium ${styles[status]}`}>
      {status === "needs_review" ? "Needs review" : status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function SourcePill({
  source,
}: {
  source: TailoredDraftResult["draft"]["sections"][number]["items"][number]["sourceLabel"];
}) {
  const labels = {
    cv_only: "CV",
    user_confirmed_only: "User-confirmed",
    mixed: "Mixed",
    passthrough: "Passthrough",
  };

  return (
    <span className="rounded bg-sky-50 px-2 py-1 text-xs font-medium text-sky-800">
      {labels[source]}
    </span>
  );
}

function ReviewPill({
  reviewState,
}: {
  reviewState: TailoredDraftResult["draft"]["sections"][number]["items"][number]["reviewState"];
}) {
  const styles = {
    ready: "border-emerald-200 bg-emerald-50 text-emerald-800",
    needs_review: "border-amber-200 bg-amber-50 text-amber-800",
    dropped: "border-red-200 bg-red-50 text-red-800",
  };
  const label =
    reviewState === "needs_review"
      ? "Needs review"
      : reviewState.charAt(0).toUpperCase() + reviewState.slice(1);

  return (
    <span className={`rounded border px-2 py-1 text-xs font-medium ${styles[reviewState]}`}>
      {label}
    </span>
  );
}

function PolishPill({
  polishState,
}: {
  polishState: NonNullable<
    TailoredDraftResult["draft"]["sections"][number]["items"][number]["polish"]
  >["state"];
}) {
  const styles = {
    not_requested: "border-zinc-200 bg-zinc-50 text-zinc-700",
    validated: "border-violet-200 bg-violet-50 text-violet-800",
    unchanged: "border-zinc-200 bg-zinc-50 text-zinc-700",
    rejected: "border-amber-200 bg-amber-50 text-amber-800",
    failed: "border-red-200 bg-red-50 text-red-800",
  };
  const labels = {
    not_requested: "Not requested",
    validated: "OpenAI-polished, validated",
    unchanged: "Polish unchanged",
    rejected: "Polish rejected",
    failed: "Polish failed",
  };

  return (
    <span className={`rounded border px-2 py-1 text-xs font-medium ${styles[polishState]}`}>
      {labels[polishState]}
    </span>
  );
}
