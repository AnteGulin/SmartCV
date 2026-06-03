"use client";

import { Loader2, RefreshCcw } from "lucide-react";
import type { EditableTailoredSectionId } from "@/lib/types";

export type TailoredWorkspaceSection = {
  sectionId: EditableTailoredSectionId;
  title: string;
  originalText: string;
  tailoredText: string;
  badges: string[];
  warning?: string;
};

export function TailoredSectionWorkspace({
  sections,
  regeneratingSectionId,
  onRegenerateSection,
  onSectionTextChange,
}: {
  sections: TailoredWorkspaceSection[];
  regeneratingSectionId: EditableTailoredSectionId | null;
  onRegenerateSection: (sectionId: EditableTailoredSectionId) => void;
  onSectionTextChange: (sectionId: EditableTailoredSectionId, value: string) => void;
}) {
  return (
    <section className="rounded-md border border-zinc-200 bg-white p-4">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">Tailored section workspace</h2>
        <p className="mt-1 text-sm leading-6 text-zinc-600">
          Review the original CV section on the left and the tailored version on the
          right. You can edit the tailored wording directly or regenerate just that
          section with AI.
        </p>
      </div>

      <div className="space-y-4">
        {sections.map((section) => {
          const isRegenerating = regeneratingSectionId === section.sectionId;

          return (
            <article
              key={section.sectionId}
              className="rounded-md border border-zinc-200 bg-zinc-50 p-4"
            >
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-zinc-950">
                      {section.title}
                    </h3>
                    {section.badges.map((badge) => (
                      <span
                        key={`${section.sectionId}-${badge}`}
                        className="rounded bg-white px-2 py-1 text-xs font-medium text-zinc-700"
                      >
                        {badge}
                      </span>
                    ))}
                  </div>
                  <p className="text-sm leading-6 text-zinc-600">
                    Original content stays visible for comparison while you tailor the
                    section wording for this role.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onRegenerateSection(section.sectionId)}
                  disabled={isRegenerating}
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isRegenerating ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <RefreshCcw className="h-4 w-4" aria-hidden="true" />
                  )}
                  Regenerate section with AI
                </button>
              </div>

              {section.warning ? (
                <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
                  {section.warning}
                </div>
              ) : null}

              <div className="grid gap-4 xl:grid-cols-2">
                <label className="text-sm">
                  <span className="mb-2 block font-medium text-zinc-700">
                    Original section
                  </span>
                  <textarea
                    value={section.originalText}
                    readOnly
                    rows={Math.min(
                      16,
                      Math.max(6, section.originalText.split("\n").length + 1),
                    )}
                    className="w-full resize-y rounded-md border border-zinc-200 bg-white p-3 text-sm leading-6 text-zinc-700 outline-none"
                  />
                </label>

                <label className="text-sm">
                  <span className="mb-2 block font-medium text-zinc-700">
                    Tailored section
                  </span>
                  <textarea
                    value={section.tailoredText}
                    onChange={(event) =>
                      onSectionTextChange(section.sectionId, event.target.value)
                    }
                    rows={Math.min(
                      16,
                      Math.max(6, section.tailoredText.split("\n").length + 1),
                    )}
                    className="w-full resize-y rounded-md border border-zinc-200 bg-white p-3 text-sm leading-6 text-zinc-900 outline-none focus:border-emerald-600"
                  />
                </label>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
