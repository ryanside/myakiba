# Replay coverage audit

Historical `fixed` names and harnesses remain unchanged. The optional `head` groups identify the current tests checked by the name guard and run by replay. No live regression was retired to satisfy the guard. All retained entries have HEAD coverage; there are no known uncovered retained entries.

## Remapped entries

### f74b261547a6796ae7983514763ac9932c5f5bb1 — packages/utils/src/date-only.test.ts

The normalizer was renamed; the same four date cases remain.

HEAD tests:

- `packages/utils/src/date-only.test.ts` — normalizeMfcDate with release dates as MFC prints them > "10/13/2010" becomes "2010-10-13"
- `packages/utils/src/date-only.test.ts` — normalizeMfcDate with release dates as MFC prints them > "09/18/2025" becomes "2025-09-18"
- `packages/utils/src/date-only.test.ts` — normalizeMfcDate with release dates as MFC prints them > "1/5/2012" becomes "2012-01-05"
- `packages/utils/src/date-only.test.ts` — normalizeMfcDate with release dates as MFC prints them > " 10/13/2010 " becomes "2010-10-13"

### 91743a3878280b1286152240b5071f158118258b — apps/web/src/components/onboarding/extension-step.test.tsx

The installation UX now links to the browser store; onboarding probe/reload behavior is still covered.

HEAD tests:

- `apps/web/src/components/onboarding/extension-step.test.tsx` — with no extension it links to the store listing
- `apps/web/src/components/onboarding/extension-step.test.tsx` — an extension that is too old asks for an update
- `apps/web/src/components/onboarding/extension-step.test.tsx` — a new install shows after the reload, and onboarding reopens at the extension step

### 91743a3878280b1286152240b5071f158118258b — apps/web/src/components/extension/extension-gate.test.tsx

The missing-extension gate now links to a store listing; the same entry points still gate their imports.

HEAD tests:

- `apps/web/src/components/extension/extension-gate.test.tsx` — the sync launcher's Collection option > links to the store listing instead when the extension is not installed
- `apps/web/src/components/extension/extension-gate.test.tsx` — the sync launcher's Order option > links to the store listing instead when the extension is not installed
- `apps/web/src/components/extension/extension-gate.test.tsx` — the sync launcher's MyFigureCollection CSV option > links to the store listing instead when the extension is not installed
- `apps/web/src/components/extension/extension-gate.test.tsx` — the sync launcher's Item Database option > links to the store listing instead when the extension is not installed
- `apps/web/src/components/extension/extension-gate.test.tsx` — the command palette's Collection action > links to the store listing instead when the extension is not installed
- `apps/web/src/components/extension/extension-gate.test.tsx` — the command palette's Order action > links to the store listing instead when the extension is not installed
- `apps/web/src/components/extension/extension-gate.test.tsx` — the command palette's MyFigureCollection CSV action > links to the store listing instead when the extension is not installed
- `apps/web/src/components/extension/extension-gate.test.tsx` — the command palette's Item Database action > links to the store listing instead when the extension is not installed
- `apps/web/src/components/extension/extension-gate.test.tsx` — the item sheet button > links to the store listing instead when the extension is not installed
- `apps/web/src/components/extension/extension-gate.test.tsx` — the collection sheet button > links to the store listing instead when the extension is not installed
- `apps/web/src/components/extension/extension-gate.test.tsx` — onboarding's Add to collection choice > links to the store listing instead when the extension is not installed
- `apps/web/src/components/extension/extension-gate.test.tsx` — onboarding's Create order choice > links to the store listing instead when the extension is not installed
- `apps/web/src/components/extension/extension-gate.test.tsx` — onboarding's Import MyFigureCollection CSV choice > links to the store listing instead when the extension is not installed
- `apps/web/src/components/extension/extension-gate.test.tsx` — the order page's add items > links to the store listing instead when the extension is not installed
- `apps/web/src/components/extension/extension-gate.test.tsx` — the item page's Add to collection > links to the store listing instead when the extension is not installed
- `apps/web/src/components/extension/extension-gate.test.tsx` — the item page's Create order > links to the store listing instead when the extension is not installed
- `apps/web/src/components/extension/extension-gate.test.tsx` — the item page's Add to item database > links to the store listing instead when the extension is not installed
- `apps/web/src/components/extension/extension-gate.test.tsx` — the item page's resync button > links to the store listing instead when the extension is not installed
- `apps/web/src/components/extension/extension-gate.test.tsx` — the import's retry > links to the store listing instead when the extension is not installed
- `apps/web/src/components/extension/extension-gate.test.tsx` — the settings import > links to the store listing instead when the extension is not installed
- `apps/web/src/components/extension/extension-gate.test.tsx` — the settings import's retry > links to the store listing instead when the extension is not installed
- `apps/web/src/components/extension/extension-gate.test.tsx` — a blocked onboarding choice keeps onboarding open and unfinished, so the user can go back
- `apps/web/src/components/extension/extension-gate.test.tsx` — closing the dialog keeps its copy while it closes and returns focus to the button
- `apps/web/src/components/extension/extension-gate.test.tsx` — a gated button shows it is checking and ignores a second click until the check ends

### 7bdad8ef71a55473bf6a99bd0c9bfa608b2326c7 — apps/server/src/routers/sync/routes.test.ts

Worker-era controls were removed on purpose. Durable Redis fallback polling and the other run guarantees remain covered.

HEAD tests:

- `apps/server/src/routers/sync/routes.test.ts` — an S3 timeout records the item as a persistence failure
- `apps/server/src/routers/sync/routes.test.ts` — a persistence failure after an imported item retains the partial-success message
- `apps/server/src/routers/sync/routes.test.ts` — CSV completion imports an Owned row whose Order does not exist yet
- `apps/server/src/routers/sync/routes.test.ts` — failure reporting accepts the full hourly ingest budget
- `apps/server/src/routers/sync/routes.test.ts` — polling uses durable status through a Redis blip and retries
- `apps/server/src/routers/sync/routes.test.ts` — persistence failure survives cache expiry and a changed display message
- `apps/server/src/routers/sync/routes.test.ts` — a failed history fallback preserves the original persistence error
- `apps/server/src/routers/sync/routes.test.ts` — a fetch failure cannot hide a recorded persistence failure
- `apps/server/src/routers/sync/routes.test.ts` — extension CSV cannot reuse another user's Order

Intentionally retired portions of the old expectation:

- worker-era controls leave a 180000ms-old session untouched
- worker-era controls leave a 86401000ms-old session untouched

### 8c19d2088de705335017ea933100f1f00078e19e — apps/server/src/routers/data-transfer/routes.test.ts

Both historical regressions remain live. A non-Panic database throw on a heartbeat polling read logs its error, re-sends the last status and polls again. The earlier retirement of this resilience case was incorrect and has been reversed.

HEAD tests:

- `apps/server/src/routers/data-transfer/routes.test.ts` — an S3 preparation timeout records a retryable import item failure
- `apps/server/src/routers/data-transfer/routes.test.ts` — import polling keeps its last status through a database blip and retries

### 19a50bb700da7f7b17d6bf2e3ab8f5b4ec8f0a0f — apps/server/src/routers/sync/routes.test.ts

The worker no longer imports Items. Durable persistence error classification after cache expiry remains covered in the request-driven importer.

HEAD tests:

- `apps/server/src/routers/sync/routes.test.ts` — failedBeforeStart does not label item results as persistence failures
- `apps/server/src/routers/sync/routes.test.ts` — in-request persistence failure keeps its original item reasons
- `apps/server/src/routers/sync/routes.test.ts` — interruption keeps its error after an earlier persistence failure and cache expiry
- `apps/server/src/routers/sync/routes.test.ts` — persistence failure survives cache expiry and a changed display message
- `apps/server/src/routers/sync/routes.test.ts` — display text alone cannot classify a persistence failure
- `apps/server/src/routers/sync/routes.test.ts` — a 1000-item failure batch uses one transaction and rate-limit unit
- `apps/server/src/routers/sync/routes.test.ts` — a mixed failure batch preserves imported Items and ignores a stale job

### 1f796363d6f1889c9e5916840a6ec0bb0316c51f — apps/extension/lib/fetcher.test.ts

The focus race test was renamed from storage reads to browser answers; it still asserts tab ownership at every answer.

HEAD tests:

- `apps/extension/lib/fetcher.test.ts` — the MFC tab > a focus that comes while the browser answers the extension keeps the tab open and where it was, at every answer

### a2ec7b6df36bb0bf1c5c54046048ab2066d42e83 — apps/extension/lib/fetcher.test.ts

The load invariant test moved into its own file; focused takeover tests remain in fetcher.test.ts.

HEAD tests:

- `apps/extension/lib/fetcher.test.ts` — the MFC tab > a tab the user focuses during a 70000 ms load is theirs, and the next load waits for that load to end (at once commits)
- `apps/extension/lib/fetcher.test.ts` — the MFC tab > a tab the user focuses during a 70000 ms load is theirs, and the next load waits for that load to end (Chrome-style commits)
- `apps/extension/lib/fetcher.test.ts` — the MFC tab > a tab the user focuses during a 70000 ms load is theirs, and the next load waits for that load to end (Firefox-style commits)
- `apps/extension/lib/fetcher.test.ts` — the MFC tab > a tab the user focuses during a 70000 ms load is theirs, and the next load waits for that load to end (Firefox-style, complete before it starts commits)
- `apps/extension/lib/fetcher.test.ts` — the MFC tab > a worker restarted while a load the user took over still runs waits for it to end
- `apps/extension/lib/load-invariant.test.ts` — one MFC load at a time, each 2.5 s after the last ended, and only unclaimed tabs of the extension's closed, across cancels, challenges, rate limits, stalled, redirected and dropped navigations, picture reads, claims and restarts (at once commits)
- `apps/extension/lib/load-invariant.test.ts` — one MFC load at a time, each 2.5 s after the last ended, and only unclaimed tabs of the extension's closed, across cancels, challenges, rate limits, stalled, redirected and dropped navigations, picture reads, claims and restarts (Chrome-style commits)
- `apps/extension/lib/load-invariant.test.ts` — one MFC load at a time, each 2.5 s after the last ended, and only unclaimed tabs of the extension's closed, across cancels, challenges, rate limits, stalled, redirected and dropped navigations, picture reads, claims and restarts (Firefox-style commits)
- `apps/extension/lib/load-invariant.test.ts` — one MFC load at a time, each 2.5 s after the last ended, and only unclaimed tabs of the extension's closed, across cancels, challenges, rate limits, stalled, redirected and dropped navigations, picture reads, claims and restarts (Firefox-style, complete before it starts commits)

### de69a35ba1a3c4e6a608793998d0201c9b50f343 — apps/web/src/data/item-refresh.test.tsx

The existing defect test gained an explicit safe-text assertion and was renamed.

HEAD tests:

- `apps/web/src/data/item-refresh.test.tsx` — a defect in the refresh is reported as a Panic and shows the safe text, not its message

### 1efc55df40731143af9f3bd86de7b06349424db0 — packages/utils/src/currency.test.ts

Leading/trailing-decimal forms are intentionally accepted now. All remaining malformed, precision and range rejection regressions remain covered.

HEAD tests:

- `packages/utils/src/currency.test.ts` — strict money input > rejects "12,50" for format
- `packages/utils/src/currency.test.ts` — strict money input > rejects "1.2.3" for format
- `packages/utils/src/currency.test.ts` — strict money input > rejects "1-2" for format
- `packages/utils/src/currency.test.ts` — strict money input > rejects "-5" for negative
- `packages/utils/src/currency.test.ts` — strict money input > rejects "-0" for negative
- `packages/utils/src/currency.test.ts` — strict money input > rejects "1,234.567" for precision
- `packages/utils/src/currency.test.ts` — strict money input > rejects "abc" for format
- `packages/utils/src/currency.test.ts` — strict money input > rejects "12,34" for format
- `packages/utils/src/currency.test.ts` — strict money input > rejects "1234,567" for format
- `packages/utils/src/currency.test.ts` — strict money input > rejects "1,,234" for format
- `packages/utils/src/currency.test.ts` — strict money input > rejects "1,234,56" for format
- `packages/utils/src/currency.test.ts` — strict money input > rejects "$12" for format
- `packages/utils/src/currency.test.ts` — strict money input > rejects "+5" for format
- `packages/utils/src/currency.test.ts` — strict money input > rejects "1 234" for format
- `packages/utils/src/currency.test.ts` — strict money input > rejects "1e3" for format
- `packages/utils/src/currency.test.ts` — strict money input > rejects "1.234" for precision
- `packages/utils/src/currency.test.ts` — strict money input > rejects "90071992547409.92" for unsafe_integer
- `packages/utils/src/currency.test.ts` — strict money input > rejects "9999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999" for unsafe_integer

Intentionally retired portions of the old expectation:

- strict money input > rejects ".50" for format
- strict money input > rejects "12." for format

### b0b8f82aa37e260f41f76bf178e3ae4f1b932c5f — apps/extension/lib/fetcher.test.ts

Answer-booking failures now preserve fetched pages. The same tests still cover queue progress, run completion, tab cleanup and duplicate fetches.

HEAD tests:

- `apps/extension/lib/fetcher.test.ts` — the throttle's books > when storage fails > an answer that cannot be booked keeps its fetched page, is logged, and the queue goes on
- `apps/extension/lib/fetcher.test.ts` — the throttle's books > when storage fails > an answer that cannot be booked for the only item of a run keeps its page, ends the run and closes the MFC tab
- `apps/extension/lib/fetcher.test.ts` — the throttle's books > when storage fails > an answer that cannot be booked for the last item of a run keeps its page, ends the run and closes the MFC tab

### 4b0e8dffe4c70b7fe71169dd1ebe96948adae631 — apps/extension/lib/throttle.test.ts

The storage-unavailable regression moved from the old nested fetcher suite into the throttle-turn suite.

HEAD tests:

- `apps/extension/lib/throttle.test.ts` — a throttle turn > whose books storage will not read runs on an open throttle and logs why
- `apps/extension/lib/throttle.test.ts` — a throttle turn > reads its books from storage once, however many turns it runs
- `apps/extension/lib/throttle.test.ts` — a throttle turn > whose booking storage will not write still keeps the next turn a gap after it, and logs why

### a4982e051e30ae25606de2f61be3046cf42f7c8a — apps/server/src/routers/data-transfer/routes.test.ts

Server-side extension-store review gates were removed intentionally. Unsolicited-upload protection remains covered.

HEAD tests:

- `apps/server/src/routers/data-transfer/routes.test.ts` — an upload without a current import stores no picture or catalog item

Intentionally retired portions of the old expectation:

- extension release gate > in review refuses start without writing
- extension release gate > in review refuses complete without writing
- extension release gate > in review refuses retry without writing
- extension release gate > in review refuses failure without writing
- extension release gate > in review refuses heartbeat without writing
- extension release gate > in review refuses interrupt without writing

## Retired entries

### 860b425edd00fd7c5156d0d6b2fb8ee77d7cbd29 — packages/auth/src/server.test.ts

Auth now intentionally answers success and logs provider refusal to avoid account enumeration; refusing the HTTP request is no longer the contract.

Historical names:

- send-verification-email fails when the email provider refuses the send
- request-password-reset fails when the email provider refuses the send

### a4982e051e30ae25606de2f61be3046cf42f7c8a — apps/server/src/routers/sync/routes.test.ts

Server-side store-review gates were removed intentionally; installed extensions may import and refresh regardless of store listing status.

Historical names:

- extension release gate > in review refuses item start without writing
- extension release gate > in review refuses collection start without writing
- extension release gate > in review refuses order start without writing
- extension release gate > in review refuses order-item start without writing
- extension release gate > in review refuses csv start without writing
- extension release gate > in review refuses complete without writing
- extension release gate > in review refuses retry without writing
- extension release gate > in review refuses failure without writing
- extension release gate > in review refuses heartbeat without writing
- extension release gate > in review refuses interrupt without writing

### a4982e051e30ae25606de2f61be3046cf42f7c8a — apps/server/src/routers/mfc-items/routes.test.ts

Server-side store-review gates were removed intentionally; installed extensions may import and refresh regardless of store listing status.

Historical names:

- in review refuses ingest without writing and leaves missing lookup open

### a4982e051e30ae25606de2f61be3046cf42f7c8a — apps/server/src/routers/item/resync.test.ts

Server-side store-review gates were removed intentionally; installed extensions may import and refresh regardless of store listing status.

Historical names:

- in review refuses refresh without writing and leaves refresh status open

### 7e51f393c8d0f0319a69ff8aa52822447387c420 — apps/server/src/domain/kernel.test.ts

The operation guard API was removed; compositions declare their steps and before phases instead. The replaced API cannot regress at HEAD.

Historical names:

- a second guard panics with the operation name and preserves the first guard
