"use client";

import type {
  ImprovementAction,
  ImprovementCoverage,
  ImprovementTruthRisk,
  RequirementImprovementResult,
} from "@/lib/types";

export function RequirementImprovementPanel({
  improvements,
  showQuestions = true,
  variant = "detailed",
}: {
  improvements: RequirementImprovementResult;
  showQuestions?: boolean;
  variant?: "summary" | "detailed";
}) {
  const hasSuggestions = improvements.sectionGroups.some(
    (group) => group.suggestions.length > 0,
  );
  const sectionSuggestionGroups = improvements.sectionGroups.filter(
    (group) => group.suggestions.length > 0,
  );

  if (variant === "summary") {
    return (
      <section className="rounded-md border border-zinc-200 bg-white p-4">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Improvement summary</h2>
            <p className="mt-1 text-sm leading-6 text-zinc-600">
              SmartCV found grounded CV edits where possible and left missing facts
              as questions instead of inventing content.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs text-zinc-600 sm:grid-cols-4">
            <MetricPill label="Covered" value={improvements.summary.coveredCount} />
            <MetricPill
              label="Partial"
              value={improvements.summary.partiallyCoveredCount}
            />
            <MetricPill label="Missing" value={improvements.summary.missingCount} />
            <MetricPill
              label="Questions"
              value={improvements.summary.confirmationQuestionCount}
            />
          </div>
        </div>

        <div className="space-y-3">
          {sectionSuggestionGroups.length ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {sectionSuggestionGroups.map((group) => (
                <div
                  key={group.sectionId}
                  className="rounded-md border border-zinc-200 bg-zinc-50 p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-zinc-900">{group.title}</h3>
                    <span className="rounded bg-white px-2 py-1 text-xs text-zinc-600">
                      {group.suggestions.length}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-zinc-600">
                    {group.suggestions
                      .slice(0, 2)
                      .map((suggestion) => suggestion.requirementText)
                      .join("; ")}
                    {group.suggestions.length > 2 ? "..." : ""}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-zinc-300 bg-zinc-50 p-5 text-sm leading-6 text-zinc-600">
              No low-risk section edits were generated from the current CV evidence in
              this pass.
            </div>
          )}

          {showQuestions ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm leading-6 text-amber-900">
              {improvements.questions.length
                ? `${improvements.questions.length} job-relevant item${
                    improvements.questions.length === 1 ? "" : "s"
                  } still need user confirmation before SmartCV can safely add them.`
                : "No additional user confirmation is needed for the current analysis result."}
            </div>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-md border border-zinc-200 bg-white p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">
            Section-by-section improvement suggestions
          </h2>
          <p className="mt-1 text-sm leading-6 text-zinc-600">
            These suggestions are grounded in current CV evidence only. Missing or
            unclear gaps stay as confirmation questions instead of invented claims.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs text-zinc-600 sm:grid-cols-4">
          <MetricPill label="Covered" value={improvements.summary.coveredCount} />
          <MetricPill
            label="Partial"
            value={improvements.summary.partiallyCoveredCount}
          />
          <MetricPill label="Missing" value={improvements.summary.missingCount} />
          <MetricPill
            label="Questions"
            value={improvements.summary.confirmationQuestionCount}
          />
        </div>
      </div>

      <div className="space-y-4">
        {hasSuggestions ? (
          improvements.sectionGroups.map((group) => (
            <div
              key={group.sectionId}
              className="rounded-md border border-zinc-200 bg-zinc-50 p-4"
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-base font-semibold text-zinc-900">
                  {group.title}
                </h3>
                <span className="rounded bg-white px-2 py-1 text-xs text-zinc-600">
                  {group.suggestions.length} suggestion
                  {group.suggestions.length === 1 ? "" : "s"}
                </span>
              </div>

              <div className="space-y-3">
                {group.suggestions.map((suggestion) => (
                  <article
                    key={suggestion.id}
                    className="rounded-md border border-zinc-200 bg-white p-4"
                  >
                    <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                      <div className="max-w-4xl">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <CoveragePill coverage={suggestion.coverage} />
                          <ActionPill action={suggestion.action} />
                          <RiskPill risk={suggestion.truthRisk} />
                        </div>
                        <h4 className="text-sm font-semibold text-zinc-900">
                          Addresses: {suggestion.requirementText}
                        </h4>
                        <p className="mt-1 text-sm leading-6 text-zinc-600">
                          {suggestion.reason}
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-3 lg:grid-cols-2">
                      <SuggestionBox title="Original text">
                        <p className="whitespace-pre-wrap text-sm leading-6 text-zinc-800">
                          {suggestion.originalText || "No current section text."}
                        </p>
                      </SuggestionBox>
                      <SuggestionBox title="Suggested text">
                        <p className="whitespace-pre-wrap text-sm leading-6 text-zinc-800">
                          {suggestion.suggestedText}
                        </p>
                      </SuggestionBox>
                    </div>

                    <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                      <SuggestionBox title="CV evidence used">
                        <ul className="space-y-2 text-sm leading-6 text-zinc-700">
                          {suggestion.cvEvidenceSnippets.map((snippet, index) => (
                            <li key={`${suggestion.id}-evidence-${index}`}>{snippet}</li>
                          ))}
                        </ul>
                      </SuggestionBox>
                      <SuggestionBox title="Keywords added">
                        {suggestion.keywordsAdded.length ? (
                          <div className="flex flex-wrap gap-2">
                            {suggestion.keywordsAdded.map((keyword) => (
                              <span
                                key={`${suggestion.id}-${keyword}`}
                                className="rounded bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700"
                              >
                                {keyword}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-zinc-500">
                            No new keywords were added.
                          </p>
                        )}
                      </SuggestionBox>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-md border border-dashed border-zinc-300 bg-zinc-50 p-5 text-sm leading-6 text-zinc-600">
            No low-risk section edits were generated from the current CV evidence in
            this pass.
          </div>
        )}

        {showQuestions ? (
          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold text-zinc-900">
                Needs confirmation before SmartCV can suggest wording
              </h3>
              <span className="rounded bg-white px-2 py-1 text-xs text-zinc-600">
                {improvements.questions.length} question
                {improvements.questions.length === 1 ? "" : "s"}
              </span>
            </div>

            {improvements.questions.length ? (
              <div className="space-y-3">
                {improvements.questions.map((question) => (
                  <article
                    key={question.id}
                    className="rounded-md border border-zinc-200 bg-white p-4"
                  >
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <RiskPill risk={question.truthRisk} />
                      <span className="rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-700">
                        {titleCase(question.facet.replace(/_/g, " "))}
                      </span>
                      <span className="rounded bg-sky-50 px-2 py-1 text-xs text-sky-800">
                        Ask about{" "}
                        {titleCase(question.suggestedEvidenceType.replace(/_/g, " "))}
                      </span>
                    </div>
                    <h4 className="text-sm font-semibold text-zinc-900">
                      {question.requirementText}
                    </h4>
                    <p className="mt-1 text-sm leading-6 text-zinc-600">
                      {question.reason}
                    </p>
                    <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
                      {question.prompt}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-zinc-300 bg-zinc-50 p-5 text-sm leading-6 text-zinc-600">
                No confirmation questions are needed for the current analysis result.
              </div>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function SuggestionBox({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500">
        {title}
      </div>
      {children}
    </div>
  );
}

function MetricPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-center">
      <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-500">
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold text-zinc-900">{value}</div>
    </div>
  );
}

function CoveragePill({ coverage }: { coverage: ImprovementCoverage }) {
  const styles = {
    covered: "border-emerald-200 bg-emerald-50 text-emerald-800",
    partially_covered: "border-amber-200 bg-amber-50 text-amber-800",
    missing: "border-zinc-200 bg-zinc-100 text-zinc-700",
    unclear: "border-red-200 bg-red-50 text-red-800",
  };

  return (
    <span className={`rounded border px-2 py-1 text-xs font-medium ${styles[coverage]}`}>
      {titleCase(coverage.replace(/_/g, " "))}
    </span>
  );
}

function ActionPill({ action }: { action: ImprovementAction }) {
  return (
    <span className="rounded bg-sky-50 px-2 py-1 text-xs font-medium text-sky-800">
      {titleCase(action.replace(/_/g, " "))}
    </span>
  );
}

function RiskPill({ risk }: { risk: ImprovementTruthRisk }) {
  const styles = {
    low: "border-emerald-200 bg-emerald-50 text-emerald-800",
    medium: "border-amber-200 bg-amber-50 text-amber-800",
    high: "border-red-200 bg-red-50 text-red-800",
  };

  return (
    <span className={`rounded border px-2 py-1 text-xs font-medium ${styles[risk]}`}>
      Truth risk: {titleCase(risk)}
    </span>
  );
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
