"use client";

import type { DraftAuditResult } from "@/lib/draft-audit";
import type { TailoredDraftResult } from "@/lib/types";

export function DraftValidationPanel({
  audit,
  result,
}: {
  audit: DraftAuditResult | null;
  result: TailoredDraftResult;
}) {
  const polish = result.meta.polish;

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Blocked requirements"
          value={String(result.validation.blockedRequirementIds.length)}
        />
        <StatCard
          label="Missing high-importance"
          value={String(result.validation.missingHighImportanceRequirementIds.length)}
        />
        <StatCard
          label="Included in copy"
          value={String(audit?.summary.includedInCopyCount ?? 0)}
        />
        <StatCard
          label="Excluded items"
          value={String(audit?.summary.excludedCount ?? 0)}
        />
      </div>

      {audit ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="CV-only items"
            value={String(audit.summary.cvOnlyCount)}
          />
          <StatCard
            label="User-confirmed only"
            value={String(audit.summary.userConfirmedOnlyCount)}
          />
          <StatCard
            label="Mixed-source items"
            value={String(audit.summary.mixedCount)}
          />
          <StatCard
            label="Critical issues"
            value={String(audit.summary.validationCriticalCount)}
          />
        </div>
      ) : null}

      {polish ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <StatCard
            label="Polish eligible"
            value={String(polish.eligibleCount)}
          />
          <StatCard
            label="Polish validated"
            value={String(polish.polishedCount)}
          />
          <StatCard
            label="Polish unchanged"
            value={String(polish.unchangedCount)}
          />
          <StatCard
            label="Polish rejected"
            value={String(polish.rejectedCount)}
          />
          <StatCard
            label="Polish failed"
            value={String(polish.failedCount)}
          />
        </div>
      ) : null}

      {audit?.validationGroups.length ? (
        <div className="grid gap-3 xl:grid-cols-2">
          {audit.validationGroups.map((group) => (
            <section
              key={group.id}
              className="rounded-md border border-zinc-200 bg-white p-4"
            >
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <GroupTonePill tone={group.tone} />
                <h3 className="text-sm font-semibold text-zinc-900">
                  {group.title}
                </h3>
                <span className="rounded bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700">
                  {group.count}
                </span>
              </div>
              <div className="space-y-3">
                {group.items.map((entry) => (
                  <article
                    key={entry.id}
                    className="rounded-md border border-zinc-200 bg-zinc-50 p-3"
                  >
                    <p className="text-sm leading-6 text-zinc-900">{entry.label}</p>
                    <p className="mt-1 text-xs leading-5 text-zinc-500">
                      {entry.detail}
                    </p>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : null}

      {result.validation.issues.length ? (
        <div className="rounded-md border border-zinc-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-zinc-900">
            Validation issues
          </h3>
          <div className="space-y-3">
            {result.validation.issues.map((issue) => (
              <article
                key={issue.id}
                className="rounded-md border border-zinc-200 bg-zinc-50 p-3"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <SeverityPill severity={issue.severity} />
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
        </div>
      ) : null}
    </div>
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

function GroupTonePill({
  tone,
}: {
  tone: NonNullable<DraftAuditResult["validationGroups"][number]>["tone"];
}) {
  const styles = {
    critical: "border-red-200 bg-red-50 text-red-800",
    warning: "border-amber-200 bg-amber-50 text-amber-800",
    info: "border-sky-200 bg-sky-50 text-sky-800",
  };

  return (
    <span className={`rounded border px-2 py-1 text-xs font-medium ${styles[tone]}`}>
      {tone.charAt(0).toUpperCase() + tone.slice(1)}
    </span>
  );
}

function SeverityPill({
  severity,
}: {
  severity: TailoredDraftResult["validation"]["issues"][number]["severity"];
}) {
  const styles = {
    info: "border-sky-200 bg-sky-50 text-sky-800",
    warning: "border-amber-200 bg-amber-50 text-amber-800",
    critical: "border-red-200 bg-red-50 text-red-800",
  };

  return (
    <span className={`rounded border px-2 py-1 text-xs font-medium ${styles[severity]}`}>
      {severity.charAt(0).toUpperCase() + severity.slice(1)}
    </span>
  );
}
