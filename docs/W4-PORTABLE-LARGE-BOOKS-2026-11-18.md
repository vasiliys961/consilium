# W4 — large-book transfer and case portability acceptance

18 November 2026. [Draft PR #95](https://github.com/vasiliys961/consilium/pull/95), stacked on #94/#93/#92, target `chatgpt-dev`. Runtime `9baa28221ad9b01d5c49ec7b94248da0feecc54c`. No merge or paid calls.

## Changes

- Single-book archives now support originals up to the same **250 MiB** limit as book import, replacing the incompatible 64 MiB transfer limit. Existing V1 archives remain readable. The metadata/index bound remains 32 MiB and 25,000 chunks; very large indexes can still require separate volumes.
- Full-file standard SHA-256 is read in 1 MiB slices using pinned `@noble/hashes` 2.4.0. This bounds hashing input buffers, **not** total PDF parsing, indexing, Blob storage or browser RAM. The library has no runtime dependencies; see the [upstream partial-update API](https://github.com/paulmillr/noble-hashes#usage). Encryption of case files remains the existing Web Crypto implementation.
- Large file import now also receives a complete fingerprint. A renamed copy of the same original can be deduplicated after transfer. The original, page text, OCR and text vectors retain their existing archive representation. Visual indexes remain explicitly rebuildable, not falsely transferred.
- Archive export/restore show progress and accept cancellation. Restore still verifies the complete original before the existing single IndexedDB transaction; cancellation does not persist a partial book. PDF import also checks cancellation between pages and before persistence.
- Export UI is keyed to the current case; an asynchronous export completing after navigation cannot present/download a previous case's file. Prepared URLs are revoked on unmount. No new permission dialogs were added.
- New book transfer controls/messages are localized in all ten interface languages. Some legacy case-archive labels/errors and library storage details still appear in Russian in English UI; this acceptance does not claim complete interface localization.

## Executed checks

- Full suite: **1169 passed, 0 failed**. Production build including TypeScript passed on the final code; targeted hash/language tests also pass.
- Independent standard SHA-256 checks at empty/padding/chunk boundaries; virtual 250 MiB original, 250 reads, maximum 1 MiB per read, no whole-file `arrayBuffer`.
- Physical 65 MiB source exported/restored with searchable page 809, exact full fingerprint and renamed-file deduplication. This automated source fixture tests archive storage, not PDF parsing or clinical content.
- Altered tail, changed metadata, truncation, missing source and unsupported file formats reject before writes. Cancellation leaves original records intact and creates no partial restoration.
- CI for runtime: [core](https://github.com/vasiliys961/consilium/actions/runs/44355391499) and [Radiology integration](https://github.com/vasiliys961/consilium/actions/runs/44355391938): **success**.

## Actual browser acceptance on installed 3207

1. Uploaded a synthetic `.doctor-opus-book` containing a 65 MiB TXT original and two verified page fragments. Restore completed; one book was listed, size 65 MB.
2. A local search for `Synthetic transfer sentinel kidney clearance verification` retrieved the expected text on page 2. No model-answer button was used.
3. `Save book archive` downloaded the archive. It matches the uploaded archive **byte for byte**: 68,158,188 bytes; SHA-256 `fe7eed45827fd34cfef962c5f618eb1b74d5f792f412e55af4e3b5696700ec9e`.
4. Reimporting the downloaded archive reported an existing book; count remained 1. Reload retained the book.
5. Exported the existing synthetic Copilot case to its encrypted single-case file. Wrong password was rejected with the case count unchanged. Correct password plus collision-copy handling created a separate case; original was not replaced.
6. Reopened the copy: one source file, the earlier saved clinical analysis and the RU clinical note were present. Renamed only the copy to `SYNTHETIC · Transfer acceptance · не пациент`; saved/reloaded it and verified the analysis and note remain. Note-editor link uses the **copy's** case ID.

Local acceptance artifacts (synthetic only): `/private/tmp/doctor-opus-large-book-acceptance/`; downloaded archives in the owner's Downloads. Test book and copy remain clearly named in Preview; no real cases/books were deleted. These browser tests do not establish clinical validity, large scanned-PDF OCR performance, camera/hardware compatibility, or a successful new provider analysis.

## Installed state and continuation

Preview: `/Users/maxmobiles.ru/Documents/Consilium-Preview`, branch `chatgpt/codex-w4-large-books-live-20261118`, runtime above. Dependency installed with OpenRouter-only Node preload; preflight passes. Existing generated Radiology `next-env.d.ts` change preserved. Main/3107, original apps/configuration and real owner case remain unchanged.

Next: reuse and integrate the already implemented independent #86 (case/draft continuity), #87 (protocol/editor/Word continuity), #88 (genetics case isolation) in a new development branch; review conflicts with the newer Copilot atomic persistence rather than replacing it. Then perform module-specific browser acceptance for ECG, ultrasound, genetics, guidelines and DICOM series. New paid inference still needs a separate allowance. G-WORKSTATION is **IN PROGRESS**; Hub remains separate and deferred.
