# Song preparation UX audit

Scope: library entry points, add/edit preparation, lyric refresh, saving and timing
feedback; desktop and 390px mobile layouts. This is not a full playback audit.

## Implemented

| Friction | Change |
| --- | --- |
| Add and edit used different screens and controls | Both now use ImportPage, with prefilled fields and saved source in edit mode. |
| Source selection followed lyric tools even though it can supply metadata | Audio source is first, followed by song details and lyrics. |
| Multiple lyric providers competed for attention | Genius is an optional expandable alternative. |
| Catalog lookup looked like audio verification | Copy distinguishes available human timestamps from local audio comparison. |
| Async lookups could overwrite fields being edited | Form controls are disabled during an operation. |
| Leaving could silently discard edits | Unsaved indicator, discard confirmation on navigation, and reload/close protection. |
| Replacing lyrics could silently invalidate timing | Explicit reset notice and separate Save / Save & redo timings actions. |
| A failed timing run could obscure whether edits saved | Failure message explicitly states edits were saved. |
| Source changes could retain stale sync previews | Changing audio source invalidates the preview. |
| Small-screen actions competed for width | Save actions stack with full-width touch targets; library actions wrap. |

## Suggested next improvements

1. Show the selected timing candidate and its error/coverage beside a short audio
   audition. Users should be able to hear why one candidate won.
2. Add an undoable lyric/timing version history before enabling one-click bulk
   refresh. Text replacement currently rebuilds line identities and timings.
3. Offer a source-URL duplicate check when adding a song, with a direct link to
   edit the existing song instead of importing another copy.
4. Clarify browser bundle updates: current bundle imports intentionally keep
   existing songs, so importing an edited desktop copy is not a replacement flow.

## Validation

Shared-form component tests cover preview without saving, save then timing, and
new audio import. A Playwright test covers the library Edit entry, source lock,
unsaved-change protection, save, add mode, and mobile overflow. Desktop/mobile
screenshots were captured and the mobile edit layout visually inspected.
Network services are mocked in these UI tests; they do not establish live
YouTube/Genius/LRCLIB availability or timing-model accuracy.
