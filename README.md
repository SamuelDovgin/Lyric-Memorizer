# Lyric Memorizer

A local rehearsal player with visible synchronized lyrics, direct line navigation, and musical returns to the passages you want to practice.

**[Read the user guide](./USER_GUIDE.md)** — also available inside the app under Guide, the player's ? button, and How to use.

## What the app does

- Plays an original recording immediately, without requiring vocal separation.
- Imports local audio, authorized direct YouTube audio, or prepared stems.
- Displays readable lyrics with line highlighting and evidence-based word highlighting.
- Lets you click lyrics/sections, search lines, and select a passage loop.
- Lets you choose whole verses, choruses, or bridges and repeat them until you decide to move on.
- Records section confidence: Needs practice (J), Getting there, or Ready (K), without interrupting the recording. Choosing another section queues the switch at the current section ending.
- Provides quiet-click or silent count-ins once beat timing is confirmed.
- Saves section confidence, positions, settings, and loops in the browser and local SQLite worker.
- Provides line timing repair, section renaming/splitting, optional stem mixing, and an in-app guide.

Hidden words, flashcards, Flip, four-grade reviews, cue stages, and the FSRS scheduler have been removed. Historical card/review data is retained as an archive and is not used as new practice evidence.

## Run locally

Requirements: Node 20+, Python 3.11+, and FFmpeg/ffprobe.

```sh
npm install
python3 -m pip install -r services/audio_worker/requirements.txt
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The local worker runs on port 8765; Vite proxies `/api` and `/media`.

### Use from your phone

Keep the Mac running with `npm run dev`, connect your phone to the same trusted Wi-Fi, and open the Network URL printed by Vite (port 5173). The web server listens on the local network; the Python worker stays on localhost and is reached through Vite's proxy. Your phone uses the same song library, with browser-specific preferences. The Mac must stay awake. This development server is for a trusted local network, not public internet hosting.

GitHub Pages alone cannot run this version: the app requires a Python API, SQLite data, and audio storage. A public deployment would need a separately hosted backend or a browser-only adaptation.

For automatic beat estimation:

```sh
python3 -m pip install -r services/audio_worker/requirements-rhythm.txt
```

For optional Demucs separation and Whisper word refinement:

```sh
python3 -m pip install -r services/audio_worker/requirements-ml.txt
```

Manual timing and beat controls work without these optional packages. Model weights download on first use. LRCLIB receives title/artist/duration for catalog timing; audio stays local. Import sources must be recordings you are authorized to use.

## Quick start

1. Add a recording and exact performed lyrics, using section headings where possible.
2. Get catalog timing or verify the lines you want to practice in Timing.
3. In Rehearse, choose a section card. The whole section starts and repeats.
4. Rate how the section feels. When ready, choose another section; ratings never move you automatically. Use Listen for ordinary playback.
5. In Settings, confirm a detected beat map or manual BPM/anchor to enable count-ins.

## Data and migration

Data defaults to `services/audio_worker/data/`; set `LYRIC_MEMORIZER_DATA_DIR` to use another directory. The version-2 migration preserves song and lyric identities, adds section occurrences and practice tables, and keeps a `lyric_memorizer.v1-backup.sqlite3` snapshot before its first migration. Existing audio assets stay in place. New feedback never derives comfort from old flashcard ratings.

Do not delete the data directory to update the app. Timing edits use revision checks, and background processing preserves newer manual edits. Browser outboxes retry unacknowledged feedback without duplicating events.

## Verification

```sh
npm run check
npx playwright install chromium
npm run test:e2e
```

The browser suite runs its own worker and web server on ports 8766/5174 with an isolated temporary database. It creates synthetic audio fixtures and checks desktop/mobile workflows, section repetition, ratings, boundary switches, saving, and the guide. It does not use the personal song library. Screenshots and traces are in `test-results/`.

For manually trying synthetic audio:

```sh
npm run demo:assets
```

Import `fixtures/demo/original.wav` with `fixtures/demo/lyrics.txt`. These tones test the transport; they are not a sung alignment benchmark.

## Scope and limits

Beat estimates need listening and confirmation. Uncertain lines remain readable but do not drive automatic practice. Precise buffered playback has a decoded-memory limit, and browser background playback depends on the device. Pitch/key changes, generated remixes, singing scores, and native mobile apps are outside this release.

The product rationale is in [REHEARSAL_PLAYER_DESIGN.md](./REHEARSAL_PLAYER_DESIGN.md). [PRODUCT_BLUEPRINT.md](./PRODUCT_BLUEPRINT.md) is the superseded historical flashcard design.

## Library playback and emoji lookup

The player has previous/next song, shuffle, and repeat controls. Repeat cycles
through off, the whole library, and the current song. With repeat off, playback
continues through the remaining playable songs and then stops. Shuffle visits
unplayed songs before starting another pass when repeat-library is enabled.
Section navigation remains available in the song map. Shuffle and repeat settings
are saved in this browser.

### Continue practice

Choose a section's **Loop** button to remember it automatically. Its library card
then shows **Continue Verse 2** (or the section's name). One click starts that
section loop at your saved position, including after reopening the app in the
same browser. Returning to ordinary listening keeps this practice bookmark;
choosing a different loop replaces it. Timing changes invalidate old bookmarks.
Regular library autoplay still starts songs normally without restoring loops.

`node scripts/emoji-candidates.mjs --file /path/to/lyrics.txt` returns deterministic
word/phrase-to-emoji candidates using the pinned MIT-licensed `emojilib` dependency.
`--stats` reports coverage. This is an offline annotation helper, not an automatic
replacement of existing pins; context-sensitive choices still need review.

## Phone player on GitHub Pages

The phone player runs entirely in the browser. No Python server or Mac connection is needed after importing songs. The Mac app keeps its existing preparation tools.

### Enable Pages

The compiled browser player is committed in `docs/`. In this repository's **Settings → Pages**, select **Deploy from a branch**, **main**, and **/docs**, then Save. The expected address is:

[https://samueldovgin.github.io/Lyric-Memorizer/](https://samueldovgin.github.io/Lyric-Memorizer/)

### Take songs to your phone

1. Run the Mac app as usual with `npm run dev`.
2. In the library, expand **Take songs to your phone**, select songs, and choose **Export selected songs**.
3. Transfer the one ZIP to your phone using AirDrop or Files. Keep it as your backup.
4. Open the Pages player. On iPhone, optionally use Safari's **Share → Add to Home Screen**, then open that app before importing so you consistently use the same storage context.
5. Choose **Import song bundle (.zip)**. Every song is added at once. Wait for **App ready offline** before disconnecting.

Audio, lyrics, timing, sections, emoji pins, and song readiness are included. Importing a song already on the device keeps its existing copy and local edits. To replace it with a newly prepared version, delete it on the phone first and import the new bundle. Export from the phone is also available. Playback position, section bookmarks, and listen counts remain device-specific and are not included in ZIP exports or synced to the Mac.

Songs use IndexedDB and survive normal closing/reopening in the same browser or home-screen app. The app requests persistent storage, but the browser decides whether to grant it. Clearing website data, private browsing, or browser storage eviction can remove songs; retain the ZIP backup. The app shell is cached by a service worker for offline reopening. App updates activate after old app tabs are closed and the player is reopened.

ZIP bundles have a 512 MB audio limit; use several smaller bundles for large libraries. Import requires temporary memory to unpack audio, so smaller bundles are preferable on phones. Audio format support and background/locked-screen playback depend on the phone's browser. YouTube downloading, automatic alignment, and vocal separation remain in the Mac app; the phone supports prepared playback and manual timing edits.

Only the player is published. ZIPs, recordings, and the local Python database are not part of the Pages output.

### Background practice and floating lyrics

Press Play, select a practice passage if desired, then minimize or switch apps. Listening uses native media playback. A practice selection is decoded once and prepared as a bounded WAV with native repeat, so background timer throttling cannot skip its loop boundary. Changing the passage may take a moment to prepare; the app retains the selected section and line range. Whole-song repeat also uses native repeat. Lock-screen media controls support playback, seeking, and song navigation where available. The OS can still interrupt playback or close the page; queue changes and listen counting require page execution.

Tap **Floating lyrics** on a song before switching apps to open a live lyrics video in picture-in-picture. It shows the current line, the next line, and the practice passage. It stays open when returning to the app’s library. Close it with the same button or the system PiP close control. This does not generate or store a separate video for each song.

PiP support is browser-dependent. In particular, [WebKit tracks unavailable PiP in iPhone/iPad Home Screen apps](https://bugs.webkit.org/show_bug.cgi?id=303885); try the site in Safari, importing your song bundle there if necessary. A phone can suspend canvas updates while backgrounded, leaving the lyrics frozen even though native audio continues. This web implementation cannot guarantee continuously updating floating lyrics on every phone. Verified locally with Chromium, including native passage repeats with JavaScript execution disabled; physical iPhone/Android behavior still needs device testing.

### Update the published player

Run `npm run build:pages`, then commit and push the source changes and regenerated `docs/` folder to `main`. Pages publishes that folder without a GitHub Actions build workflow. A normal `npm run build` continues to produce the Mac/backend-connected build in `dist/`.

Bundle integration checks: `npm run build:pages && npm run demo:assets && npx playwright test tests/e2e/bundles.spec.ts`. The tests use synthetic recordings and isolated storage, including duplicate import, saved ratings, offline reload/playback, and invalid bundle rejection.

### Vocal timing selection

**Best line sync** runs the optional local timestamped Whisper analyzer once on
an existing vocal stem (or the original recording), then compares every LRCLIB
candidate with that same evidence. `LYRIC_TIMING_MODEL` defaults to `base` for
this pass; set it to `small` for a heavier analysis. Word refinement retains its
separate `LYRIC_WHISPER_MODEL` setting. No stem generation is required.

The selector compares actual LRC entry starts with confidently matched opening
words, requiring a second nearby matching word. It does not score interpolated
line starts. Metadata/lyrics filter out mismatched records; eligible candidates
are ranked by timing alone: 55% exponentially decaying median absolute error
(scale 0.5 seconds), 30% decaying 90th-percentile error (scale 1 second), and 15%
fraction within 350 milliseconds. These are heuristics, not calibrated accuracy
probabilities. Offsets and drift are not corrected away before comparison.

Audio eligibility requires at least 50% line and token coverage, six matched
starts (or all starts for shorter lyrics), and evidence across all three thirds
of the lyric sequence. Insufficient evidence leaves saved timing unchanged.
Scores below 0.72 are rejected; differences under 0.05 produce a review notice.
Selected source metadata includes every candidate's timing diagnostics and the
method `vocal_onset_error_v2`. Human-verified lines are preserved. Import-time
metadata lookup remains available independently of this audio comparison.

This process estimates agreement with an analyzer, not verified singing onset
accuracy. Cards and other recordings still require listening validation before
claiming a measured real-world improvement.


## Forced lyric alignment (preview)

See [the implementation guide](./FORCED_ALIGNMENT_IMPLEMENTATION.md) and
[implementation/test results](./FORCED_ALIGNMENT_TEST_RESULTS.md).

Install the isolated model environment on Python 3.11 with FFmpeg available:

```sh
./scripts/setup_forced_alignment.sh
```

In **Edit song**, select **Align known lyrics to audio · preview**, choose the lyrics language,
and click **Save & redo timings**. The same selector is available in the player's settings.
A song previously processed with forced alignment remembers that method. The backend default
remains legacy until the listening benchmark is reviewed; `LYRIC_ALIGNMENT_ENGINE=forced`
can explicitly select the forced backend default.

The original recording is used first. An existing vocal stem may be tried for uncertain
passages; the engine does not create stems automatically. Verified lines remain locked.
Open **Timing** to move through flagged lines and check their entrances. The last automatic
run can be undone there while no newer lyric/timing edits have been made.

Configuration: `LYRIC_ALIGNMENT_PYTHON` overrides the isolated Python executable;
`LYRIC_FORCED_MODEL` defaults to `small`; `LYRIC_FORCED_RETRY_MODEL` optionally tries a larger
model on uncertain passages; `LYRIC_FORCED_DEVICE` defaults to `cpu`;
`LYRIC_FORCED_TIMEOUT_SECONDS` defaults to 1800. Models use Whisper's cache (normally
`~/.cache/whisper`). Model weights download on first use. No recording upload is required.
The core dependencies are pinned in `services/audio_worker/requirements-forced.txt`.

Snapshots, raw candidates, and logs live under `services/audio_worker/data/alignment-runs/`.
Inference cache entries include recording content, lyric text, clip boundaries, model and
configuration. These files are local and excluded from Git.

Run model benchmarks without changing saved songs:

```sh
python3 scripts/benchmark_alignment.py --song-id YOUR_SONG_ID
```

Each benchmark exports `human-labels.json` with blank onset ranges. After checking the actual
recording, fill `startMin`, `startMax`, and `humanReviewed`. Measure results or rerun with those
lines held out from reference input:

```sh
python3 scripts/benchmark_alignment.py --evaluate /path/to/candidate.json --baseline /path/to/before.json --labels /path/to/human-labels.json
python3 scripts/benchmark_alignment.py --song-id YOUR_SONG_ID --labels /path/to/human-labels.json
```

Do not interpret supported-line counts or model scores as measured synchronization accuracy.
Without human onset labels, the benchmark explicitly reports `pending_human_review`.
