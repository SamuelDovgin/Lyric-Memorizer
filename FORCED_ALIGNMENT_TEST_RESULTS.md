# Forced-alignment implementation and test results

September 9, 2026 · Local Apple Silicon Mac · Engine `forced-v3`

## Status

The preview is implemented and available in **Edit song → Timing method → Align known lyrics to audio · preview → Save & redo timings**. The same engine is available in player settings. Gorgeous has been processed through the real button and saved. A song remembers the forced method after a forced run; other songs retain the legacy default until the preview is selected.

**Listening accuracy remains unvalidated.** The user chose to check the result afterward and provide corrections. No manually verified onset labels were supplied, so median error, p90 error, and wrong-occurrence accuracy are not claimed. Structural checks, real model execution, and browser seeks are different forms of evidence from listening verification.

## Delivered

- Known-text Stable-ts alignment in a separate, pinned model environment.
- Reference classification: verified lines locked; catalog/model timings soft; drafts excluded as anchors.
- Ordered coarse alignment when references are absent; section/passage alignment with neighboring context when available.
- Canonical text, IDs, section IDs, tokens, and annotations preserved.
- Explicit handling of main vocals versus parenthetical backing phrases in the alignment text.
- Strict output identity, bounds, order, evidence, crop-edge, overlap-context, and locked-reference checks.
- Bounded retries using the owning section, wider context, an existing vocal stem, and an optional larger model.
- Singing configuration disables speech-oriented word-duration re-alignment limits, which otherwise moved sustained phrases.
- Line-only timing output; estimated tokens do not qualify as precise word timings.
- Per-line quality and evidence, run provenance, recording/lyric hashes, reference-offset diagnostics, raw candidate artifacts, and cache invalidation.
- Revision-checked application, original snapshots, and undo that refuses to overwrite newer edits.
- Explicit applied/partial/unchanged/failed outcomes, review labels, and a Next line to review control.
- A benchmark CLI exporting blank human-onset labels, checking recording identity, and holding evaluation labels out from model reference input.

## Real-model runs

These counts describe software acceptance under provisional evidence checks. They are **not** accuracy percentages. Runtime excludes environment installation and cold model download/loading; benchmark runtime starts after model loading.

| Recording | Lines | Model-supported lines | Flagged for review | Alignment runtime | Saved result |
| --- | ---: | ---: | ---: | ---: | --- |
| Doja Cat - Gorgeous (Official Video) | 94 | 80 | 14 | 30.1s | Saved through app |
| Doja Cat - Cards (Audio) | 60 | 47 | 13 | 25.1s | Benchmark only; library unchanged |
| Jealous Type | 43 | 39 | 4 | 9.2s | Benchmark only; library unchanged |

All trials used the original recording and Whisper small on CPU, with Stable-ts 2.19.1 and Torch/Torchaudio 2.11.0. Automatic vocal separation and larger-model retries were not needed to execute these trials; their acoustic benefit is not established by these runs.

## Gorgeous browser test

The actual Save & redo timings button completed with the forced engine, showed a partial-result message, and persisted a new revision. A fresh browser session verified that lines 1, 5, 45, 78, and 94 seek to their saved timestamps (0.00, 19.48, 130.74, 219.75, and 260.80 seconds). The review queue advanced correctly and the undo control was visible; the saved result was not reverted. Across development runs the system revised the prior catalog timing. The final run revised 17 boundaries relative to the preceding trial; 80 lines are currently model-supported and 14 retain a review flag. All 94 lines have a usable saved timestamp, including the final intro repetition. Coverage does not establish synchronization accuracy.

The opening line remains flagged for weak audio evidence and retains its previous start. The newly recovered final intro repetition is estimated at 19.48 seconds. Check these entrances and the repeated post-choruses by listening.

Raw Gorgeous candidate and rollback snapshot:

- [Candidate](/Users/samueldovgin/Developer/Lyric-Memorizer/services/audio_worker/data/alignment-runs/job_edbf30ab409d4a04b3ca6d81c051657b/candidate.json)
- [Before this run](/Users/samueldovgin/Developer/Lyric-Memorizer/services/audio_worker/data/alignment-runs/job_edbf30ab409d4a04b3ca6d81c051657b/before.json)
- [Blank listening labels](/Users/samueldovgin/Developer/Lyric-Memorizer/services/audio_worker/data/alignment-runs/job_edbf30ab409d4a04b3ca6d81c051657b/human-labels.json)

## Automated checks

**Final check: 55 frontend tests and 88 worker tests passed (143 total), and the TypeScript/production build passed.** `git diff --check` passed as well. Run `npm run check` to repeat the automated checks. New cases cover absolute timestamp conversion, canonical identity, repeated lines, locked references, invalid model output, low evidence, retries, cache reuse/invalidation, coarse alignment, speech-duration configuration, benchmark label integrity, explicit engine selection, stale results, missing dependencies, undo protection, and the review queue.

## What remains before default rollout

1. The user’s listening review and independently marked onset intervals on the exact recordings.
2. Held-out benchmark evaluation against the original catalog/transcription results; quantify median/p90 error and wrong-occurrence mistakes.
3. Calibration of acceptance thresholds and tests on more artists, languages, edited recordings, and vocal-separation conditions.
4. Broader automatic enablement only after those results support it.

The three current recordings are English Doja Cat songs. They exercise singing, rap, repetition, and spoken/backing material, but do not establish broad artist/language generalization. The optional supported-language selector is not a claim of measured multilingual accuracy.
