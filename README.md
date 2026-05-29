# SmartCV

SmartCV is a Next.js app for truthful, evidence-based CV tailoring.

It analyzes a master CV against a job posting, maps each requirement to real evidence, lets the user add clearly labeled factual confirmations, generates a deterministic tailored draft, optionally polishes eligible wording with OpenAI under strict validation, and supports audited export to TXT, DOCX, or Print / Save PDF.

## What SmartCV Does

- Parses a pasted CV or uploaded PDF CV into editable text
- Accepts pasted job text or fetches a public job page URL
- Extracts candidate facts from the CV and requirements from the job posting
- Classifies requirements as `supported`, `weak`, `missing`, or `blocked`
- Flags ATS hygiene issues such as missing sections, unreadable formatting, or suspicious stuffing
- Lets users add truthful user-confirmed evidence for weak, missing, or blocked requirements
- Generates a deterministic tailored draft from supported evidence only
- Shows draft audit and traceability:
  - source evidence
  - linked requirements
  - deterministic vs polished wording
  - copy/export inclusion or exclusion reasons
- Exports the safe included draft content to:
  - TXT
  - DOCX
  - Print / Save PDF

## Truth-Preserving Approach

SmartCV is designed to avoid inventing experience.

- Missing and blocked requirements are shown as gaps, not turned into claims.
- User-confirmed evidence is stored and labeled separately from the original CV.
- Deterministic local analysis and validation remain the source of truth.
- OpenAI is optional and limited to:
  - requirement extraction assistance
  - wording polish for already-safe eligible draft bullets
- OpenAI is not the truth judge.
- Hidden text, white text, invisible keywords, keyword stuffing, and other deceptive ATS tricks are not supported.

SmartCV can help you tailor truthfully. It cannot guarantee an ATS pass or hiring outcome.

## Privacy Notes

- CV text, job text, confirmations, and workspace state may be stored in this browser's `localStorage` so the workspace can persist between refreshes.
- Use **Clear** in the app to remove saved local workspace data.
- OpenAI is only used server-side when configured.
- SmartCV does not require OpenAI to analyze, draft, audit, or export.

## OpenAI Configuration

SmartCV works without an API key. When no OpenAI key is configured, it falls back to deterministic local analysis and keeps wording deterministic.

Create `.env.local` if you want server-side OpenAI assistance:

```bash
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-5.4-mini
```

- `OPENAI_MODEL` is optional.
- The default model is `gpt-5.4-mini`.
- OpenAI is never called directly from the browser.

## Run Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Useful Commands

```bash
npm run lint
npm run build
npm audit
```

## Typical Workflow

1. Upload or paste the master CV.
2. Paste job text or fetch a public job page.
3. Run analysis.
4. Review the requirement/evidence map and ATS warnings.
5. Add truthful confirmations for weak, missing, or blocked requirements if needed.
6. Re-run analysis.
7. Generate the deterministic tailored draft.
8. Optionally polish eligible wording with OpenAI if configured.
9. Audit the draft and review before/after traceability.
10. Export the safe included content.

## Export Behavior

- TXT export matches the validated copy-ready draft text.
- DOCX export is generated server-side from recomputed and revalidated content.
- Print / Save PDF uses the export preview and print styles.
- Review notes, dropped items, user-confirmed-only review items, and unsupported claims are excluded from default export content.
- Blocked drafts require acknowledgement before file export or copy of the validated draft.

## Limitations

- SmartCV does not rewrite unsupported experience into the CV.
- User-confirmed evidence is not automatically treated as original CV evidence.
- Only PDF CV upload is supported in the parser flow.
- Print / Save PDF depends on browser print behavior.
- The app is optimized for simple, ATS-readable output rather than visual resume templates.
