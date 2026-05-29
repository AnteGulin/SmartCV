"use client";

import { ChevronDown, ChevronUp, Download, FileText, Printer } from "lucide-react";
import type { ReactNode } from "react";
import type { ExportPreview, ExportValidationResult, ExportFormat } from "@/lib/types";

export function ExportPanel({
  acknowledgedBlockedDraft,
  docxLoading,
  error,
  formatPreference,
  isOpen,
  onAcknowledgedBlockedDraftChange,
  onDownloadDocx,
  onDownloadTxt,
  onPrint,
  onToggleOpen,
  preview,
  validation,
}: {
  acknowledgedBlockedDraft: boolean;
  docxLoading: boolean;
  error: string;
  formatPreference: ExportFormat | null;
  isOpen: boolean;
  onAcknowledgedBlockedDraftChange: (checked: boolean) => void;
  onDownloadDocx: () => void;
  onDownloadTxt: () => void;
  onPrint: () => void;
  onToggleOpen: () => void;
  preview: ExportPreview;
  validation: ExportValidationResult;
}) {
  const blockingIssues = validation.issues.filter(
    (issue) => issue.severity === "critical",
  );
  const warningIssues = validation.issues.filter(
    (issue) => issue.severity === "warning",
  );
  const downloadsDisabled = !validation.canExport;

  return (
    <section className="rounded-md border border-zinc-200 bg-white p-4">
      <div
        className="mb-4 flex flex-wrap items-start justify-between gap-3"
        data-export-print-controls
      >
        <div>
          <h2 className="text-lg font-semibold">Export preview</h2>
          <p className="mt-1 text-sm leading-6 text-zinc-600">
            This preview matches the default export content. Review notes and
            user-confirmed-only review items stay out of exported files.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onToggleOpen}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            {isOpen ? (
              <ChevronUp className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            )}
            {isOpen ? "Hide preview" : "Show preview"}
          </button>
          <ExportButton
            active={formatPreference === "txt"}
            disabled={downloadsDisabled}
            icon={<FileText className="h-4 w-4" aria-hidden="true" />}
            label="Download TXT"
            onClick={onDownloadTxt}
          />
          <ExportButton
            active={formatPreference === "docx"}
            disabled={downloadsDisabled || docxLoading}
            icon={<Download className="h-4 w-4" aria-hidden="true" />}
            label={docxLoading ? "Preparing DOCX" : "Download DOCX"}
            onClick={onDownloadDocx}
          />
          <ExportButton
            active={formatPreference === "pdf"}
            disabled={downloadsDisabled}
            icon={<Printer className="h-4 w-4" aria-hidden="true" />}
            label="Print / Save PDF"
            onClick={onPrint}
          />
        </div>
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5" data-export-print-controls>
        <StatCard label="Included items" value={String(preview.includedItemCount)} />
        <StatCard label="Excluded items" value={String(preview.excludedItemCount)} />
        <StatCard label="Validated polish" value={String(preview.polishedItemCount)} />
        <StatCard
          label="Blocked requirements"
          value={String(preview.blockedRequirementCount)}
        />
        <StatCard
          label="Missing high-importance"
          value={String(preview.missingHighImportanceCount)}
        />
      </div>

      {error ? (
        <div
          className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-900"
          data-export-print-controls
        >
          {error}
        </div>
      ) : null}

      {preview.warnings.length ? (
        <div
          className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900"
          data-export-print-controls
        >
          <div className="mb-2 font-semibold">Export warnings</div>
          <ul className="space-y-1">
            {preview.warnings.map((warning, index) => (
              <li key={`${warning}-${index}`}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {preview.requiresBlockedAcknowledgement ? (
        <div
          className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-900"
          data-export-print-controls
        >
          <div className="mb-2 font-semibold">Blocked draft warning</div>
          <p className="leading-6">
            This draft still has blocked requirements. SmartCV will export only the
            safe included content, but you need to acknowledge that warning before
            downloading files or printing.
          </p>
          <label className="mt-3 flex items-start gap-3">
            <input
              type="checkbox"
              checked={acknowledgedBlockedDraft}
              onChange={(event) =>
                onAcknowledgedBlockedDraftChange(event.target.checked)
              }
              className="mt-1 h-4 w-4 rounded border-zinc-300"
            />
            <span className="text-sm leading-6">
              I understand that blocked requirements remain unresolved and are not
              being exported as claims.
            </span>
          </label>
        </div>
      ) : null}

      {(blockingIssues.length || warningIssues.length) ? (
        <div
          className="mb-4 grid gap-3 lg:grid-cols-2"
          data-export-print-controls
        >
          {blockingIssues.length ? (
            <IssueGroup
              issues={blockingIssues}
              title="Export blockers"
              tone="critical"
            />
          ) : null}
          {warningIssues.length ? (
            <IssueGroup
              issues={warningIssues}
              title="Export warnings"
              tone="warning"
            />
          ) : null}
        </div>
      ) : null}

      {isOpen ? (
        <div className="space-y-4" data-export-print-root>
          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4 print:border-0 print:bg-white print:p-0">
            {preview.sections.map((section) => (
              <section
                key={section.id}
                className="mb-5 last:mb-0 print:break-inside-avoid"
                data-export-print-section
              >
                {section.id !== "header" ? (
                  <h3 className="mb-2 text-base font-semibold text-zinc-950">
                    {section.title}
                  </h3>
                ) : null}
                <div className="space-y-2">
                  {section.items.map((item) => (
                    <article
                      key={item.itemId}
                      className="rounded-md border border-zinc-200 bg-white p-3 print:border-0 print:p-0"
                    >
                      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500 print:hidden">
                        <SourceBadge source={item.sourceLabel} />
                        <span className="rounded bg-zinc-100 px-2 py-1 font-medium text-zinc-700">
                          {item.textSource === "polished_validated"
                            ? "Validated polish"
                            : "Deterministic"}
                        </span>
                        <span className="rounded bg-zinc-100 px-2 py-1 font-medium text-zinc-700">
                          Evidence {item.evidenceIds.length}
                        </span>
                        <span className="rounded bg-zinc-100 px-2 py-1 font-medium text-zinc-700">
                          Requirements {item.requirementIds.length}
                        </span>
                      </div>
                      {section.id === "header" ? (
                        <p className="whitespace-pre-wrap text-sm leading-6 text-zinc-900">
                          {item.text}
                        </p>
                      ) : (
                        <div className="flex items-start gap-3">
                          <span className="pt-1 text-zinc-400 print:text-zinc-900">•</span>
                          <p className="whitespace-pre-wrap text-sm leading-6 text-zinc-900">
                            {item.text}
                          </p>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ExportButton({
  active,
  disabled,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  disabled: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
        active
          ? "border-emerald-300 bg-emerald-50 text-emerald-900"
          : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-200 bg-white p-3">
      <div className="text-xs font-medium uppercase tracking-[0.08em] text-zinc-500">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-zinc-950">{value}</div>
    </div>
  );
}

function IssueGroup({
  issues,
  title,
  tone,
}: {
  issues: ExportValidationResult["issues"];
  title: string;
  tone: "critical" | "warning";
}) {
  const styles = {
    critical: "border-red-200 bg-red-50",
    warning: "border-amber-200 bg-amber-50",
  };

  return (
    <section className={`rounded-md border p-4 ${styles[tone]}`}>
      <h3 className="mb-3 text-sm font-semibold text-zinc-900">{title}</h3>
      <div className="space-y-3">
        {issues.map((issue) => (
          <article
            key={issue.id}
            className="rounded-md border border-zinc-200 bg-white p-3"
          >
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span
                className={`rounded px-2 py-1 text-xs font-medium ${
                  issue.severity === "critical"
                    ? "bg-red-50 text-red-800"
                    : "bg-amber-50 text-amber-800"
                }`}
              >
                {issue.severity === "critical" ? "Critical" : "Warning"}
              </span>
              <span className="rounded bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700">
                {issue.category.replace(/_/g, " ")}
              </span>
            </div>
            <p className="text-sm leading-6 text-zinc-900">{issue.message}</p>
            <p className="mt-1 text-xs leading-5 text-zinc-500">
              {issue.recommendation}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

function SourceBadge({
  source,
}: {
  source: ExportPreview["sections"][number]["items"][number]["sourceLabel"];
}) {
  const labels = {
    cv_only: "CV",
    user_confirmed_only: "User-confirmed",
    mixed: "Mixed",
    passthrough: "Passthrough",
  };

  return (
    <span className="rounded bg-sky-50 px-2 py-1 font-medium text-sky-800">
      {labels[source]}
    </span>
  );
}
