# SmartCV

A Next.js MVP for evidence-based CV tailoring.

It lets you:

- Paste a CV
- Upload an existing CV PDF and extract its text
- Preview the first PDF page as an image
- Paste or fetch a job description URL
- Analyze ATS readability signals
- Map job requirements to real CV evidence
- Edit the original CV as a whole document or section by section
- Edit suggested CV rewrites section by section
- Review job-specific suggestions for meaningful additions
- Build a final editable text draft

## Run Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## OpenAI Setup

The app works without an API key using the local heuristic analyzer.

For deeper rewriting, create `.env.local`:

```bash
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-5.4-mini
```

The model defaults to `gpt-5.4-mini`, which is meant to keep the MVP fast and lower cost. Use `gpt-5.5` if you want the strongest analysis and your account has access.

## Important Guardrail

The analyzer is designed to rewrite only from evidence already present in the CV. Missing requirements are shown as gaps instead of being silently invented.
