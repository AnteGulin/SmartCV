"use client";

import {
  getConfirmationPrompt,
  getDefaultUserEvidenceType,
} from "@/lib/user-evidence";
import type {
  EvidenceStatus,
  JobRequirement,
  UserConfirmedEvidence,
  UserEvidenceType,
} from "@/lib/types";

export type ConfirmationDraft = {
  evidenceType: UserEvidenceType;
  text: string;
};

export function EvidenceConfirmationPanel({
  requirements,
  confirmedEvidence,
  drafts,
  isAnalyzing,
  onDraftChange,
  onRemove,
  onRunAnalysis,
  onSave,
}: {
  requirements: JobRequirement[];
  confirmedEvidence: UserConfirmedEvidence[];
  drafts: Record<string, ConfirmationDraft>;
  isAnalyzing: boolean;
  onDraftChange: (requirementFingerprint: string, nextDraft: ConfirmationDraft) => void;
  onRemove: (requirementFingerprint: string) => void;
  onRunAnalysis: () => void;
  onSave: (
    requirementId: string | undefined,
    requirementText: string,
    evidenceType: UserEvidenceType,
    text: string,
  ) => void;
}) {
  const pendingRequirements = requirements.filter(
    (requirement) => requirement.evidenceStatus !== "supported",
  );

  return (
    <section className="rounded-md border border-zinc-200 bg-white p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Needs confirmation</h2>
          <p className="mt-1 text-sm leading-6 text-zinc-600">
            Add factual evidence only if it is true and you are comfortable
            including it in an application. This does not change your CV yet.
          </p>
        </div>
        <button
          type="button"
          onClick={onRunAnalysis}
          disabled={isAnalyzing}
          className="inline-flex h-9 items-center rounded-md border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Re-run analysis
        </button>
      </div>

      <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm leading-6 text-emerald-900">
        This evidence is not yet in your CV. Later, SmartCV can use it to suggest
        truthful edits.
      </div>

      {pendingRequirements.length ? (
        <div className="space-y-4">
          {pendingRequirements.map((requirement) => {
            const savedConfirmation = confirmedEvidence.find(
              (item) => item.requirementFingerprint === requirement.fingerprint,
            );
            const draft =
              drafts[requirement.fingerprint] ??
              (savedConfirmation
                ? {
                    evidenceType: savedConfirmation.evidenceType,
                    text: savedConfirmation.text,
                  }
                : {
                    evidenceType: getDefaultUserEvidenceType(requirement),
                    text: "",
                  });
            const currentSource = requirement.matchedEvidence[0]?.evidenceSource;

            return (
              <article
                key={requirement.id}
                className="rounded-md border border-zinc-200 bg-zinc-50 p-4"
              >
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div className="max-w-4xl">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <StatusPill status={requirement.evidenceStatus} />
                      <span className="rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-700">
                        {titleCase(requirement.category.replace(/_/g, " "))}
                      </span>
                    </div>
                    <h3 className="text-base font-semibold text-zinc-950">
                      {requirement.text}
                    </h3>
                    <p className="mt-1 text-sm leading-6 text-zinc-600">
                      {getConfirmationPrompt(requirement)}
                    </p>
                  </div>
                  <div className="text-right text-xs text-zinc-500">
                    {currentSource === "user_confirmed" ? (
                      <span className="rounded bg-sky-50 px-2 py-1 font-medium text-sky-800">
                        Currently matched with user confirmation
                      </span>
                    ) : savedConfirmation ? (
                      <span className="rounded bg-amber-50 px-2 py-1 font-medium text-amber-800">
                        Saved confirmation pending re-analysis
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)]">
                  <label className="text-sm">
                    <span className="mb-2 block font-medium text-zinc-700">
                      Evidence type
                    </span>
                    <select
                      value={draft.evidenceType}
                      onChange={(event) =>
                        onDraftChange(requirement.fingerprint, {
                          ...draft,
                          evidenceType: event.target.value as UserEvidenceType,
                        })
                      }
                      className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-emerald-600"
                    >
                      {USER_EVIDENCE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm">
                    <span className="mb-2 block font-medium text-zinc-700">
                      Factual evidence
                    </span>
                    <textarea
                      value={draft.text}
                      onChange={(event) =>
                        onDraftChange(requirement.fingerprint, {
                          ...draft,
                          text: event.target.value,
                        })
                      }
                      rows={4}
                      placeholder="Only add this if it is true and specific."
                      className="w-full resize-y rounded-md border border-zinc-200 bg-white p-3 text-sm leading-6 outline-none focus:border-emerald-600"
                    />
                  </label>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      onSave(
                        requirement.id,
                        requirement.text,
                        draft.evidenceType,
                        draft.text,
                      )
                    }
                    disabled={!draft.text.trim()}
                    className="inline-flex h-9 items-center rounded-md bg-zinc-950 px-3 text-sm font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
                  >
                    {savedConfirmation ? "Update evidence" : "Save evidence"}
                  </button>
                  {savedConfirmation ? (
                    <button
                      type="button"
                      onClick={() => onRemove(requirement.fingerprint)}
                      className="inline-flex h-9 items-center rounded-md border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-zinc-300 bg-zinc-50 p-5 text-sm leading-6 text-zinc-600">
          No current weak, missing, or blocked requirements need confirmation.
        </div>
      )}
    </section>
  );
}

const USER_EVIDENCE_OPTIONS: { value: UserEvidenceType; label: string }[] = [
  { value: "experience", label: "Experience" },
  { value: "tool", label: "Tool" },
  { value: "skill", label: "Skill" },
  { value: "certification", label: "Certification / license" },
  { value: "education", label: "Education" },
  { value: "language", label: "Language" },
  { value: "work_authorization", label: "Work authorization" },
  { value: "location", label: "Location" },
  { value: "availability", label: "Availability" },
  { value: "other", label: "Other" },
];

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

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
