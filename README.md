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
