"use client";

import type { TailoredDraftResult } from "@/lib/types";

export function DraftValidationPanel({
  validation,
}: {
  validation: TailoredDraftResult["validation"];
}) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Blocked requirements"
          value={String(validation.blockedRequirementIds.length)}
        />
        <StatCard
          label="Missing high-importance"
          value={String(validation.missingHighImportanceRequirementIds.length)}
        />
        <StatCard
          label="User-confirmed only"
          value={String(validation.userConfirmedOnlyItemCount)}
        />
        <StatCard
          label="Dropped items"
          value={String(validation.droppedItemCount)}
        />
      </div>

      {validation.issues.length ? (
        <div className="rounded-md border border-zinc-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-zinc-900">
            Validation issues
          </h3>
          <div className="space-y-3">
            {validation.issues.map((issue) => (
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
