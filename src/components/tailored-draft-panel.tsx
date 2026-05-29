"use client";

import { Copy, Loader2, Search, Sparkles, Wand2 } from "lucide-react";
import { DraftItemAuditDetails } from "@/components/draft-item-audit";
import { DraftValidationPanel } from "@/components/draft-validation-panel";
import {
  getDraftCopyStatusLabel,
  getDraftExclusionReasonLabel,
  type DraftAuditResult,
} from "@/lib/draft-audit";
import { getActiveDraftItemText } from "@/lib/draft-validation";
import type { TailoredDraftItem, TailoredDraftResult } from "@/lib/types";

type DraftViewMode = "draft" | "audit";

export function TailoredDraftPanel({
  audit,
  copied,
  draftError,
  draftLoading,
  draftViewMode,
  expandedAuditItemIds,
  polishEligibleCount,
  polishError,
  polishLoading,
  onCopy,
  onDraftViewModeChange,
  onGenerate,
  onPolish,
  onToggleAuditItem,
  result,
}: {
  audit: DraftAuditResult | null;
  copied: boolean;
  draftError: string;
  draftLoading: boolean;
  draftViewMode: DraftViewMode;
  expandedAuditItemIds: string[];
  polishEligibleCount: number;
  polishError: string;
  polishLoading: boolean;
  onCopy: () => void;
  onDraftViewModeChange: (mode: DraftViewMode) => void;
  onGenerate: () => void;
  onPolish: () => void;
  onToggleAuditItem: (itemId: string) => void;
  result: TailoredDraftResult | null;
}) {
  return (
    <section className="rounded-md border border-zinc-200 bg-white p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Tailored draft</h2>
          <p className="mt-1 text-sm leading-6 text-zinc-600">
            Deterministic wording remains the source of truth. Audit mode shows how
            each draft item maps back to grounded evidence and supported requirements.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {result ? <StatusPill status={result.draft.status} /> : null}
          <ViewModeToggle mode={draftViewMode} onChange={onDraftViewModeChange} />
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

          {audit ? (
            <DraftValidationPanel audit={audit} result={result} />
          ) : (
            <DraftValidationPanel audit={null} result={result} />
          )}

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
                    {section.items.map((item) => {
                      const itemAudit = audit?.itemMap[item.id];
                      const isExpanded = expandedAuditItemIds.includes(item.id);

                      return (
                        <article
                          key={item.id}
                          className="rounded-md border border-zinc-200 bg-white p-3"
                        >
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <SourcePill source={item.sourceLabel} />
                            <ReviewPill reviewState={item.reviewState} />
                            {item.polish ? (
                              <PolishPill polishState={item.polish.state} />
                            ) : null}
                            {itemAudit ? (
                              <CopyStatusPill
                                included={itemAudit.includedInCopy}
                                label={getDraftCopyStatusLabel(itemAudit.copyStatus)}
                              />
                            ) : null}
                            <span className="rounded bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700">
                              Evidence {item.evidenceIds.length}
                            </span>
                            <span className="rounded bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700">
                              Requirements {item.requirementIds.length}
                            </span>
                          </div>

                          <DraftItemBody
                            audit={itemAudit}
                            item={item}
                            viewMode={draftViewMode}
                          />

                          {itemAudit ? (
                            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                              <p className="text-xs leading-5 text-zinc-500">
                                {itemAudit.includedInCopy
                                  ? "This item is part of the current copy-ready draft."
                                  : getDraftExclusionReasonLabel(
                                      itemAudit.exclusionReason,
                                    )}
                              </p>
                              <button
                                type="button"
                                onClick={() => onToggleAuditItem(item.id)}
                                className="inline-flex h-8 items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                              >
                                <Search className="h-3.5 w-3.5" aria-hidden="true" />
                                {isExpanded ? "Hide audit details" : "Show audit details"}
                              </button>
                            </div>
                          ) : null}

                          {itemAudit && isExpanded ? (
                            <DraftItemAuditDetails audit={itemAudit} />
                          ) : null}
                        </article>
                      );
                    })}
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

function DraftItemBody({
  audit,
  item,
  viewMode,
}: {
  audit: DraftAuditResult["items"][number] | undefined;
  item: TailoredDraftItem;
  viewMode: DraftViewMode;
}) {
  const activeText = audit?.activeText ?? getActiveDraftItemText(item);
  const polishedText = audit?.polishedText;
  const hasValidatedPolish =
    Boolean(polishedText) && polishedText !== item.text;

  return (
    <div className="space-y-3">
      <div
        className={`rounded-md border p-3 ${
          audit?.activeTextSource === "polished_validated"
            ? "border-emerald-200 bg-emerald-50"
            : "border-zinc-200 bg-white"
        }`}
      >
        <div className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500">
          {audit?.activeTextSource === "polished_validated"
            ? "Active copy text"
            : item.type === "header_line"
              ? "Passthrough text"
              : "Deterministic draft text"}
        </div>
        <p className="whitespace-pre-wrap text-sm leading-6 text-zinc-900">
          {activeText}
        </p>
      </div>

      {hasValidatedPolish ? (
        <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
          <div className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500">
            Deterministic source text
          </div>
          <p className="whitespace-pre-wrap text-sm leading-6 text-zinc-800">
            {item.text}
          </p>
        </div>
      ) : null}

      {viewMode === "audit" && audit ? (
        <div className="grid gap-3 md:grid-cols-3">
          <MiniAuditCard
            label="Preserved terms"
            tone="green"
            value={audit.preservedTerms.length ? audit.preservedTerms.join(", ") : "None"}
          />
          <MiniAuditCard
            label="Added terms"
            tone="sky"
            value={audit.addedTerms.length ? audit.addedTerms.join(", ") : "None"}
          />
          <MiniAuditCard
            label="Removed terms"
            tone="amber"
            value={audit.removedTerms.length ? audit.removedTerms.join(", ") : "None"}
          />
        </div>
      ) : null}
    </div>
  );
}

function ViewModeToggle({
  mode,
  onChange,
}: {
  mode: DraftViewMode;
  onChange: (mode: DraftViewMode) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-zinc-200 bg-white p-1">
      {(
        [
          ["draft", "Draft view"],
          ["audit", "Audit view"],
        ] as const
      ).map(([value, label]) => (
        <button
          key={value}
          type="button"
          onClick={() => onChange(value)}
          className={`rounded px-3 py-1.5 text-xs font-medium ${
            mode === value
              ? "bg-zinc-950 text-white"
              : "text-zinc-600 hover:bg-zinc-50"
          }`}
        >
          {label}
        </button>
      ))}
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

function CopyStatusPill({
  included,
  label,
}: {
  included: boolean;
  label: string;
}) {
  return (
    <span
      className={`rounded border px-2 py-1 text-xs font-medium ${
        included
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-zinc-200 bg-zinc-100 text-zinc-700"
      }`}
    >
      {label}
    </span>
  );
}

function MiniAuditCard({
  label,
  tone,
  value,
}: {
  label: string;
  tone: "green" | "sky" | "amber";
  value: string;
}) {
  const styles = {
    green: "border-emerald-200 bg-emerald-50",
    sky: "border-sky-200 bg-sky-50",
    amber: "border-amber-200 bg-amber-50",
  };

  return (
    <div className={`rounded-md border p-3 ${styles[tone]}`}>
      <div className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500">
        {label}
      </div>
      <p className="text-sm leading-6 text-zinc-800">{value}</p>
    </div>
  );
}
