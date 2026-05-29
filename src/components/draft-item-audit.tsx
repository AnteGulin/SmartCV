"use client";

import type { ReactNode } from "react";
import {
  buildTextTermComparison,
  getDraftCopyStatusLabel,
  getDraftExclusionReasonLabel,
  type DraftItemAudit,
} from "@/lib/draft-audit";

export function DraftItemAuditDetails({
  audit,
}: {
  audit: DraftItemAudit;
}) {
  const polishComparison =
    audit.polishedText && audit.polishedText !== audit.deterministicText
      ? buildTextTermComparison(audit.deterministicText, audit.polishedText)
      : null;

  return (
    <div className="mt-3 space-y-3 rounded-md border border-zinc-200 bg-zinc-50 p-3">
      <div className="grid gap-3 md:grid-cols-2">
        <AuditBox title="Copy decision">
          <p className="text-sm leading-6 text-zinc-800">
            {getDraftCopyStatusLabel(audit.copyStatus)}
          </p>
          <p className="mt-2 text-xs leading-5 text-zinc-500">
            {getDraftExclusionReasonLabel(audit.exclusionReason)}
          </p>
        </AuditBox>
        <AuditBox title="Active wording">
          <p className="text-sm leading-6 text-zinc-800">
            {audit.activeTextSource === "polished_validated"
              ? "Using validated polished wording in copy output."
              : "Using deterministic wording in copy output."}
          </p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-900">
            {audit.activeText}
          </p>
        </AuditBox>
      </div>

      <AuditBox title="Source evidence">
        {audit.beforeSnippets.length ? (
          <div className="space-y-3">
            {audit.beforeSnippets.map((snippet, index) => (
              <article
                key={`${snippet.evidenceId ?? snippet.section}-${index}`}
                className="rounded-md border border-zinc-200 bg-white p-3"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <SourceBadge source={snippet.source} />
                  <span className="rounded bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700">
                    {snippet.section}
                  </span>
                  {snippet.evidenceId ? (
                    <span className="rounded bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700">
                      {snippet.evidenceId}
                    </span>
                  ) : null}
                  {typeof snippet.confidence === "number" ? (
                    <span className="rounded bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700">
                      Confidence {Math.round(snippet.confidence * 100)}%
                    </span>
                  ) : null}
                </div>
                <p className="whitespace-pre-wrap text-sm leading-6 text-zinc-800">
                  {snippet.text}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <p className="text-sm leading-6 text-zinc-600">
            No linked source evidence is available for this item.
          </p>
        )}
      </AuditBox>

      <AuditBox title="Linked requirements">
        {audit.requirementSnippets.length ? (
          <div className="space-y-3">
            {audit.requirementSnippets.map((requirement) => (
              <article
                key={requirement.requirementId}
                className="rounded-md border border-zinc-200 bg-white p-3"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="rounded bg-sky-50 px-2 py-1 text-xs font-medium text-sky-800">
                    {formatTitleCase(requirement.category.replace(/_/g, " "))}
                  </span>
                  <span className="rounded bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700">
                    Importance {requirement.importance}/5
                  </span>
                  <RequirementStatusBadge status={requirement.evidenceStatus} />
                </div>
                <p className="text-sm leading-6 text-zinc-900">{requirement.text}</p>
                <div className="mt-2 text-xs leading-5 text-zinc-500">
                  Requirement ID: <span className="font-mono">{requirement.requirementId}</span>
                </div>
                <div className="text-xs leading-5 text-zinc-500">
                  Fingerprint: <span className="font-mono">{requirement.fingerprint}</span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="text-sm leading-6 text-zinc-600">
            This item does not map to job requirements. That is expected for passthrough
            header lines and review notes.
          </p>
        )}
      </AuditBox>

      <AuditBox title="Comparison">
        <div className="grid gap-3 lg:grid-cols-2">
          <ComparisonCard
            title="Source evidence -> active text"
            sourceText={audit.beforeSnippets.map((snippet) => snippet.text).join("\n\n")}
            targetText={audit.activeText}
            comparison={{
              preservedTerms: audit.preservedTerms,
              addedTerms: audit.addedTerms,
              removedTerms: audit.removedTerms,
            }}
          />
          {polishComparison ? (
            <ComparisonCard
              title="Deterministic -> polished"
              sourceText={audit.deterministicText}
              targetText={audit.polishedText ?? audit.deterministicText}
              comparison={polishComparison}
            />
          ) : null}
        </div>
      </AuditBox>

      <AuditBox title="Validation issues">
        {audit.validationIssues.length ? (
          <div className="space-y-3">
            {audit.validationIssues.map((issue) => (
              <article
                key={issue.id}
                className="rounded-md border border-zinc-200 bg-white p-3"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <SeverityBadge severity={issue.severity} />
                  <span className="rounded bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700">
                    {issue.category.replace(/_/g, " ")}
                  </span>
                </div>
                <p className="text-sm leading-6 text-zinc-800">{issue.message}</p>
                <p className="mt-2 text-xs leading-5 text-zinc-500">
                  {issue.recommendation}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <p className="text-sm leading-6 text-zinc-600">
            No validation issues are attached to this draft item.
          </p>
        )}
      </AuditBox>
    </div>
  );
}

function ComparisonCard({
  title,
  sourceText,
  targetText,
  comparison,
}: {
  title: string;
  sourceText: string;
  targetText: string;
  comparison: {
    preservedTerms: string[];
    addedTerms: string[];
    removedTerms: string[];
  };
}) {
  return (
    <div className="rounded-md border border-zinc-200 bg-white p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500">
        {title}
      </div>
      <div className="space-y-3">
        <div>
          <div className="mb-1 text-xs font-medium text-zinc-500">Source</div>
          <p className="whitespace-pre-wrap text-sm leading-6 text-zinc-800">
            {sourceText || "No source text available."}
          </p>
        </div>
        <div>
          <div className="mb-1 text-xs font-medium text-zinc-500">Result</div>
          <p className="whitespace-pre-wrap text-sm leading-6 text-zinc-900">
            {targetText}
          </p>
        </div>
        <TermList label="Preserved terms" tone="green" terms={comparison.preservedTerms} />
        <TermList label="Added terms" tone="sky" terms={comparison.addedTerms} />
        <TermList label="Removed terms" tone="amber" terms={comparison.removedTerms} />
      </div>
    </div>
  );
}

function AuditBox({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <section className="rounded-md border border-zinc-200 bg-white p-3">
      <h4 className="mb-2 text-sm font-semibold text-zinc-900">{title}</h4>
      {children}
    </section>
  );
}

function TermList({
  label,
  tone,
  terms,
}: {
  label: string;
  tone: "green" | "sky" | "amber";
  terms: string[];
}) {
  const styles = {
    green: "bg-emerald-50 text-emerald-800",
    sky: "bg-sky-50 text-sky-800",
    amber: "bg-amber-50 text-amber-800",
  };

  return (
    <div>
      <div className="mb-1 text-xs font-medium text-zinc-500">{label}</div>
      {terms.length ? (
        <div className="flex flex-wrap gap-2">
          {terms.map((term) => (
            <span
              key={`${label}-${term}`}
              className={`rounded px-2 py-1 text-xs font-medium ${styles[tone]}`}
            >
              {term}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs leading-5 text-zinc-500">No notable terms.</p>
      )}
    </div>
  );
}

function SourceBadge({ source }: { source: "cv" | "user_confirmed" | "passthrough" }) {
  const labels = {
    cv: "Original CV",
    user_confirmed: "User-confirmed",
    passthrough: "Passthrough",
  };
  const styles = {
    cv: "bg-sky-50 text-sky-800",
    user_confirmed: "bg-amber-50 text-amber-800",
    passthrough: "bg-zinc-100 text-zinc-700",
  };

  return (
    <span className={`rounded px-2 py-1 text-xs font-medium ${styles[source]}`}>
      {labels[source]}
    </span>
  );
}

function RequirementStatusBadge({
  status,
}: {
  status: DraftItemAudit["requirementSnippets"][number]["evidenceStatus"];
}) {
  const styles = {
    supported: "bg-emerald-50 text-emerald-800",
    weak: "bg-amber-50 text-amber-800",
    missing: "bg-zinc-100 text-zinc-700",
    blocked: "bg-red-50 text-red-800",
  };

  return (
    <span className={`rounded px-2 py-1 text-xs font-medium ${styles[status]}`}>
      {formatTitleCase(status)}
    </span>
  );
}

function SeverityBadge({
  severity,
}: {
  severity: DraftItemAudit["validationIssues"][number]["severity"];
}) {
  const styles = {
    info: "bg-sky-50 text-sky-800",
    warning: "bg-amber-50 text-amber-800",
    critical: "bg-red-50 text-red-800",
  };

  return (
    <span className={`rounded px-2 py-1 text-xs font-medium ${styles[severity]}`}>
      {formatTitleCase(severity)}
    </span>
  );
}

function formatTitleCase(value: string) {
  return value
    .replace(/_/g, " ")
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
