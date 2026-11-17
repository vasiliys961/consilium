# C11 — Radiology Preview: approved frames and one-frame Gemini test

17 November 2026. Applies only to the isolated \`chatgpt-dev\` Preview at 3207/3210. Does not modify the Codex main instance at 3107/3110 or the standalone Radiology on Desktop.

## Root cause
The UI could display correctly and decode DICOM while \`/api/ai/deidentified-openrouter-review\` returned \`configurationStatus=not-approved\`. A provider key was present but **clinical-image cloud processing had not been approved**. The disabled submit button accurately prevented release; a checkbox alone cannot grant server permission.

## Administrator's one-time action
1. Verify provider terms, local data-processing authority, origin/provenance, and that test data are synthetic or expressly approved and de-identified. This script is not legal approval.
2. In a clean \`chatgpt-dev\` checkout, with **only Preview 3207 stopped**, run:
   \`npm run approve:radiology:preview\`
3. Read the prompt and type \`РАЗРЕШАЮ\` only if these conditions are satisfied. The script edits only 3 settings in \`integrations/radiology/web/.env.local\` using an atomic, mode-0600 replacement; it never changes keys or uploads images. It **does not** enable \`RADIOLOGY_ENABLE_AUTOMATIC_PUBLIC_VOLUME_RESEARCH\`.
4. Start \`npm run dev:preview\` again (ensure the old 3210 child was stopped). GET \`http://127.0.0.1:3210/api/ai/deidentified-openrouter-review\`; expect \`enabled=true\`, \`workstationConnected=true\`. If not, inspect the **non-sensitive** \`configurationStatus\`. Do not paste tokens or patient data in logs.

This opt-in is for **individually reviewed PNG frames** only. Patient image content requires verified lawful disclosure and physician verification of both metadata and pixels. Raw DICOM, identifiers and unchecked automatic whole-volume uploads are not authorized.

## One paid frame smoke test (only after local consent)
1. Use a synthetic or approved, fully de-identified **CT or MR** DICOM series. In Review analysis choose **Тест одного среза · один платный Gemini без Argon/Opus**.
2. Choose precisely one source slice; confirm the exact pixel copy, OCR markings and clinical text. If extra windows or batches create more than one outgoing frame, the code refuses transmission. One physician click releases only the checked frame.
3. Expected: one call to \`approved-volume-gemini-batch\` with one image. The response is saved as observations for that frame; no automatic Argon/Opus call or retry. One-slice findings cannot be described as a full-study diagnosis.
4. Record response success/failure and estimated token expense; actual billing must be checked with OpenRouter. A failing call does not certify zero billing.

CI tests cover the session status text, optional reviewed pilot guard, explicit consent serialization and source-only frame restrictions. Browser image review, approval, server environment, an actual billed provider response and preserving the user's case require a separate manual acceptance check.
