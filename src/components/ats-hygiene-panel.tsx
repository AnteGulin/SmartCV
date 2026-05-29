"use client";

import type { ATSHygieneWarning } from "@/lib/types";

export function AtsHygienePanel({
  warnings,
}: {
  warnings: ATSHygieneWarning[];
}) {
  return (
    <section className="rounded-md border border-zinc-200 bg-white p-4">
      <div className="mb-3">
        <h2 className="text-base font-semibold">ATS hygiene</h2>
        <p className="mt-1 text-sm leading-6 text-zinc-600">
          Deterministic checks for readability, structure, and deceptive ATS risks.
        </p>
      </div>

      {warnings.length ? (
        <div className="space-y-3">
          {warnings.map((warning) => (
            <article
              key={warning.id}
              className="rounded-md border border-zinc-200 bg-zinc-50 p-3"
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <SeverityPill severity={warning.severity} />
                <span className="rounded bg-white px-2 py-1 text-xs text-zinc-600">
                  {warning.category}
                </span>
              </div>
              <p className="text-sm font-medium text-zinc-900">{warning.message}</p>
              <p className="mt-2 text-sm leading-6 text-zinc-600">
                {warning.recommendation}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-900">
          No obvious ATS hygiene warnings were detected in the extracted CV text.
        </div>
      )}
    </section>
  );
}

function SeverityPill({
  severity,
}: {
  severity: ATSHygieneWarning["severity"];
}) {
  const styles = {
    info: "bg-sky-50 text-sky-800",
    warning: "bg-amber-50 text-amber-800",
    critical: "bg-red-50 text-red-800",
  };

  return (
    <span className={`rounded px-2 py-1 text-xs font-medium ${styles[severity]}`}>
      {severity}
    </span>
  );
}
