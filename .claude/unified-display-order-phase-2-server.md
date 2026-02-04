# Phase 2: Server + Versioning + Sync

## Sheet Versioning
- Each sheet maintains a `version` number (integer).
- Initialize `version = 0` when the server starts.
- Increment `version` on every accepted change to the sheet.
- Track `version` per sheet on the server (not global).

## Client Actions
- Every client action sent to the server includes `sheetVersion`.
- If `sheetVersion` is less than the server's current `version`, discard the action.
- If accepted, apply the change, increment `version`, and broadcast the updated sheet.

## Recommended Rejection Handling
- When discarding an action, send a response that triggers client resync:
  - Either send the latest sheet state + version.
  - Or send a `reject` message that prompts a fetch.
- Avoid silent drops; the client should not appear to accept a change that was discarded.

## Ordering Updates
- Reorder operations should be applied on the server as the source of truth.
- After recomputing `sort` for all items, broadcast the updated sheet.

## Persistence Notes
- If sheet data is persisted, include the new `sort` fields and `headings` list.
- If `version` is not persisted, ensure clients always receive the server's current `version` after reconnect.
