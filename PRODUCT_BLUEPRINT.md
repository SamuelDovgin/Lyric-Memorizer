# Lyric Memorizer: Product and Implementation Blueprint

> **Superseded direction — September 5, 2026:** [Adaptive Rehearsal Player Design](./REHEARSAL_PLAYER_DESIGN.md) is the proposed replacement specification. Its visible-lyric playback and passage practice replace this document's hidden-word, flashcard, vocal-dropout testing, and FSRS requirements. The blueprint below is retained as historical context, not a requirement to preserve those features.

**Status:** implementation guide  
**Working product name:** Lyric Memorizer  
**Last updated:** August 30, 2026  
**Primary target:** phone app, proven first as a local desktop/web prototype

## 1. Executive summary

Lyric Memorizer is a music-first training app for learning songs well enough to perform them without reading lyrics or depending on the original singer.

The core interaction is simple:

> Keep the music. Remove the answer.

The original song plays with large, synchronized lyrics. A card supplies the prior line or part of the current line, then hides selected target words while their lead-vocal spans drop out and the instrumental continues. The question loops until the learner flips it. The complete lyric then appears and the original singer immediately performs the answer on a loop until the learner rates it **Again**, **Hard**, **Good**, or **Easy**. The app schedules that specific weakness for another attempt at the right time.

This is more than karaoke with hidden words and more than Anki with lyric cards. It combines:

- The real song as the retrieval cue.
- Two-stem vocal separation for selective vocal dropout.
- Word-level lyric timing with explicit confidence and manual correction.
- Adaptive visual cues that fade as memory improves.
- Spaced repetition for phrases, transitions, section openings, and complete sections.
- Direct section practice for immediate “I need to fix the bridge” use.
- A performance mode that tests the exact conditions a singer cares about.

The first version will be local-first. The user imports an audio file they are authorized to use and pastes the exact performed lyrics. No paid transcription or lyrics API is required. Voice-recognition scoring is deliberately deferred; user ratings, hint use, reveal use, latency, and replay behavior provide enough useful evidence for the initial memory engine.

## 2. Product thesis

Listening, recognition, prompted recall, sequential recall, and performance recall are different states.

A person can feel that they know a song because every line looks familiar while it plays, yet still be unable to:

- Start Verse 2 without singing from the beginning.
- Remember which nearly identical lyric belongs in which chorus.
- Enter correctly after an instrumental transition.
- Continue after a mistake.
- Perform over an instrumental without the original singer.
- Recall the song again two weeks later.

The product should diagnose and train those failures separately.

The defensible part of the product is therefore not source separation alone, word hiding alone, or spaced repetition alone. It is the learner model that determines:

1. **What** is weak: a word, phrase, line, transition, section opening, or section.
2. **Why** it is weak: exact wording, sequence, insufficient musical context, dependence on the singer, or decay over time.
3. **When** it should return.
4. **How much help** the next attempt should provide.

## 3. Evidence translated into product rules

This is a learning product, so the memory claims should stay modest and traceable.

| Evidence | Product rule |
| --- | --- |
| Retrieval practice improves delayed retention more than repeated study, even when study feels more fluent. | Require an attempt before reveal; do not count passive listening as mastery. |
| Distributed practice reliably improves later recall. | Schedule weak material across sessions and days instead of encouraging one long cram session. |
| A direct song-learning experiment found better lyric retention after spaced rather than massed practice. | Schedule song material itself, not only generic vocabulary cards. |
| Successive relearning combines retrieval to criterion with additional spaced sessions. | “Mastered” requires successful recall on separate days, not one perfect run. |
| Music supplies rhythm, melody, phrasing, and transition cues. | Preserve accompaniment during the default recall task. |
| Familiarity can be mistaken for recall. | Show exposure separately from demonstrated recall. |
| Sequence memory and item memory can fail independently. | Track words, transitions, and section starts as separate practice objects. |

Primary background sources:

- Roediger and Karpicke, [Test-Enhanced Learning: Taking Memory Tests Improves Long-Term Retention](https://journals.sagepub.com/doi/10.1111/j.1467-9280.2006.01693.x).
- Cepeda et al., [Distributed practice in verbal recall tasks: A review and quantitative synthesis](https://pubmed.ncbi.nlm.nih.gov/16719566/).
- Simmons, [Optimizing song retention through the spacing effect](https://pmc.ncbi.nlm.nih.gov/articles/PMC8665960/).
- Rawson and Dunlosky, [Successive Relearning: An Underexplored but Potent Technique for Obtaining and Maintaining Knowledge](https://www.psychologicalscience.org/journals/current-directions/09637214221100484/).

These sources support the broad learning loop. They do not prove that every proposed cue, score, animation, or scheduling heuristic is optimal. Product analytics and user testing still need to validate those details.

## 4. Product principles

### 4.1 The song is the flashcard

The user should experience a continuous musical performance, not a stack of disconnected text prompts. A practice item includes musical lead-in, a retrieval window, feedback, and a brief rating.

### 4.2 The accompaniment is a legitimate cue

Default mastery means the learner can sing with the instrumental and no visible words. It does not require silence. True free recall is a separate, harder test.

### 4.3 Attempt before answer

Hints are allowed, but the learner should first have a chance to retrieve. Reveal should never be the default first action.

### 4.4 Confidence must be visible

Automatic word timing will be imperfect, especially with singing, harmony, ad-libs, elongated vowels, mixed languages, and repeated sections. The app should mark uncertain timing, explain why it is uncertain, and make correction fast.

### 4.5 Smart by default, controllable when needed

Most users should tap **Smart Practice**. A singer who already knows the bridge is the problem should be able to tap **Bridge** and begin within seconds.

### 4.6 Increase one difficulty dimension at a time

Do not remove the lyric, shorten the lead-in, remove the instrumental, and enlarge the tested chunk simultaneously. Change one variable so failure is interpretable.

### 4.7 The app measures evidence, not confidence theater

A global “92% learned” number is not enough. The app should show words, sequence, independence, and durability separately, with a clear explanation of weak areas.

### 4.8 Local-first is both a product feature and a risk reduction

The prototype should process and store imported audio and lyric text locally. It avoids paid API cost, protects private recordings, and avoids building the first version around third-party catalog access.

## 5. Users and jobs to be done

### Primary users

- A vocalist preparing one song for rehearsal or performance.
- A musician maintaining a large cover repertoire.
- A casual listener who wants to know favorite songs completely.
- A language learner who already has accurate lyrics and wants musical recall support.
- A choir, theater, or worship performer with a deadline and assigned material.

### Core jobs

- “Help me learn this new song without reading it forever.”
- “I know most of it; help me find and fix the exact weak places.”
- “Make sure I still know my repertoire next month.”
- “Test whether I can enter at any section and recover from a blank.”
- “Let me practice over the instrumental without manually editing audio.”

## 6. Scope decisions

### Locked for the first complete product

- User imports an audio file.
- User pastes and confirms the exact performed lyrics.
- Two stems: vocals and accompaniment.
- Word-level timestamps with confidence.
- A manual timing review/correction screen.
- Apple Music/Spotify-inspired lyric presentation without copying either product.
- Vocal dropout during selected phrases.
- Timed visual blank cues.
- Answer reveal and “hear the singer” feedback.
- Again / Hard / Good / Easy self-rating.
- Automatic due practice plus direct song/section/line practice.
- Local persistence and local processing.
- Desktop prototype before native phone work.

### Explicitly deferred

- Automatic scoring of what the user sings.
- Microphone transcription or pronunciation judgment.
- A licensed commercial lyrics catalog.
- Ingesting or modifying Spotify/Apple Music streams.
- Social accounts, sharing, teachers, and bands.
- Cloud synchronization.
- Android and iOS native apps at the same time.
- Generative AI as a dependency for core practice.

### Optional soon after the core works

- Emoji cue layer.
- Meaning/story notes.
- First-letter and word-shape cues.
- Reverse chaining.
- Random dropout performance mode.
- Set lists, deadlines, and maintenance goals.

### Confirmed learning-system decision: Anki-style testing is required

The product will use an Anki-style retrieval-and-rating loop as a core requirement, not an optional mode. A card contains both **context that is supplied** and a **target that must be recalled**:

```text
prior line or visible part of the target line plays as context
→ selected target words are visually hidden and their vocal audio drops out
→ the prompt region loops while the learner attempts the target
→ learner flips the card
→ the complete target lyric is revealed
→ the original singer immediately performs the answer
→ the answer region continues looping
→ learner chooses Again / Hard / Good / Easy
→ the answer loop stops and the next card begins
→ the rating determines when that exact memory object returns
```

Early cards should normally hide only part of a line. Supported card shapes include:

- A few missing words inside an otherwise visible/audible line.
- The beginning of the line supplied, with the remainder hidden.
- The beginning hidden, followed by a supplied continuation.
- A difficult phrase hidden with the words before and after it supplied.
- A complete line hidden after the prior line is supplied.
- Multiple connected lines hidden as the learner advances.

For supplied words, the lyric remains visible and the original vocal can remain audible. For tested words, the lyric is masked and the vocal stem is muted while accompaniment continues. This requires a time-varying vocal gain envelope within a line, not only one mute window for the complete line.

The scheduler will use an FSRS implementation rather than fixed hand-written intervals. Broadly:

- **Again:** failed recall; repeat later in the current session and schedule a short follow-up.
- **Hard:** successful but hesitant recall; schedule sooner than Good.
- **Good:** successful recall with some effort; use the normal calculated interval.
- **Easy:** immediate, confident recall; use a substantially longer interval.

The precise interval is calculated from the complete review history, not a universal mapping such as “Good always means three days.” The same Good rating can produce different intervals for a new line and a line recalled successfully for several months.

The rating also supplies evidence for the next test presentation:

- **Again:** add one cue level or more context.
- **Hard:** retain approximately the same cue level.
- **Good or Easy:** become eligible to remove at most one cue level only when the attempt qualifies: the learner tried before Flip, used no word hint, and did not request an extra five-pass Replay block.

Thus, FSRS/Anki-style scheduling decides **when** to replay the item, while the separate adaptive question composer decides **which words or lines to hide**. The scheduler should follow established FSRS behavior rather than inventing fixed Again/Hard/Good/Easy intervals. Question difficulty should be derived from accumulated performance across related cards, not changed recklessly from a single rating.

User behavior supplements but does not replace the four-button grade. If the learner used multiple hints or revealed the answer and then selected Easy, the review still stores Easy as the user's judgment, but the cue policy should not immediately remove large amounts of support. Keeping the raw rating and behavioral evidence separate makes the system understandable and adjustable.

### Product decisions still open for refinement

These remaining questions affect the feel of the app enough that they should be decided with an interaction prototype rather than silently assumed:

1. **Manual mastery:** whether a user can declare a line mastered. Current recommendation: allow “I know this” to skip acquisition and lower priority, while FSRS review evidence determines long-term strength.
2. **Daily session goal:** fixed minutes, fixed due-item count, or “finish everything due.” Current recommendation: show an estimated-time goal and let the user stop without punishing a streak.
3. **Target retention:** the default recall probability used by FSRS. Current recommendation: begin near 90%, then test whether performers with deadlines prefer a higher target.

### Confirmed question-loop timing

The first question pass supplies the selected context: normally the prior line, a musical lead-in, or the visible opening of the target line. Later passes do not replay the prior line.

```text
Pass 1: prior context → target line with selected words hidden/muted
Pass 2: target line only
Pass 3: target line only
Pass 4: target line only
Pass 5: target line only
Then: automatic pause + Replay + Flip
```

After the fifth unanswered pass, playback pauses automatically. **Replay** begins another target-only block of up to five passes; it does not replay the prior context unless the user explicitly restarts the complete card. **Flip** remains available throughout. This specification interprets the requested “replace button” as **Replay**; rename it if a different action was intended.

The five question passes together are one card presentation and produce one FSRS review only after rating. Loop count is behavioral evidence, not five successful retrievals.

The remaining open product-experience choices do not block the audio-processing or lyric-alignment architecture.

## 7. The core learning loop

1. The app plays the prior line or a supplied portion of the current line.
2. Supplied words remain visible and may retain the original singer.
3. Tested words become blanks/clouded masks and the vocal stem drops out only over those word spans; accompaniment continues.
4. Timed masks animate through the target.
5. The first pass includes prior context; subsequent passes loop only the target line or phrase.
6. After five unanswered passes, playback pauses and offers **Replay** or **Flip**. Replay starts another target-only block.
7. The learner requests word hints if needed, then taps **Flip** when ready.
8. The complete lyric appears immediately.
9. The original singer immediately performs the tested line/phrase.
10. The answer region repeats with full vocals until the learner rates the card.
11. The learner selects **Again**, **Hard**, **Good**, or **Easy**.
12. The answer loop stops, the scheduler records the review, and the next card begins.

### Rating semantics

| Rating | User meaning | Scheduling effect | Cue effect |
| --- | --- | --- | --- |
| Again | I could not retrieve it correctly. | Return soon. | Increase support one level. |
| Hard | I got it, but only with hesitation or major effort. | Short interval. | Keep support level. |
| Good | Correct with reasonable effort. | Normal interval. | Reduce one support level when evidence permits. |
| Easy | Immediate and effortless. | Long interval. | Reduce support or enlarge the chunk. |

Hard is a pass. A failed attempt should be Again, even if the answer looked obvious after reveal.

### Card states

```text
QUESTION
context + muted/clouded target once → target-only loop up to pass 5
→ pause with Replay / Flip

ANSWER
complete text + complete original vocal → loop until rating

ADVANCE
record rating → stop loop → load next due card
```

The Flip action is distinct from Hint. Revealing one word does not flip the whole card.

### Behavior the app records without voice recognition

- Whether and when a hint was requested.
- Strongest hint required.
- Whether Reveal was used.
- Number of question-loop repetitions before Flip.
- Number of answer-loop repetitions before rating.
- Time from target onset to first action.
- Whether the user restarted the clip.
- User rating.
- Cue level, vocal support, context length, and tested chunk size.
- Time since the prior review.

These signals should inform the next cue choice, but the app should not secretly overwrite a user's rating. Store raw evidence and the scheduling decision separately so the behavior remains auditable.

## 8. Cue system

Visual and musical support are separate axes.

### 8.1 Visual cue ladder

From most to least supportive:

1. Full synchronized lyric.
2. A few selected words hidden with the rest of the line visible.
3. A clouded/blurred word mask that can be individually uncovered.
4. First phrase visible with the remainder blanked.
5. First word plus blanks.
6. Initial letters.
7. Approximate word-length blanks.
8. Equal-width word-count blanks.
9. Timed blanks with no letters.
10. Emoji/meaning landmarks plus blanks.
11. No visual lyric.

This is a toolbox rather than a rigid universal ladder. A user may respond better to initials than to word shape, and emoji cues are useful only when the association is meaningful.

The initial default should resemble a blank or soft “clouded/spoiler” word rather than an underline-only worksheet. Each hidden word is an independent mask:

- Desktop: hover can preview and click can permanently reveal that word for the current attempt.
- Phone: tap or press reveals one word at a time.
- Revealed words remain visible for the rest of that question loop.
- Each revealed word is recorded as a hint.
- Revealing all hidden words is still different from Flip: Flip begins the answer state and restores the original vocal.
- Reduced-transparency/high-contrast modes replace blur with an opaque pill or blank of equivalent width.

### 8.2 Musical cue ladder

1. Original vocal at normal level.
2. Quiet “ghost” vocal.
3. Instrumental only.
4. Rhythm/metronome only.
5. Count-in only.
6. Silence.

The first product only needs levels 1–3. The normal test condition is **instrumental only**.

### 8.3 Context ladder

1. Fifteen-second lead-in.
2. Previous line.
3. Two-second musical lead-in.
4. Start at the section boundary.
5. Cold prompt: “Verse 2 — go.”
6. No section label and no audio.

### 8.4 Chunk ladder

1. Content word.
2. Phrase.
3. Line.
4. Two-line transition.
5. Complete section.
6. Multiple connected sections.
7. Whole song.

The adaptive policy changes only one of these axes after a review whenever possible.

## 9. Practice object model

A song is not one flashcard.

| Object | Question being tested |
| --- | --- |
| Phrase | Can the learner produce these exact words? |
| Line | Can the learner sustain the complete line? |
| Line transition | What follows this line? |
| Section opening | Can the learner enter Verse 2 from its musical cue? |
| Section transition | What follows the chorus? |
| Similar-line discrimination | Which variation belongs in this occurrence? |
| Section | Can the learner perform the complete verse or bridge? |
| Whole song | Can the learner perform the complete ordered work? |

Do not create every possible object immediately. Start with lines, line transitions, section openings, and sections. Create phrase objects automatically only when a line repeatedly fails or is unusually long.

### 9.1 Adaptive question composition

A memory object and a rendered card are related but not identical. The same line can produce progressively harder cards:

```text
Card A: supplied line with two selected words hidden
Card B: first half supplied, second half hidden
Card C: prior line supplied, complete target line hidden
Card D: prior line plus target line hidden as a transition
Card E: two or more connected target lines hidden
```

The question composer chooses how much to hide using performance across related objects:

- Strong word/phrase results allow a larger hidden span.
- Strong line results activate the preceding-line-to-line transition test.
- Strong neighboring lines allow a connected multi-line card.
- A transition failure can shrink back to the target line with more context.
- Failure on one word should not force every line in the section back to beginner cues.

Transition practice should therefore be a mix rather than an all-or-nothing mode. Track every transition, infer provisional transition strength from its neighboring line reviews, and schedule direct transition tests when the evidence is weak, inconsistent, or important to a section entrance. Direct transition results then replace the provisional estimate.

## 10. Mastery model

Each song exposes four primary dimensions:

| Dimension | Meaning |
| --- | --- |
| Words | Exact lyric production. |
| Sequence | Correct next line, section, and variation. |
| Independence | Success with the original singer removed and with shorter context. |
| Durability | Successful recall after meaningful delays. |

An optional fifth dimension, **Performance**, covers random starts, recovery, and uninterrupted complete takes.

The song page can summarize these dimensions, but should explain the weakest concrete item:

> Verse 2 opening is due and has failed twice with instrumental-only support.

### User-assigned state versus measured state

Keep these separate:

- **Priority:** Ignore, Normal, Needs Work, High Priority.
- **Memory estimate:** derived from review history.
- **Verification:** untested, tested, or manually certified.

“I know this” can lower priority or skip acquisition exercises, but it should not manufacture review history.

## 11. Visible modes

The large idea set should be organized into a small number of visible choices.

### Smart Practice

Default mode. Selects due and weak items, then chooses the weakest cue expected to produce useful retrieval.

### Learn

For new material:

`listen/read → sing along → missing words → missing phrase → missing line → connected lines`

### Fix Weak Spots

Only red/yellow lines, transitions, and section starts. Designed for a fast rehearsal touch-up.

### Section Practice

The learner taps Verse 1, Chorus, Verse 2, Bridge, or another user-defined section.

### Visual Memory

Initials, word shapes, timed blanks, emoji landmarks, story notes, line ordering, and similar-line comparison.

### Performance

Instrumental, minimal or no visual support, whole sections or song, with optional random dropout and random entry points.

### Custom Practice

Advanced controls live here:

- Lyric support.
- Vocal support.
- Context length.
- Chunk size.
- Visual cue type.
- Due/weak/selected target.
- Immediate corrected repeat on/off.

## 12. Core screens and UI behavior

### 12.1 Library

```text
MY SONGS                                      + Import

┌──────────────────────────────────────────────┐
│ artwork   Song A · Artist                    │
│           82% performance-ready · 7 due      │
│           Weakest: Verse 2 opening           │
│                                  PRACTICE    │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│ artwork   Song B · Artist                    │
│           96% performance-ready · 1 due      │
└──────────────────────────────────────────────┘
```

The library emphasizes due work and the next useful action, not listening history.

### 12.2 Import wizard

1. **Choose audio** — MP3, M4A, FLAC, WAV, a direct YouTube video URL, or a prepared vocal/instrumental pair. YouTube import uses local `yt-dlp`, accepts one authorized video rather than playlists/search pages, and then enters the same Demucs pipeline.
2. **Song details** — title, artist, optional artwork.
3. **Paste lyrics** — preserve line breaks and accept headers such as `[Verse 1]`. Also accept Genius-style Markdown exports by unwrapping linked lyric text, removing trailing continuation slashes, and discarding recommendation modules such as “You might also like” until the next section heading.
4. **Confirm performed text** — warn that album lyric sheets often differ from the recording.
5. **Process** — normalize, separate, transcribe, align, score confidence.
6. **Review timing** — open only flagged sections by default.
7. **Ready to learn**.

Processing is a durable job with resumable stages. A crash during alignment should not rerun separation.

### 12.3 Song detail

```text
Song Title · Artist

Words 91%   Sequence 74%   Independence 68%   Durability 82%

6 items due · about 4 minutes

[ SMART PRACTICE ]        [ PLAY ]

Verse 1        94%  ✓
Chorus         98%  ✓
Verse 2        61%  !
Bridge         43%  !!
Final Chorus   86%

Alignment: 93% verified/high confidence · Review 4 words
```

Tap a section to open its lines and transitions. Long-press offers Practice Now, Needs Work, Ignore, Edit Lyrics, and Edit Timing.

### 12.4 Practice player

```text
‹                                    •••

             small artwork
         SONG TITLE · ARTIST

      previous lyric line

      ____  _______  ___  _____
      ━━━━  ━━━━━━━  ━━━  ━━━━━
                         ↑ timed cursor

      upcoming lyric line

      VOCAL OFF                 HINT

      ━━━━━━━━━━━●━━━━━━━━━━━━━━
             1:42       -2:18
```

Design language:

- Current line is dominant and high contrast.
- Previous and future lines are de-emphasized.
- Background uses a blurred, non-destructive color palette derived from user-supplied artwork.
- Controls disappear during uninterrupted playback.
- Text remains readable with reduced motion, high contrast, and large-type options.
- The UI is inspired by modern synchronized lyric players but must have its own layout, iconography, motion, and brand.

### 12.5 Answer state

After the learner taps Flip:

```text
      ACTUAL LYRIC APPEARS HERE

      ORIGINAL SINGER: PLAYING ANSWER LOOP

      Again    Hard    Good    Easy
```

The target line or phrase immediately restarts with the complete original vocal. It continues looping until a rating is selected. Rating stops the answer loop and advances to the next card. Separate Replay and Pause controls remain available, but hearing the singer is the default answer behavior rather than an optional extra action.

### 12.6 Alignment review

The alignment editor is a first-class product screen, not a developer tool.

Required features:

- Waveform with vocal-energy overlay.
- Line and word blocks on a timeline.
- Play/loop current line.
- Click any word to seek.
- Drag word onset and end handles.
- Nudge selected boundary ±10 ms, ±50 ms, or ±100 ms.
- Tap-along mode for word onsets.
- Split/merge lyric tokens without changing displayed text.
- Mark ad-lib, unsung text, overlap, or instrumental break.
- Bulk shift a line or section.
- Undo/redo.
- Confidence color and short reason.
- “Accept section” to mark the current timing manually verified.

Default review shows low-confidence regions only. Power users can inspect everything.

## 13. Audio pipeline

### 13.1 Inputs and canonical files

On import:

1. Resolve the source. Copy a local upload, accept prepared stems, or use local `yt-dlp` to extract one authorized YouTube video's audio. URL import is restricted to direct `youtube.com`/`youtu.be` video routes, 30 minutes, and 250 MB.
2. Hash the original file for caching and duplicate detection.
3. Copy it into the song's private local asset directory.
4. Use FFmpeg to create a stable processing WAV at a fixed sample rate.
5. Preserve the original for normal playback and reprocessing.
6. Record duration, channels, sample rate, codec, source URL when applicable, and processing versions.

Never repeatedly normalize or transcode a derived file. Every generated asset records its source hash.

### 13.2 Separation

Use two-stem Demucs:

```bash
python -m demucs \
  --two-stems=vocals \
  -n htdemucs_ft \
  --out <song-work-dir> \
  <processing-audio.wav>
```

Expected outputs:

- `vocals.wav`
- `no_vocals.wav`

The archived Meta repository says Demucs v4 separates vocals, drums, bass, and other material and exposes `htdemucs_ft`; the repository was archived in 2025 and points to the creator's slow-maintenance fork. See [facebookresearch/demucs](https://github.com/facebookresearch/demucs) and [adefossez/demucs](https://github.com/adefossez/demucs).

The user's existing [`AudioNormalizer/isolate.py`](../AudioNormalizer/isolate.py) already establishes a practical wrapper pattern:

- Invoke the module with the active Python interpreter.
- Use `--two-stems=vocals`.
- Cache output by model and input name.
- Verify both stems exist.
- Return vocal, accompaniment, and normalized input paths.
- Surface dependency failures rather than pretending processing succeeded.

Reuse the design, not the entire Windows-specific pipeline. Extract a small cross-platform worker and pin its environment because Demucs itself is no longer under active feature development.

### 13.3 Initial model decision

- Default quality path: `htdemucs_ft`.
- Fast fallback during development: `htdemucs` or the already proven `hdemucs_mmi` path.
- Keep model name in every asset record.
- Benchmark on the actual target music before declaring one universal default.
- Only two stems are needed. Extra drums/bass/other stems add storage and processing without helping the core vocal-dropout interaction.

### 13.4 Playback architecture

During practice, separation is not rerun. The player loads synchronized vocal and accompaniment stems and starts both from the same audio clock.

```text
Vocal:          ███████████░░░░░░░░████████████
                           recall
Accompaniment:  ████████████████████████████████
```

Partial-line cards use the same mechanism at word boundaries:

```text
Words:          supplied | hidden | supplied | hidden
Vocal gain:     █████████ | ░░░░░░ | ████████ | ░░░░░░
Accompaniment:  ███████████████████████████████████████
Visual state:   visible  | clouded | visible  | clouded
```

The card presentation compiles aligned target-token spans into a vocal gain envelope. Short ramps are applied at every supplied/hidden boundary. When the card flips, the envelope is replaced by full vocal gain and the answer region restarts immediately.

Use short gain ramps instead of hard mute/unmute edges to avoid clicks. Start testing with a 50–100 ms ramp and tune by ear. Both nodes must share transport state for play, pause, seek, rate, and loop.

Desktop prototype:

- Web Audio API with both decoded buffers scheduled against one `AudioContext` clock.
- Preload one song at a time; this is acceptable for a prototype even if uncompressed buffers use significant memory.
- If memory becomes a problem, move to a native shell or streamed multitrack transport rather than accepting drift between independent HTML media elements.

iPhone target:

- `AVAudioEngine` plus synchronized `AVAudioPlayerNode` instances.
- Local compressed stem cache with decoded playback buffers around the current region.
- Audio session configured for playback/record compatibility even before microphone scoring exists, so later singing capture does not require an architectural rewrite.

### 13.5 Audio acceptance criteria

- Vocal and accompaniment report the same sample rate and duration after processing.
- No perceptible transport drift across a five-minute track.
- Seeking restores sync before playback resumes.
- Mute ramps have no audible clicks.
- A failed separation never overwrites a previous valid result.
- Original and instrumental loudness are close enough that dropout does not feel like a dramatic overall volume change.

## 14. Lyrics ingestion and normalization

The pasted text is the canonical answer. ASR is evidence for timing, not authority over the lyric.

### 14.1 Accepted input

- One lyric line per line.
- Blank lines as possible section/instrumental boundaries.
- Optional headers: `[Verse 1]`, `[Pre-Chorus]`, `[Chorus]`, `[Bridge]`, `[Outro]`.
- Optional annotations such as `(ad-lib)` or speaker labels, confirmed by the user.

### 14.2 Preserve two forms

- **Display form:** capitalization, punctuation, apostrophes, and user line breaks.
- **Alignment form:** Unicode-normalized, punctuation-aware tokens suitable for matching.

Never rebuild the display lyric from ASR output.

### 14.3 Token mapping

Every display token maps to zero or more alignment tokens. This handles:

- Contractions.
- Hyphenated words.
- Numbers versus spoken number words.
- Repeated syllables such as “la-la-la.”
- Parenthetical backing vocals.
- Mixed scripts and romanization.
- Elisions and colloquial spelling.

### 14.4 Sections

Prefer explicit user headers. If missing:

1. Treat blank lines as soft boundaries.
2. Detect exact and near-exact repeated line groups as chorus candidates.
3. Propose section labels.
4. Let the user accept, rename, split, or merge them.

Do not make neural section analysis a prerequisite for import.

## 15. Word-alignment strategy

### 15.1 Why known-text alignment is the right problem

The user has supplied the expected words. The system does not need to trust unconstrained singing transcription. It needs to determine where each canonical word occurs in the vocal stem.

That suggests an ensemble pipeline:

```text
track metadata → free synced lyrics → line anchors ─┐
canonical pasted lyrics ─────────────────────────────┤
                                                    │
original audio → Demucs vocals → ASR word timing ───┼→ global sequence match
                              → CTC forced aligner ──┤→ candidate fusion
                                                    │
vocal energy / line structure / repeated anchors ───┘
                                                      ↓
                                           timed canonical words
                                                      ↓
                                      confidence + correction queue
```

### 15.1.1 Pass 0: free synchronized-line anchors

Before running a large local model, query [LRCLIB](https://lrclib.net/docs) with normalized track title, artist, and duration. The request contains metadata only, never audio or pasted lyrics. LRCLIB is open, requires no API key, and can return LRC line timestamps.

Catalog text must not replace the user's canonical lyrics. Tokenize both documents and globally align their complete sequences so repeated choruses remain separate. A canonical app line may consume several LRC fragments—for example a pasted `Brise mon cœur, encore, ce soir` can map to four individually timestamped fragments. Preserve empty LRC timestamps as phrase-end boundaries. Treat the resulting line onset/end as strong line evidence, but label word positions distributed inside a line as estimates.

If title/artist/duration do not produce a credible match, continue locally. A catalog miss is normal, not an import failure.

### 15.2 Pass A: timing-bearing ASR

Run a local Whisper-family model on the isolated vocal stem, with:

- Known language when the user supplies it.
- The opening canonical lyrics as a prompt where supported.
- Conditioning settings chosen to reduce repetition loops on music.
- Word timestamps and token/word confidence.

The MVP uses multilingual Whisper `small` rather than `base`, passes the canonical lyrics as the initial prompt, and globally aligns the entire song. This is slower than the earlier greedy baseline but substantially reduces the risk that repeated refrains attach to the wrong occurrence.

Two reasonable implementations to benchmark are:

- [whisper-timestamped](https://github.com/linto-ai/whisper-timestamped), which adds word timestamps and confidence based on Whisper cross-attention.
- [WhisperX](https://github.com/m-bain/whisperX), which uses faster-whisper transcription and a language-specific wav2vec2-style alignment model.

ASR output is a hypothesis stream:

```json
[
  { "heard": "example", "start": 12.31, "end": 12.72, "confidence": 0.84 }
]
```

It is not allowed to alter the pasted lyric.

### 15.3 Pass B: monotonic sequence matching

Align canonical lyric tokens to ASR hypothesis tokens with a global monotonic dynamic-programming algorithm similar to Needleman–Wunsch.

The token match score should combine:

- Exact normalized match.
- Edit similarity.
- Optional phonetic similarity.
- Contraction/number equivalence.
- Line and section boundary priors.
- Gap penalties for ad-libs, unsung words, and ASR omissions.

This approach is directly represented by the open-source [syncalong](https://github.com/wickeddoc/syncalong) project, which combines optional Demucs separation, Whisper word timestamps, fuzzy token matching, and monotonic dynamic programming. Use it as a baseline and source of test ideas; do not assume its line-level LRC output alone meets our word-level product requirements.

### 15.4 Pass C: canonical forced alignment

Use the coarse windows from Pass B to align the canonical text itself with a CTC/phoneme model. Constraining each line or small section to a plausible time window prevents repeated choruses from attaching to the wrong occurrence.

Candidates:

- WhisperX's alignment function using canonical segment text and approximate segment windows.
- [ctc-forced-aligner](https://github.com/MahmoudAshraf97/ctc-forced-aligner), which accepts known text and produces word/character spans and alignment scores across many languages.
- [SOFA](https://github.com/qiuqiao/SOFA), a singing-oriented phoneme aligner and the most directly relevant specialized backend to benchmark. Keep it optional until its older Python/checkpoint environment is isolated from the shipping worker.
- [lyrics-aligner](https://github.com/schufo/lyrics-aligner), which provides an English singing-specific phoneme/word model. It is useful as a benchmark but is not the multilingual default because its published environment and pronunciation pipeline are English-oriented.
- [STARS](https://github.com/gwx314/STARS), a newer research system combining singing transcription and alignment. Evaluate it on the golden song set before accepting its larger research stack as a product dependency.

Important license note: the `ctc-forced-aligner` code is BSD, but its documented default model is CC BY-NC. That default cannot be assumed safe for a commercial product. Model licenses must be tracked separately from code licenses.

### 15.5 Pass D: candidate fusion

For each canonical word, preserve all evidence:

```json
{
  "text": "example",
  "displayText": "Example,",
  "start": 12.302,
  "end": 12.731,
  "source": "consensus",
  "evidence": {
    "asrStart": 12.31,
    "ctcStart": 12.294,
    "asrConfidence": 0.84,
    "ctcScore": 0.79,
    "lexicalMatch": 1.0,
    "boundaryAgreementMs": 16
  },
  "confidence": 0.91,
  "verified": false
}
```

Choose boundaries by confidence-weighted consensus when both paths agree. Prefer the canonical CTC span when ASR heard a different but nearby word and the CTC path remains strong. Never force a high-confidence result through a region with no meaningful vocal evidence.

### 15.6 Missing-word fallback

If a canonical word does not receive a reliable direct match:

1. Find reliable anchors on both sides within the same line.
2. Allocate the unanchored interval using neighboring CTC evidence when available.
3. Otherwise interpolate using conservative duration weights based on syllable/character count.
4. Mark the word `interpolated` and low confidence.
5. Queue it for review.

Interpolation makes the player usable; it does not become evidence that timing is correct.

### 15.7 Repetition and chorus handling

- Maintain a single monotonic path through the complete song.
- Use explicit section order and coarse line windows.
- Do not deduplicate repeated chorus text in the timing model; each occurrence has its own token instances.
- Link occurrences as variants only in the memory model.
- When one chorus aligns strongly and another weakly, allow timing transfer as a candidate only after estimating section offset and validating vocal energy. Mark transferred timings separately.

### 15.8 Mixed language, rap, ad-libs, and harmony

- Store language at song, section, line, and optionally token level.
- Let the user mark unsung text and ad-libs.
- Allow overlapping word spans for simultaneous backing vocals, but keep one primary lead-lyric lane in V1.
- Fast rap may require phrase-first timing and manual word correction.
- Long melismas need one word with a long span, not invented repeated tokens.
- Whisper/CTC models trained mostly on speech may be unreliable on expressive singing. The confidence and editing system is therefore part of the core architecture, not a temporary workaround.

### 15.9 Converting word alignment into partial-line vocal dropout

Demucs does not isolate each sung word into a separate file. It produces one continuous vocal stem and one continuous accompaniment stem. Both retain the original track's sample timeline. Word synchronization is created by attaching canonical lyric tokens to regions of that continuous vocal timeline.

#### Step 1: enforce one timeline

- Convert the source to the canonical processing sample rate before separation.
- Verify `vocals.wav` and `no_vocals.wav` have the expected sample count.
- Store all alignment boundaries as sample indices internally, with milliseconds as the UI/API representation.
- Start vocal and accompaniment nodes from the same transport clock and seek position.

If the separator adds leading samples or changes length in a future version, detect it with duration/sample checks and estimate a global offset before allowing practice.

#### Step 2: align canonical tokens to the vocal stem

The ensemble alignment pipeline produces, for every performed canonical token:

```json
{
  "tokenId": "line-12-token-4",
  "text": "example",
  "startSample": 2170952,
  "endSample": 2190101,
  "confidence": 0.93,
  "source": "asr_ctc_consensus"
}
```

Line and phrase regions are derived from their first and last performed tokens, plus musically appropriate lead/tail margins. The canonical token IDs—not fuzzy text searched at playback time—connect lyric display, card targets, and audio spans.

#### Step 3: choose supplied and tested tokens

For a partial-line question, the card composer emits two ordered token sets:

```json
{
  "suppliedTokenIds": ["w1", "w2", "w5", "w6"],
  "targetTokenIds": ["w3", "w4"]
}
```

Supplied tokens remain visible and retain vocal gain. Target tokens receive a blank/clouded mask and a vocal mute envelope.

#### Step 4: compile a safe gain envelope

For every run of adjacent target tokens:

1. Begin with the first target word's aligned onset and last target word's aligned end.
2. If there is a real low-energy gap between supplied and hidden words, place the boundary in that gap.
3. If words touch, use the word/phoneme boundary and a short equal-power ramp rather than a hard edge.
4. Merge neighboring hidden spans separated by a very small gap so gain does not flutter rapidly.
5. Apply conservative outward padding only when it will not erase a neighboring supplied word.

Starting values to tune on the gold set:

- Gain ramp: 30–80 ms.
- Merge hidden gaps shorter than approximately 100 ms.
- Phrase-edge safety padding: 40–100 ms when adjacent content is also hidden or silent.
- No automatic padding across a supplied-word boundary.

Alignment confidence controls granularity:

- **High-confidence word boundaries:** allow alternating word-level supplied/hidden audio.
- **Medium confidence:** merge into a phrase window rather than making rapid word cuts.
- **Low confidence:** use a complete-line dropout or require timing review before the card is activated.

This avoids a low-quality timestamp leaking the answer's first consonant or muting a word that was supposed to be supplied.

#### Step 5: schedule the question passes

- Pass 1 seeks to `context_start` and plays prior context plus the target line using the compiled partial mute envelope.
- Passes 2–5 seek to `target_line_start` (or `target_phrase_start` for a phrase card) and play only that line/phrase with the same envelope.
- After pass 5, playback pauses and exposes Replay and Flip.
- Replay starts another target-only block; full context returns only through Restart Card.

#### Step 6: flip into the answer

Flip performs three operations atomically on the shared audio clock:

1. Reveal every target token.
2. Replace the partial mute envelope with full vocal gain.
3. Seek to the target line/phrase start and begin the answer loop immediately.

Rating cancels the scheduled answer loop before the next card is loaded.

#### Step 7: correct uncertainty quickly

The alignment editor manipulates the same token boundaries used by playback. Moving a word onset immediately regenerates affected card envelopes. User-verified boundaries override model candidates while preserving the original evidence for debugging and future recalibration.

#### Required synchronization tests

- A synthetic impulse placed in both stems stays on the same sample through play, seek, loop, and Flip.
- A target-token selection produces the expected gain automation snapshot.
- Supplied/hidden boundaries never go backward or overlap illegally.
- Partial-line dropout does not leak target onsets on the gold clips.
- Flip restarts the exact target region with full vocal audio.
- Pass 2 begins at the target line/phrase rather than replaying prior context.
- Editing a word boundary changes the next playback without re-running separation or ASR.

## 16. Alignment confidence

### 16.1 Confidence is an evidence score at first

Until the score is calibrated against manually timed songs, do not label `0.91` as “91% probability correct.” Call it an alignment confidence/evidence score.

Initial components can include:

| Signal | Initial weight |
| --- | ---: |
| CTC path/token score | 0.30 |
| ASR word confidence | 0.20 |
| Canonical-to-hypothesis lexical/phonetic match | 0.20 |
| ASR/CTC boundary agreement | 0.15 |
| Neighbor continuity and monotonicity | 0.10 |
| Vocal activity around the span | 0.05 |

Apply penalties for:

- Interpolation.
- Missing anchor on either side.
- Implausible word duration.
- Boundary overlap or time reversal.
- Long region without vocal energy.
- Large disagreement between aligners.
- Multiple equally plausible repeated-section placements.

The weights are starting hypotheses. Save the components so they can be recalibrated without rerunning audio models.

### 16.2 UI levels

- **High:** both methods agree, match is strong, and boundaries are plausible.
- **Medium:** usable but only one method is strong or boundaries disagree modestly.
- **Low:** interpolated, unmatched, ambiguous, or inconsistent.
- **Verified:** a user explicitly accepted or corrected it.

Use color plus icon/text; never communicate confidence by color alone.

### 16.3 Calibration plan

Create a private gold set across at least:

- Clear solo pop vocal.
- Dense instrumentation.
- Rap.
- Long sustained notes.
- Harmonized chorus.
- Repeated near-identical verses.
- At least one mixed-language song relevant to the intended audience.

Manually label line and word onsets. Measure:

- Median and 90th-percentile absolute onset error.
- Line-start error.
- Percentage of canonical words receiving direct, interpolated, or no alignment.
- Error by declared confidence bucket.
- Review minutes per song.

Product-oriented initial targets:

- High-confidence line onsets: median error ≤150 ms and 90th percentile ≤350 ms.
- High-confidence word onsets: median error ≤120 ms and 90th percentile ≤300 ms on clear supported-language songs.
- No silent interpolation classified as high confidence.
- A typical clear three-to-four-minute song requires less than two minutes of human timing cleanup after processing.

These are acceptance targets, not claims about the selected tools before testing.

## 17. Why no paid API is required

The core pipeline can run without a paid service:

- Optional LRCLIB metadata lookup for synchronized line anchors.
- FFmpeg for audio conversion.
- Demucs for two-stem separation.
- Whisper-family ASR for timing hypotheses.
- WhisperX or a compatible CTC aligner for forced alignment.
- Local dynamic programming for canonical token mapping.
- SQLite for product data.
- FSRS for scheduling.

A paid API may later reduce processing friction for users without capable hardware, but it is not required to prove the product. The optional LRCLIB request includes track metadata only; all audio processing remains local. An API also does not automatically solve singing alignment; most speech transcription services optimize speech, not expressive singing with repeated text.

Future deployment options:

1. **Fully local:** best privacy and zero variable API bill; slow on weak hardware.
2. **User-hosted worker:** desktop/GPU box processes songs; phone downloads prepared assets.
3. **First-party GPU jobs:** easiest mobile onboarding; incurs cost and greater rights/privacy responsibility.
4. **Hybrid:** local when supported, opt-in cloud otherwise.

Build the worker behind a versioned job interface so deployment can change without rewriting the product.

## 18. Scheduling and adaptive difficulty

Use FSRS for **when** an item should return and a separate cue policy for **how** it should be tested.

The TypeScript implementation [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) is an MIT-licensed candidate for the desktop/web prototype.

### 18.1 Research-backed cue-graduation policy

The literature does not directly test the exact sequence “two hidden lyric words → half a sung line → full sung line → multiple sung lines.” The following rule is therefore a product inference built from four better-supported findings:

1. Diminishing cues can preserve successful retrieval when a fully uncued test would initially fail, and progressively poorer cues can improve later recall. See Fiechter and Benjamin, [Diminishing-cues retrieval practice](https://pubmed.ncbi.nlm.nih.gov/28849580/), and Finley et al., [Benefits of accumulating versus diminishing cues in recall](https://pmc.ncbi.nlm.nih.gov/articles/PMC3076684/).
2. Successful recall in multiple spaced sessions matters more than packing many repetitions into one sitting. The successive-relearning review reports better retention when three correct recalls were distributed as one per spaced session rather than massed together. See Rawson and Dunlosky, [Successive Relearning](https://journals.sagepub.com/doi/10.1177/09637214221100484).
3. One influential optimization study recommended three correct initial recalls followed by three relearning sessions, but later work found that the benefit of an unusually high initial criterion is largely overridden once spaced relearning occurs. See [Optimizing schedules of retrieval practice](https://pubmed.ncbi.nlm.nih.gov/21707204/) and [Effects of successive relearning on recall](https://pubmed.ncbi.nlm.nih.gov/27027887/).
4. The current Anki FSRS guidance recommends keeping learning steps minimal and under one day because repeated same-day reviews contribute comparatively little to long-term memory; the default desired retention is 90%, with higher settings increasing workload rapidly. See the official [Anki deck-options documentation](https://docs.ankiweb.net/deck-options.html#fsrs).

Based on that evidence, use this initial progression:

| Stage | Card presentation | Requirement to advance |
| --- | --- | --- |
| 1 | Approximately two important words hidden | One qualifying success. |
| 2 | Approximately half of the line hidden | One additional qualifying success. |
| 3 | Complete line hidden, with prior context on pass 1 | One qualifying success establishes initial full-line recall. |
| 4 | Complete line tested by FSRS | Three qualifying full-line successes on separate due sessions/days. |
| 5 | Transition probe | One direct qualifying transition success when both neighboring lines meet Stage 4. |
| 6 | Two connected lines hidden | FSRS schedules the compound card separately; larger chunks grow only after their component lines remain strong. |

A **qualifying success** for cue graduation means:

- Good or Easy, not Hard or Again.
- No hidden word was individually revealed.
- The learner did not need an additional five-pass Replay block.
- The answer was attempted before Flip.

Hard remains a successful recall for FSRS, but holds the current cue stage. Again is a failure and may temporarily restore support. A hinted Good/Easy still updates FSRS using the user's chosen grade, but it does not graduate the visual cue.

The first three stages may occur in one acquisition day if interleaved with other lines; do not repeat the same line back-to-back merely to hit the criterion. Once the user first succeeds on the complete line, stop escalating it that day and let FSRS provide the next opportunity. The more important evidence for multi-line promotion is the three later spaced successes.

Do not automatically join every pair of strong lines. When neighboring lines qualify, schedule a direct transition probe. If it passes, create/activate the two-line compound card. If it fails, keep practicing that transition even though both lines are individually strong. This operationalizes the requested mixture of inferred and directly measured transition strength.

This policy should be versioned as `cue_policy_v1` and evaluated against actual delayed lyric recall. It is a reasoned starting point, not a claim that memory research has established these exact lyric-card thresholds.

### 18.2 Scheduling input

Each review event supplies:

- FSRS rating: Again, Hard, Good, Easy.
- Review timestamp.
- Practice object ID.
- Whether this was acquisition, relearning, or performance testing.

Do not invent extra FSRS ratings from hidden behavior. Behavioral evidence belongs to cue policy and analytics unless experiments demonstrate a safe mapping.

### 18.3 Cue policy

Example deterministic first version:

- Again: increase visual support; return within the session.
- Hard: keep support; retain current chunk/context.
- Good: advance one cue stage only when the review meets the qualifying-success rule.
- Easy: also advances at most one cue stage; do not skip stages merely because one attempt felt easy.
- One or more word hints or an extra Replay block: hold cue stage regardless of the selected pass rating.
- Multi-line composition follows the separate-session and transition requirements above, not a single rating.
- Failed section opening with successful line recall: schedule transition/section-opening object, not every word in the line.

Start deterministic and inspectable. Machine-learned cue selection is a later optimization after enough review data exists.

### 18.4 Within-session behavior

- Failed-item timing follows the configured FSRS learning/relearning steps instead of a custom fixed delay.
- After rating, stop the answer loop and advance; any failed-item return follows FSRS learning/relearning behavior.
- Avoid more than two consecutive failures on the same item without increasing support.
- End a session on a successful retrieval when possible.

### 18.5 Deadline mode

Later, a performance date can raise priority and shorten intervals without changing historical memory evidence. Clearly label that the schedule is optimized for the deadline rather than long-term efficiency.

## 19. Data model

Suggested entities:

### Song

- `id`, `title`, `artist`, `language`, `duration_ms`
- `artwork_asset_id`
- `created_at`, `updated_at`
- `import_status`, `processing_version`

### AudioAsset

- `id`, `song_id`, `kind` (`original`, `processing_wav`, `vocals`, `instrumental`)
- `path`, `content_hash`, `source_asset_id`
- `codec`, `sample_rate`, `channels`, `duration_samples`
- `separator_name`, `separator_model`, `separator_version`

### Section

- `id`, `song_id`, `type`, `label`, `position`
- `start_ms`, `end_ms`
- `user_priority`

### LyricLine

- `id`, `section_id`, `position`
- `display_text`, `alignment_text`
- `start_ms`, `end_ms`, `confidence`, `verified`

### LyricToken

- `id`, `line_id`, `position`
- `display_text`, `normalized_text`
- `start_ms`, `end_ms`
- `alignment_source`, `confidence`, `verified`
- `language`, `flags`

### AlignmentEvidence

- `token_id`, `aligner`, `aligner_version`
- `candidate_start_ms`, `candidate_end_ms`
- `raw_score`, `features_json`

### PracticeItem

- `id`, `song_id`, `type`
- `start_token_id`, `end_token_id`
- `prompt_context_start_ms`
- `source_item_ids` for transition/compound items
- `active`, `user_priority`

### CardPresentation

This is generated for an attempt rather than treated as permanent memory state:

- `practice_item_id`
- `supplied_token_ids`, `target_token_ids`
- `question_loop_start_ms`, `question_loop_end_ms`
- `answer_loop_start_ms`, `answer_loop_end_ms`
- `vocal_gain_envelope`
- `mask_style`, `revealed_hint_token_ids`
- `context_level`, `chunk_level`
- `presentation_policy_version`

### MemoryState

- `practice_item_id`
- FSRS card fields and due date
- `cue_level`, `musical_support`, `context_level`, `chunk_level`
- `last_success_at`, `last_failure_at`

### ReviewEvent

- `id`, `practice_item_id`, `reviewed_at`
- `rating`, `elapsed_ms`
- `cue_configuration_json`
- `hints_used`, `revealed`, `answer_replays`, `restarts`
- `scheduler_before_json`, `scheduler_after_json`

### ManualEdit

- Entity/type, before/after values, timestamp, and source.
- Supports undo, auditing, and future comparison against automatic alignment.

Use integer milliseconds in the application/database and sample indices inside audio processing. Avoid floating-point equality for timeline identity.

## 20. Suggested architecture

### Desktop prototype

```text
React + TypeScript UI
        │
        ├── Web Audio multistem player
        ├── lyric/practice state
        └── ts-fsrs scheduler
        │
local HTTP/IPC
        │
Python FastAPI worker
        ├── FFmpeg
        ├── Demucs
        ├── Whisper timing
        ├── CTC forced alignment
        └── alignment fusion
        │
SQLite + local asset directory
```

Recommended repository layout:

```text
apps/
  web/                 # React/TypeScript product UI
services/
  audio-worker/        # Python processing service
packages/
  domain/              # schemas and shared product rules
  scheduler/           # FSRS adapter + cue policy
  alignment-schema/    # versioned JSON contracts
fixtures/
  licensed-or-owned/   # tiny test clips and gold timings
docs/
```

Use Pydantic-generated JSON Schema and TypeScript types to prevent the Python/TypeScript boundary from drifting.

### Native phone phase

If iPhone is first, use SwiftUI and AVAudioEngine for the final player rather than forcing a web audio stack to solve native background audio, interruptions, lock-screen behavior, and precise multistem transport. Reuse:

- Processing worker contract.
- SQLite/domain schema.
- Alignment JSON.
- FSRS concepts and review history.
- Product flows and visual design.

The first phone version can receive already processed songs from a desktop companion before cloud processing exists.

## 21. Internal service contract

Even a local monolith benefits from stable endpoints/events.

```text
POST   /songs/import
GET    /jobs/{jobId}
POST   /songs/{songId}/separate
PUT    /songs/{songId}/lyrics
POST   /songs/{songId}/align
GET    /songs/{songId}/alignment/issues
PATCH  /tokens/{tokenId}/timing
POST   /sections/{sectionId}/verify
GET    /practice/next?scope=due|song|section
POST   /reviews
```

Processing stages:

```text
IMPORTED
→ AUDIO_PREPARED
→ STEMS_READY
→ LYRICS_PARSED
→ ASR_READY
→ ALIGNMENT_READY
→ NEEDS_REVIEW or READY
```

Each stage is idempotent, versioned, and cacheable by source hash plus configuration.

## 22. Implementation phases

### Phase 0: interaction proof

Goal: determine whether vocal dropout plus timed blanks actually feels good.

- One legally usable song or short owned clip.
- Manually prepared vocals and instrumental.
- Manually entered word timings.
- Desktop browser player.
- Partial-word/suffix/full-line prompts, timed masks, Flip, and an automatic answer loop.
- Four ratings stored locally.
- No accounts, auto alignment, or scheduler optimization.

Exit criteria:

- Stems remain synchronized.
- Dropout/re-entry feels natural.
- A user can complete ten prompts without UI confusion.
- Timed blanks feel helpful rather than distracting.

### Phase 1: local import and processing

- Audio import and metadata.
- Cross-platform Demucs worker.
- Paste/edit structured lyrics.
- Basic ASR plus canonical sequence matching.
- Word/line timing JSON.
- Processing progress and caching.
- Low-confidence alignment review.

Exit criteria:

- End-to-end processing succeeds on the gold song set.
- Failed stages are resumable.
- No ASR output changes the canonical lyric.
- Alignment confidence catches most serious failures.

### Phase 2: real learning MVP

- Library and song pages.
- Smart Practice and Section Practice.
- Line, transition, section-opening, and section objects.
- FSRS integration.
- Adaptive visual support.
- Weak-spot display and review history.
- Local SQLite persistence.

Exit criteria:

- A song can be learned across multiple days without manual card creation.
- Due counts are deterministic and explainable.
- Direct bridge/verse practice takes at most two taps from song detail.

### Phase 3: alignment quality and editing

- Second forced-alignment path.
- Evidence fusion and calibrated confidence.
- Complete timeline editor.
- Mixed-language metadata.
- Gold-set regression suite.
- Batch processing.

### Phase 4: mobile product

- SwiftUI iPhone app or a deliberately chosen cross-platform alternative.
- Native multistem playback.
- Desktop-to-phone prepared song transfer.
- Offline practice and local notifications.
- Mobile timing correction limited to common quick fixes.

### Phase 5: expanded learning tools

- Emoji and meaning landmarks.
- Similar-verse comparison.
- Reverse chaining.
- Performance/random-dropout mode.
- Deadline and set-list modes.
- Optional local/cloud AI for semantic suggestions.

### Phase 6: optional platform features

- Opt-in cloud processing.
- Encrypted sync.
- Licensed lyric/audio partnerships.
- Teacher/band collaboration.
- Voice-based scoring after a dedicated singing benchmark proves it useful.

## 23. Feature backlog by priority

### Must have

- Import owned audio and pasted lyrics.
- Two-stem separation.
- Reliable synchronized playback.
- Word/line timing and correction.
- Vocal dropout.
- Timed blanks.
- Flip and immediate looping original-vocal answer.
- Four-button rating.
- Due and section practice.
- Local persistence.

### Should have

- Initials and first-word cues.
- Transition and section-opening cards.
- Weakness heat map.
- Alignment confidence review queue.
- Immediate corrected repeat.
- Similar-line warning.
- Practice history and mastery dimensions.

### Could have

- Emoji cues.
- Meaning/story cards.
- Reverse chaining.
- Line ordering puzzle.
- Random dropout.
- Set lists and deadlines.
- Maintenance pop quiz.
- Export/import of timing JSON and enhanced LRC.
- Desktop companion transfer.

### Not now

- Automatic vocal grading.
- Public song catalog.
- Streaming-service manipulation.
- Social feed.
- Generic AI chat coach.
- Six-stem separation.
- Fully automatic semantic analysis required for import.

## 24. Testing strategy

### Unit tests

- Unicode and punctuation normalization.
- Display-token to alignment-token mapping.
- Contractions, hyphens, numbers, repeated syllables, and mixed scripts.
- Dynamic-programming alignment with substitutions, insertions, and omissions.
- Repeated chorus placement.
- Confidence penalties.
- Cue transitions for each rating/evidence combination.
- FSRS adapter determinism.

### Audio integration tests

- Stem duration/sample count agreement.
- Seek/play/pause sync.
- Dropout envelope click test.
- Cached processing invalidation when model/config changes.
- Safe recovery from interrupted processing.

### Golden alignment tests

Every checked-in test clip includes:

- Canonical lyric tokens.
- Manually verified line/word onsets.
- Expected difficult features.
- Allowed timing tolerance.
- Expected confidence bucket for known ambiguous spans.

### End-to-end tests

- Import → process → review → practice → rate → due again.
- Direct section practice.
- Hint then rating.
- Manual timing edit reflected immediately in playback.
- App restart preserves review and processing state.
- Deleting an imported song removes generated local assets after explicit confirmation.

### User tests

Observe without instruction:

- Can a new user understand when to sing?
- Do animated blanks help or steal attention?
- Does vocal re-entry obscure the learner's own voice?
- Does looping the answer until rating provide enough time to compare the attempt without becoming repetitive?
- Can a singer fix one known bridge in under thirty seconds?
- Does confidence review feel manageable?

## 25. Product analytics without surveillance

The local product can provide useful personal analytics without uploading raw audio or lyrics:

- Practice minutes.
- Attempts per song/section.
- Ratings over time.
- Hint and reveal frequency.
- Stability and due counts.
- Weak transitions.
- Alignment cleanup time.

If aggregate analytics are later added, make them opt-in, strip song text/audio, document event schemas, and never upload a user's imported media by default.

## 26. Accessibility

- Dynamic type and very large lyric mode.
- High-contrast and color-blind-safe confidence states.
- Reduced motion mode that replaces scrolling/animation with discrete highlights.
- VoiceOver/keyboard labels for every practice control.
- Full keyboard operation in the desktop editor.
- Adjustable pre-roll and response window.
- Left/right handed rating layout.
- Dyslexia-friendly font option without claiming it improves memory universally.
- No requirement to sing aloud; a user may retrieve mentally and self-rate.

## 27. Rights, licensing, and platform constraints

This section is product risk guidance, not legal advice.

Lyrics and the underlying musical work are protected separately from the sound recording. The U.S. Copyright Office explains this distinction in [What Musicians Should Know about Copyright](https://www.copyright.gov/engage/musicians/).

The safe prototype posture is:

- Users import files they are authorized to use.
- Users paste lyrics for personal/local use.
- Imported audio, lyrics, stems, and timings remain local by default.
- The app does not publish, share, or ship a lyrics catalog.
- Test fixtures are owned, commissioned, public domain, or appropriately licensed.
- Every code dependency and model weight has its license recorded.

Do not design Spotify as the audio-ingestion path. Spotify's current developer policy prohibits downloading content, synchronizing recordings with lyrics/visual media in the described ways, remixing/mixing content, and ingesting Spotify content into AI models. See the official [Spotify Developer Policy](https://developer.spotify.com/policy) and [track API policy notes](https://developer.spotify.com/documentation/web-api/reference/get-track).

Before a public or commercial launch, obtain counsel on:

- User-uploaded sound recordings.
- Generation and storage of separated stems.
- Lyric display and synchronization rights.
- Cloud processing and retention.
- Export/sharing.
- Commercial lyric catalog licensing.

## 28. Technical risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Speech models perform poorly on singing. | Separate vocals, use known text, ensemble timing methods, expose confidence, and ship a good editor. |
| Repeated choruses align to the wrong occurrence. | Global monotonic path, section anchors, coarse windows, and per-occurrence tokens. |
| Demucs dependency becomes brittle. | Pin a container/environment, cache artifacts, isolate the worker contract, and keep separator backend pluggable. |
| Stems drift or click during dropout. | One audio clock, sample-matched assets, scheduled gain ramps, and transport integration tests. |
| Alignment “confidence” is misleading. | Call it evidence until calibrated; preserve raw components and manually labeled benchmarks. |
| Question/answer loops feel repetitive. | Keep musically clean loop boundaries, make rating advance immediate, and expose pause/replay controls. |
| Too many modes overwhelm users. | Smart Practice as default; six visible modes maximum; advanced options in Custom Practice. |
| Users paste album lyrics that differ from the performance. | Confirmation step, difference warnings, edit flow, and no ASR rewriting. |
| Model/code licenses conflict with commercialization. | Dependency bill of materials with separate code, weights, and dataset licenses. |
| Phone cannot process large models efficiently. | Desktop companion or optional job server; processing and playback remain separate systems. |

## 29. Decisions to validate with prototypes

1. Should advanced settings allow a different pass-block length while keeping five passes as the default?
2. Is a clouded/spoiler mask or an opaque word-shaped blank easier to understand on first use?
3. What vocal fade duration sounds natural across genres?
4. How much lead-in produces successful but effortful recall?
5. Should a corrected attempt happen automatically after an Again rating or wait for FSRS to re-present the card?
6. Is `htdemucs_ft` quality worth its processing cost for short personal-library imports?
7. Which alignment pair gives the best cleanup-time result on the actual music library?
8. At what confidence threshold should import stop for required review versus allow practice immediately?
9. Is a PWA sufficient for early phone testing, or does native multistem audio become necessary immediately?

## 30. First implementation sprint

Build the smallest vertical slice before generalizing:

1. Choose a short owned/licensed clip and prepare vocal/instrumental stems.
2. Create a hand-authored timing JSON with section, line, and word spans.
3. Build the two-stem Web Audio transport.
4. Render supplied words plus clouded/timed target masks, with one-word reveal.
5. Add smooth vocal dropout and return.
6. Add question looping, Flip, automatic original-vocal answer looping, and four ratings.
7. Persist review events in local storage or SQLite.
8. Run five user practice sessions and record interaction problems.
9. Only then wire the Demucs worker.
10. Add automatic alignment behind the same timing JSON contract.

The timing JSON is the seam that lets UI work, audio work, and ML work progress independently.

## 31. Definition of MVP success

The MVP succeeds if a user can:

- Import one authorized song and paste exact lyrics.
- Get usable two-stem audio without editing a DAW project.
- Review a small, honest list of uncertain timings.
- Tap Smart Practice and understand exactly when to sing.
- Hear the instrumental continue while the answer disappears.
- Reveal one masked word at a time without flipping the whole card.
- Flip the card and immediately hear the original singer loop the answer until rating.
- Rate the attempt in one tap.
- Return the next day and receive sensible due material.
- Open a weak section directly and practice it immediately.
- Reach instrumental-only, no-visible-lyric performance for a complete section.

Success is not “the app generated beautiful synchronized lyrics.” Success is that the learner becomes less dependent on both the lyric screen and the original singer over time.

## 32. Long-term options

Once the core loop is proven, the architecture supports:

- On-device separation with a mobile-optimized model.
- Cloud processing for phones without capable hardware.
- Singing-aware alignment models.
- User-corrected timing models or calibration, with explicit consent.
- Automatic recognition of substitutions, omissions, and hesitations.
- Pitch/rhythm feedback separate from lyric memory scoring.
- Emoji and visual memory cues generated locally or by an optional service.
- Meaning, narrative, rhyme, and semantic landmark notes.
- Gesture or staging anchors.
- Set-list order and concert simulation.
- Random interruption/recovery drills.
- Tempo/key variation.
- Coach/band assignment and shared repertoire health.
- Watch-sized one-line micro-reviews.
- Licensed search-and-import catalogs.
- Enhanced LRC/JSON export and interoperability with karaoke tools.

## 33. Final product position

Lyric Memorizer should not market itself as a lyric player that happens to hide words. It should be the app that turns a recording into an adaptive rehearsal partner.

The recording provides the musical cue. Separation removes the answer. Alignment determines exactly when each word belongs and tells the truth when it is unsure. The cue system provides only as much visual help as the learner needs. Spaced repetition determines when the weakness returns. Direct section controls respect the way real musicians rehearse.

That combination is the product.

## Appendix A: Competitive and adjacent product lens

The market validates individual parts of the concept, but the implementation should avoid becoming a weaker copy of an existing memorization or karaoke app.

| Reference | What it validates | Gap this product targets |
| --- | --- | --- |
| [LyriCue](https://apps.apple.com/us/app/lyricue-memorize-lyrics/id6755578205) | Progressive line/word/letter hiding, emoji cues, annotations, and a lyric-songbook workflow. | Cues are not the same as automatically muting the answer on a word-timed stem or modeling musical transitions. |
| [Lines](https://apps.apple.com/us/app/lines-memorize-lyrics/id6754345999) | Chunking, next-line/next-word/first-letter practice, multiple scripts, and spaced reminders. | Text-centered practice does not test recall under the exact recording and accompaniment. |
| [ReciteFlow](https://reciteflow.com/) | Sequential spaced repetition, previous-line prompts, self-rating, hints, section detection, and performance deadlines. | It validates line/transition scheduling but does not provide synchronized source-separated vocal dropout. |
| [LineByLine](https://www.linebyline.app/) | Gradual text removal and line-level spaced repetition for long ordered text. | It is content-general and not built around musical timing, stems, or performance entry cues. |
| [syncalong](https://github.com/wickeddoc/syncalong) | A practical local pipeline using optional Demucs, Whisper timestamps, fuzzy dynamic programming, and pasted lyrics. | It is primarily a timing/LRC tool rather than a memory product, and its public interface is line-centered. |
| [SingAlongSync](https://github.com/0xaadesh/SingAlongSync) | A recent proof of concept combining Demucs, WhisperX, word timing JSON, and an Apple Music-style lyric player. | It demonstrates technical feasibility, not adaptive retrieval, review evidence, transition training, or long-term scheduling. |
| Stem-separation apps such as [Moises](https://developer.apple.com/articles/moises/) | Users understand muting vocals and practicing with stems, including on Apple platforms. | Stem control alone does not determine what to remove, when to test it, or when it should return. |

The intended position is the intersection of these categories:

```text
beautiful synchronized lyric player
            +
source-separated rehearsal transport
            +
ordered-text retrieval practice
            +
adaptive spaced memory model
            =
Lyric Memorizer
```

The product should watch this landscape as implementation proceeds. The differentiator is a workflow-level combination, so competitors can converge by adding only one or two features.

## Appendix B: Dependency and research watch list

Pin every selected version; do not install unbounded latest dependencies in a production worker.

| Area | Primary candidate | What to watch |
| --- | --- | --- |
| Separation | `adefossez/demucs`, `htdemucs_ft` | Maintenance pace, PyTorch/torchaudio compatibility, model license, CPU/Apple Silicon speed. |
| ASR timing | `whisper-timestamped` or WhisperX/faster-whisper | Singing accuracy, per-word confidence usefulness, memory footprint, language behavior. |
| Forced alignment | WhisperX canonical segments | Supported language models, text normalization, regressions around unknown characters and numbers. |
| Alternative aligner | `ctc-forced-aligner` | Default weight license is noncommercial; select commercially compatible weights before launch. |
| Baseline pipeline | `syncalong` | Word-level internal API, remote-worker design, vocal separation behavior, test fixtures. |
| Scheduling | `ts-fsrs` | FSRS major-version behavior, parameter optimization only after enough review history. |
| Audio conversion | FFmpeg | Bundling/license obligations and deterministic builds per target platform. |
| Mobile audio | AVAudioEngine | Background/interruption handling, sample-accurate restart, decoded-buffer memory. |
| Emerging singing models | Singing-specific ASR/alignment research | Benchmark before adoption; do not replace a stable pipeline based on demo quality alone. |

Create `DEPENDENCIES.md` or an automated software bill of materials during Phase 1 with, for each code package and model:

- Source URL and pinned revision/version.
- Code license.
- Model-weight license.
- Training-data restrictions when disclosed.
- Download size and expected hardware.
- Known supported languages.
- Reproducible install command.
- Last benchmark result on the gold set.
