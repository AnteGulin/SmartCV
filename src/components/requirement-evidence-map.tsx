"use client";

import type { EvidenceStatus, JobRequirement } from "@/lib/types";

export type RequirementFilter = "all" | EvidenceStatus;

export function RequirementEvidenceMap({
  requirements,
  filter,
  onFilterChange,
}: {
  requirements: JobRequirement[];
  filter: RequirementFilter;
  onFilterChange: (filter: RequirementFilter) => void;
}) {
  const filteredRequirements =
    filter === "all"
      ? requirements
      : requirements.filter((requirement) => requirement.evidenceStatus === filter);

  const counts = {
    all: requirements.length,
    supported: requirements.filter(
      (requirement) => requirement.evidenceStatus === "supported",
    ).length,
    weak: requirements.filter((requirement) => requirement.evidenceStatus === "weak").length,
    missing: requirements.filter(
      (requirement) => requirement.evidenceStatus === "missing",
    ).length,
    blocked: requirements.filter(
      (requirement) => requirement.evidenceStatus === "blocked",
    ).length,
  };

  return (
    <section className="rounded-md border border-zinc-200 bg-white p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Requirement and evidence map</h2>
          <p className="mt-1 text-sm leading-6 text-zinc-600">
            Every job requirement is anchored to grounded CV evidence, weak evidence,
            a missing gap, or a hard blocker.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["all", "All"],
              ["supported", "Supported"],
              ["weak", "Weak"],
              ["missing", "Missing"],
              ["blocked", "Blocked"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => onFilterChange(value)}
              className={`rounded-md border px-3 py-2 text-sm font-medium ${
                filter === value
                  ? "border-zinc-950 bg-zinc-950 text-white"
                  : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
              }`}
            >
              {label} ({counts[value]})
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {filteredRequirements.length ? (
          filteredRequirements.map((requirement) => {
            const bestEvidence = requirement.matchedEvidence[0];

            return (
              <article
                key={requirement.id}
                className="rounded-md border border-zinc-200 bg-zinc-50 p-4"
              >
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div className="max-w-4xl">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <StatusPill status={requirement.evidenceStatus} />
                      <CategoryPill category={requirement.category} />
                      <span className="rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-700">
                        Importance {requirement.importance}/5
                      </span>
                    </div>
                    <h3 className="text-base font-semibold text-zinc-950">
                      {requirement.text}
                    </h3>
                    <p className="mt-1 text-sm text-zinc-500">
                      {requirement.sourceSection
                        ? `Job section: ${requirement.sourceSection}`
                        : "Job section: General"}
                    </p>
                    {requirement.evidenceStatus !== "supported" ? (
                      <p className="mt-2 text-xs font-medium uppercase tracking-[0.08em] text-zinc-500">
                        {getReviewHint(requirement.evidenceStatus)}
                      </p>
                    ) : null}
                  </div>
                  <div className="text-right text-sm text-zinc-500">
                    {bestEvidence ? (
                      <>
                        <div className="font-medium text-zinc-800">
                          {titleCase(bestEvidence.strength)} match
                        </div>
                        <div>
                          {bestEvidence.evidenceSource === "user_confirmed"
                            ? "Source: User confirmation"
                            : "Source: CV"}
                        </div>
                        <div>{Math.round(bestEvidence.score * 100)} score</div>
                      </>
                    ) : (
                      <div>No evidence yet</div>
                    )}
                  </div>
                </div>

                {bestEvidence ? (
                  <div className="grid gap-3 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                    <div className="rounded-md border border-zinc-200 bg-white p-3">
                      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500">
                        Best evidence
                      </div>
                      <div className="mb-2 inline-flex rounded bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700">
                        {bestEvidence.evidenceSource === "user_confirmed"
                          ? "User-confirmed evidence"
                          : "Original CV evidence"}
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-6 text-zinc-800">
                        {bestEvidence.matchedText}
                      </p>
                    </div>
                    <div className="rounded-md border border-zinc-200 bg-white p-3">
                      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500">
                        Why it matched
                      </div>
                      <p className="text-sm leading-6 text-zinc-700">
                        {bestEvidence.explanation}
                      </p>
                      <p className="mt-3 text-xs text-zinc-500">
                        Match type: {bestEvidence.matchType}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed border-zinc-300 bg-white p-3 text-sm leading-6 text-zinc-700">
                    {requirement.evidenceStatus === "blocked"
                      ? "No grounded CV evidence was found for this hard blocker."
                      : "No grounded CV evidence was found yet for this requirement."}
                  </div>
                )}

                <p className="mt-3 text-sm leading-6 text-zinc-600">
                  {requirement.confidenceReason}
                </p>
              </article>
            );
          })
        ) : (
          <div className="rounded-md border border-dashed border-zinc-300 bg-zinc-50 p-5 text-sm text-zinc-600">
            No requirements match the current filter.
          </div>
        )}
      </div>
    </section>
  );
}

function StatusPill({ status }: { status: EvidenceStatus }) {
  const styles = {
    supported: "border-emerald-200 bg-emerald-50 text-emerald-800",
    weak: "border-amber-200 bg-amber-50 text-amber-800",
    missing: "border-zinc-200 bg-zinc-100 text-zinc-700",
    blocked: "border-red-200 bg-red-50 text-red-800",
  };

  return (
    <span className={`rounded border px-2 py-1 text-xs font-medium ${styles[status]}`}>
      {titleCase(status)}
    </span>
  );
}

function CategoryPill({ category }: { category: JobRequirement["category"] }) {
  return (
    <span className="rounded bg-sky-50 px-2 py-1 text-xs font-medium text-sky-800">
      {titleCase(category.replace(/_/g, " "))}
    </span>
  );
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getReviewHint(status: EvidenceStatus) {
  if (status === "weak") return "Needs confirmation";
  if (status === "missing") return "Missing evidence";
  return "Hard blocker unresolved";
}
