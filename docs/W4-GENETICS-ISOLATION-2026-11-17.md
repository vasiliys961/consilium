# W4 — genetic consultation case isolation

Independent branch `codex/w4-genetics-case-isolation`, based on `chatgpt-dev`
`9443e67`. Does not import unmerged #86 or #87. No model/VCF engine was executed.

## Confirmed defects and changes

- Changing the selected case previously cleared questions/discussion but left
  uploaded genetic files and extracted findings from the previous case on screen.
  Case-specific local drafts now keep files, family history, question, selected
  variant and discussion together. Switching restores only the target case's draft;
  a new case has an empty genetic workspace. Upload/request/save transitions cannot
  switch case halfway through an operation. A foreign case-bound discussion is rejected.
- Drafts are saved to the selected local case and reopened without reanalysis.
  They are not completed clinical analyses or physician approvals. Unlinked
  standalone work is retained in memory while switching within the page; leaving
  unsaved standalone work still warns the doctor. Durable standalone drafts are
  not claimed.
- Result save now re-reads the latest record inside the existing case write queue.
  It appends source-bound results without replacing newer physician work or drafts.
  Duplicate saves remain idempotent; changed VCFs and closed/missing cases reject.
- A result retains the signature of the clinical facts actually submitted, even
  when newer facts arrive before saving. Old results are not relabeled as analysis
  of the new context. Legacy/standalone results without a proven input signature
  remain explicitly unverified. Follow-up model input excludes discussions of a
  different file set, while keeping those older turns in the local history.
- Same-millisecond stale workspace autosave cannot erase the new genetic draft.
  The draft appears separately in Markdown rescue export; full encrypted case
  serialization preserves the draft field without a schema migration.

## Evidence

- `npm test`: 1138 passed / 0 failed (1133 base + 5 new integration regressions).
- `npm run typecheck`: passed. Production build passed before the final
  same-timestamp guard; final PR CI verifies the full current source.
- Targeted 10 genetics tests pass: files and questions across cases A/B, foreign
  draft rejection, durable reopen, cloned mutable state, queued result/editor
  writes, original versus changed clinical context, changed VCF, closed/missing
  case, idempotency and same-timestamp autosave.
- Real in-app browser on isolated 3307: enter distinct synthetic family history
  and question in A → switch to B and verify empty inputs → enter B question →
  switch back to A and verify its original text → open A in a fresh tab and verify
  durable recovery. No upload, analysis, external search or paid model call.
- Real browser VCF upload and actual genetic inference remain NOT TESTED; hash and
  result-binding checks above are local regression tests, not clinical validation.

## Project continuation

The document package is [draft PR #87](https://github.com/vasiliys961/consilium/pull/87):
actual encrypted synthetic import, exact selected note, recovered unsaved edit,
explicit save, Word download with verified OOXML text and visible revision history.
The workspace package is [draft PR #86](https://github.com/vasiliys961/consilium/pull/86).
They remain separate from this branch and from the live Preview.

Next acceptance work: native RU/Global child-app snapshots/returns, ECGFounder and
Word using already installed adapters, integration testing of the independent
pending PRs, and cross-tab write locking. The per-case queue does not itself
establish a cross-process lock. Live model/STT tests still require cost permission.

No main/3107 or existing Preview 3207 changes; the temporary 3307 test server was
stopped. No merge, deployment, secrets or real patient data. Radiology AI and Hub
remain deferred. Gate remains IN PROGRESS, not pilot/release approval.
