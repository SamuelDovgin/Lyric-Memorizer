# Lyric Memorizer: research, market comparison, and feature priorities

Research date: September 7, 2026. This is a product recommendation, not a change to the app’s accepted requirements.

## Recommendation

Keep the pleasure and continuity of the existing lyric player. Make it substantially easier to practice a difficult passage, remember what needs attention, and return to it after a delay. Add personally meaningful visual cues. If the goal extends to singing without reading or following the original singer, provide optional opportunities to practice under those conditions.

The strongest evidence supports spaced practice and retrieval. A particularly relevant song experiment supports phrase illustrations. Precise loop controls, phrase expansion, and better playback layout are practical product hypotheses: they should reduce wasted interaction, but published research does not establish their exact effect on memorization speed.

Define the desired outcome before measuring speed: fewer total minutes to reproduce the lyrics accurately, in sequence and on time, with the intended accompaniment, and still do so the next day. Same-session fluency, enjoyment, confidence, and exposure are useful but different outcomes.

## What is actually in the current app

Inspected the active source and the running app at desktop size and 390 × 844. The UI was reviewed while paused; this was not an acoustic test of loop joins or a background-playback certification.

| Current capability | Finding and implication |
| --- | --- |
| Active route | `App.tsx` imports `PlayerPage.tsx`. The older `RehearsalPage.tsx` is not the mounted player. Treat README and rehearsal-design claims as historical unless confirmed in active code. |
| Playback | Original recording, previous/next song, library shuffle, repeat-library and repeat-song, seeking, saved position, compact library player. Good foundation for enjoyable listening. |
| Lyric navigation | Clickable lyrics and section headings, synchronized line following, manual browsing with Follow lyrics. Preserve these. |
| Repetition | Whole-section loop buttons exist. Active player schedules a zero-gap return. It lacks exposed custom phrase selection, musical lead-in, and count-in controls. |
| Feedback | The library has a five-level song confidence scale. Whole-section rehearsal ratings exist in the older component but are not exposed by the active player. |
| Progress | Completed section listens are exposure counts, based on at least 90% coverage in a continuous visit. They do not establish that the learner sang or recalled anything. |
| Visual cues | Reviewed, anchored emoji pins and a density slider already exist. Cue meanings are stored, but the rendered emoji is hidden from accessibility APIs and its explanation is primarily a hover title. |
| Sound controls | The active player has no visible speed or singer-volume control. The transport has stem gain infrastructure, but the active player chooses the original recording when available. A singer slider needs an actual source/mix path, not merely a UI addition. |
| Session continuity | Position saves; the active loop selection is component state and is not restored as a saved learning session. |
| Phone UI | A permanent roughly 112 px sidebar competes with lyrics; narrow section labels wrap heavily. The emoji slider sits between Play and Next song. |

Relevant code: [App.tsx](/Users/samueldovgin/Developer/Lyric-Memorizer/src/App.tsx), [active player](/Users/samueldovgin/Developer/Lyric-Memorizer/src/pages/PlayerPage.tsx), [older rehearsal component](/Users/samueldovgin/Developer/Lyric-Memorizer/src/pages/RehearsalPage.tsx), [transport](/Users/samueldovgin/Developer/Lyric-Memorizer/src/audio/transport.ts), [emoji rendering](/Users/samueldovgin/Developer/Lyric-Memorizer/src/components/PinnedLyrics.tsx).

## Market comparison

This is a comparison of documented product capabilities, not hands-on testing of paid competitors or a market-share estimate. “Gap” describes fit for this goal or what the reviewed materials do not document; it is not proof a feature is absent everywhere. Prices are omitted because the decision here is which capabilities to build.

| Product | Relevant documented strengths | What to borrow | Opportunity for this app |
| --- | --- | --- | --- |
| **LyriCue** | Progressive word/letter/line hiding, emoji substitutions, annotations, imports, setlists; premium listing includes playback links to streaming services. | Easy personal cue editing and direct focus on remembering exact lyrics. | The closest direct comparator. Emoji cues alone are not a unique market position. Differentiate through timed passage rehearsal and low-effort session continuity. [Developer App Store listing](https://apps.apple.com/us/app/lyricue-memorize-lyrics/id6755578205). |
| **Moises** | Stem separation, lyrics/chords, song sections, speed and pitch tools, metronome, setlists; platform documentation includes looping and count-ins. | Convenient speed/singer controls, section access, and musical preparation. | These are competitive baseline tools. A lyric-specific plan for difficult starts, transitions, and later returns is a more focused proposition. [Features](https://moises.ai/features/), [platform capabilities](https://help.moises.ai/hc/en-us/articles/12156312650012-Is-Moises-different-across-platforms-and-devices). |
| **Amazing Slow Downer** | Speed changes without pitch changes, loop points, shortcuts, local audio formats. | Fast, dependable loop and tempo adjustment. | Combine that precision with readable lyric selection instead of requiring repeated timeline editing. [Roni Music](https://www.ronimusic.com/software.htm). |
| **Apple Music Sing** | Real-time highlighted lyrics and adjustable vocals on supported songs/devices. | Visually clear current/upcoming lyrics and a simple singer control. | A strong convenience benchmark; the cited workflow does not describe passage-level learning history or planned revisits. [Apple guide](https://support.apple.com/en-lamr/guide/iphone/iphe16e0f316/ios). |
| **LyricsTraining** | Missing-word exercises with music videos; full-lyric karaoke mode; language-learning focus. | Easy song entry and immediate feedback when a learner wants exercises. | Typing missing words is not the same task as singing a whole verse in time. Preserve musical performance as the main interaction. [About](https://lyricstraining.com/about). |
| **Anki** | Spaced retrieval scheduling, configurable cards, audio/image support. | Returning after a delay and keeping successful recall separate from familiarity. | Keep the music running and remove card-authoring effort. Do not translate subjective singalong confidence into valid FSRS review grades. [Background](https://docs.ankiweb.net/background.html), [deck options](https://docs.ankiweb.net/deck-options). |
| **Rehearsal Pro** | Recorded scenes, automatic repetition, repeating scene groups, script annotations, blackout/reveal. | Connected passages and cue-to-response practice. | Song learning additionally needs musical entrances and synchronized accompaniment. [Product page](https://rehearsal.pro/). |

Positioning hypothesis: **A lyric rehearsal player that gets you back to the words you stumble on, with the right musical entrance, and helps them stick between sessions.** This needs user validation; the review does not establish an uncontested market niche.

## Memory research translated into product decisions

Evidence labels distinguish direct song experiments, general memory experiments, and preliminary observational or instrumental findings. Most UI recommendations below are extrapolations rather than features directly tested by these papers.

| Paper | Finding and limits | Feature implication |
| --- | --- | --- |
| **Katz, Ando & Wiseheart (2021), Optimizing song retention through the spacing effect** | 87 participants learned an unaccompanied two-verse song to 95% word accuracy. Reviews after two days or one week improved later lyric retention relative to a ten-minute gap; final testing was three weeks after review. Two days versus one week did not differ reliably. Melody findings were less convincing. Direct song evidence, not a validated app schedule. | Prioritize returning across days. Do not promise that longer intervals are always better or treat uninterrupted looping as equivalent. [Full paper](https://pmc.ncbi.nlm.nih.gov/articles/PMC8665960/). |
| **Napadow & Harmat (2024; online 2023), Memorizing song lyrics: Comparing the effectiveness of three learning formats** | 95 Swedish-speaking choristers learned a 31-word song. Mean recall: phrase illustrations 19.71 words, audio alone 14.53, text support 13.50. Images outperformed both; text and audio did not differ significantly. Recall followed a distractor task, not a multi-day retention test. Scoring did not require correct within-phrase word order. The experiment did not test images plus text. | Test meaningful phrase cues; it does not prove that this app’s emoji overlays improve exact sung recall. Echo practice was shared across conditions, so its independent benefit was not isolated. [Full paper](https://journals.sagepub.com/doi/10.1177/03057356231211810). |
| **Roediger & Karpicke (2006), Test-Enhanced Learning** | In prose-learning experiments, repeated study was better on a five-minute test; retrieval practice was better after two days or one week despite higher confidence after restudy. General verbal memory, not singing. | Optional sing-from-memory attempts with later correction; distinguish reading along from recall. [Paper](https://doi.org/10.1111/j.1467-9280.2006.01693.x). |
| **Cepeda et al. (2006), Distributed practice in verbal recall tasks** | Meta-analysis covering 317 experiments and 839 assessments. Useful spacing depends on the final retention interval. Broad evidence across verbal tasks, not a universal song schedule. | Let the learner specify an upcoming performance or maintenance goal; make revisit timing adjustable. [Research abstract](https://pubmed.ncbi.nlm.nih.gov/16719566/). |
| **Rawson & Dunlosky (2011), Optimizing schedules of retrieval practice for durable and efficient learning** | Three experiments, 533 students, conceptual materials. Relearning in later sessions improved long-term retention efficiently. Their numerical initial-recall criterion should not be imported as a proven rule for verses. | Keep later successful returns in the history instead of retiring a passage after one smooth session. [Research abstract](https://pubmed.ncbi.nlm.nih.gov/21707204/). |
| **Ginsborg (2002), Classical Singers Learning and Memorising a New Song** | Observational study of 13 singers over six 15-minute sessions. Faster, more accurate memorisers began memorising earlier and more often counted beats aloud. Small observational sample; cannot establish that counting causes faster learning. | Optional entrance preparation and earlier attempts without dependence on a score. [Paper abstract](https://journals.sagepub.com/doi/10.1177/0305735602301007). |
| **Carter & Grahn (2016), Optimizing Music Learning** | Ten advanced clarinetists tried blocked and interleaved practice; results sometimes favored interleaving but varied across raters. Small instrumental study, not lyric recall. | Offer a visible, editable rotation among sections; do not claim random song shuffle is scientifically optimized practice. [Full paper](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2016.01251/full). |
| **Noice (1993), Effects of rote versus gist strategy on the verbatim retention of theatrical scripts** | Processing meaning supported literal script recall compared with constrained rote repetition. Actors and students were studied; this is adjacent verbal-performance evidence. | Add a short personal meaning/story note to a difficult transition. Meaning supports exact-word rehearsal rather than replacing it. [Paper abstract](https://onlinelibrary.wiley.com/doi/abs/10.1002/acp.2350070108). |
| **Wammes, Meade & Fernandes (2016), The drawing effect** | Seven experiments found recall advantages for drawing words over writing them. Drawing is active encoding; viewing an automatically supplied emoji is a different intervention. | Let users create or explain a cue. Treat its benefit for lyrics as a hypothesis. [Paper abstract](https://journals.sagepub.com/doi/10.1080/17470218.2015.1094494). |
| **MacLeod et al. (2010), The production effect** | Eight recognition experiments examined benefits of saying studied words aloud; the original results emphasized mixed lists and distinctiveness. This does not demonstrate a universal benefit from singing everything aloud. | Encourage actual vocal practice when appropriate, but never count playback duration as evidence of singing or learning. [Research abstract](https://pubmed.ncbi.nlm.nih.gov/20438265/). |

Bibliographic correction: the historical product blueprint attributes the song-spacing paper to Simmons. The linked 2021 paper is by **Joel J. Katz, Momo Ando, and Melody Wiseheart**.

## Ranked feature backlog

Ranking is judgment about expected value for this app, not an experimentally established ordering. Effort is relative to the current code and excludes uncertain audio-processing work. No percentage speed improvement is justified yet.

| Rank | Feature and exact behavior | Why it earns priority | Evidence / effort |
| --- | --- | --- | --- |
| **1** | **Saved focus + later returns.** Remember song, section/phrase, loop, cue choice, playback settings, and last practiced date. Library offers “Continue Verse 2” and “Revisit earlier passages.” Learner chooses when to return. | Eliminates repeated setup and introduces practice across days without a quiz workflow. | Strong spacing basis; medium. |
| **2** | **One-action difficult-spot marker + precise phrase loop.** “Mark this phrase” saves the current phrase with Undo. Select first/last lyric to create a loop; include a section shortcut and ±1 line boundary adjustments. | Concentrates time on the exact bottleneck instead of replaying an already familiar 40-second verse to reach two difficult lines. | Practical hypothesis; medium. |
| **3** | **Optional attempt without help.** Keep normal lyrics visible by default. An explicit optional performance workflow can offer a look-away attempt or user-chosen reduced cues, with a whole-pass singer reduction when stems are available. Correction follows the attempt. | Highest-priority additional learning mechanism if the outcome is independent recall; singing while reading cannot establish that outcome. | Strong general retrieval basis; medium/high. **Would extend the current visible-lyrics-only direction.** |
| **4** | **Personal phrase cues.** Keep existing pins; add a line-opening or phrase cue that the user can replace, explain, or remove. Offer a brief section story and an accessible cue explanation. | Helps distinguish passages and offers another route into a forgotten line. | Direct image-support signal with substantial transfer limits; small/medium. |
| **5** | **Musical loop entrances and exits.** Default to a verified pickup/short original lead-in; offer direct entrance, previous phrase, or confirmed count-in. Audition the return and nudge boundaries. Preserve sustained endings. | An abrupt first consonant or clipped breath makes every repetition harder. | Usability hypothesis with observational timing support; medium. |
| **6** | **Connected phrase expansion.** After selecting two lines, one button adds the next line; another restores the whole verse. Include the prior phrase when practicing a transition. | Moves from fixing words to joining them in performance. Prevents success only inside a tiny loop. | Task-specific inference; medium. |
| **7** | **Pitch-preserving speed presets.** Offer 0.75×, 0.85×, 1.00× and finer adjustment, with one-action original tempo. Save per passage. An optional ramp changes at a loop boundary and is always cancelable. | Particularly useful when articulation and processing time are limiting factors. Always return to performance tempo. | Competitor baseline, unquantified memory benefit; high if transport needs time stretching. |
| **8** | **Editable section rotation.** Preview “Verse 1 → Verse 2 → return to Verse 1.” Learner opts in, sets repeat counts or changes sections manually, and can stay indefinitely. Switch only after the current passage. | Builds variation into practice while preserving control and musical continuity. | Strong spacing rationale; tentative interleaving transfer; medium. |
| **9** | **Transition and opening practice.** Save “last phrase of Verse 1 → Chorus” or “start Verse 2 after instrumental.” Later offer a user-requested start from any saved section. | Trains the moments where sequence and entry fail, not only the middle of a repeated verse. | Performance-task inference; medium. |
| **10** | **Changed-repeat comparison.** Detect exact repeats conservatively; show changed words/endings in a small comparison view. Keep occurrence identity and separate transition history. | Targets confusion between similar choruses or verses. Never transfer readiness automatically between them. | Hypothesis to test; medium. |
| **11** | **Accessible singer volume.** Original / quieter singer / accompaniment control when usable stems exist. Keep one audio clock and make mix changes at sensible boundaries. | Helps the learner hear their own delivery and optionally reduce reliance on the singer. Lyrics can remain visible. | Competitive baseline; medium/high. |
| **12** | **Meaning and pronunciation notes.** Short user-authored explanation, translation, or pronunciation cue attached to the problem phrase; collapsed while singing. | Addresses unfamiliar wording and similar-sounding passages without cluttering every line. | Adjacent semantic evidence; small. |
| **13** | **Low-interaction playback.** Large replay/play/next-section actions; persistent state after navigation; supported headset/lock-screen controls; retain lyrics while offline where feasible. | Makes more situations usable for practice and reduces transport management. | Usability hypothesis; variable engineering effort. |
| **14** | **Useful learning history.** Display separate completed listens, self-reported confidence, and optional dated recall attempts. Record cue/singer conditions for attempts. | Makes progress interpretable; avoids inflated “mastered” numbers. | Measurement integrity; medium. |
| **15** | **Optional record-and-review.** Record a chosen pass, then compare with the canonical lyric and original recording. Let the user mark a stumble. | Supplies feedback without requiring a singing-recognition model. | Useful evaluation tool; medium/high; after core playback work. |

For the current visible-lyrics direction, build **1, 2, 4, 5, and the layout changes first**. Rank 3 describes a possible future expansion, not a mandate to restore flashcards, hidden words, or FSRS. User-controlled look-away practice can also happen outside the app.

## Playback UI specification

### One player with two clear intents

Use **Listen / Practice** on the same player, sharing the audio instance and current position. Switching intent must not restart the recording. Listen retains library queue, shuffle, and song repeat. Practice makes the selected passage and its actions prominent. Existing emoji controls stay available under Lyrics; an optional compact cue control can remain visible for frequent use.

Practice’s primary row: **Replay passage · Play/Pause · Next section**. Label section navigation explicitly; reserve track-skip icons for song navigation. Put song queue/shuffle in Queue during practice. Do not place the emoji density slider between Play and Next.

### Desktop and phone

On desktop, keep the song map but prioritize selected passage, saved difficult spots, and last practice. Make play counts secondary. Use a readable lyric stage with previous context, active phrase, and upcoming phrase; retain access to the full text.

On phone, replace the permanent sidebar with a **Sections** sheet or expandable selector. Give lyrics the full available width. Use stable line spacing and reserve cue space so changing pins does not move the words. Avoid excessive top padding that leaves few useful lines visible. Keep the next line readable rather than heavily dimmed.

Keep touch targets around 44 × 44 CSS pixels where practical; provide keyboard equivalents and visible focus. Cue explanations need a tappable and screen-reader-accessible control. Preserve the existing reduced-motion and manual-browsing behavior.

### Scope and state must be explicit

Above transport, show **“Looping Verse 2 · lines 3–4 · pass 2”**. Highlight the exact loop range in the lyric view and on a section-marked timeline. Provide distinct **Exit loop** and **Replay passage** actions.

Current issue: clicking the selected loop button calls `transport.seek(section.start)` even when disabling the loop. Proposed contract: **Exit loop continues from the current playhead**. Replay deliberately restarts. Starting a loop while paused should preserve pause unless the button explicitly says “Play loop.”

If another section is selected during a practice pass, display **“Next: Bridge, after this pass · Cancel.”** Offer Jump now as an explicit alternative. These are proposed practice semantics; ordinary Listen navigation can continue seeking immediately.

Separate “now playing,” “selected loop,” and “next section” visually and in accessible labels. A single active color is insufficient when the learner is browsing while the music continues.

### Learning controls belong near playback

Show compact **Speed · Singer · Entrance · Lyrics** controls. Open a small sheet for detailed adjustment. Lyrics contains font size, cue amount, and cue editing. Timing repair and import tools belong in song settings, with a contextual “Fix this boundary” action when a loop sounds wrong.

Always show the original-tempo reset. Disable singer reduction with a useful explanation when stems are unavailable; do not suggest that the original mixed recording can be independently faded by the existing gain control. Offer direct entrance if beat timing is unverified. Prefer accurate line sync over an expensive word-animation layer with unreliable timestamps.

### Session start and finish

Library’s first useful action is **Continue [last passage]**, followed by choose song and choose saved difficult spots. A short session can be suggested, but never terminate playback automatically without the learner selecting a bounded plan. At finish, save the next intended passage and offer a later revisit. No notification or automation is created by this report.

## Example learning session

An illustrative ten-minute plan, not a scientifically optimized prescription:

1. Spend about one minute revisiting a passage from a previous day before repeated listening makes it feel familiar again.
2. Spend about three minutes on today’s difficult verse; isolate only the troublesome phrase if the whole verse is inefficient.
3. Spend about two minutes joining that phrase to what comes before and after it.
4. Spend about two minutes on another section, then return to the first.
5. Finish with about two minutes of connected singing at normal tempo and save the next focus.

For independent memorization, include a voluntary attempt without reading/hearing the answer, followed by correction. For visible-lyric rehearsal, retain the words and describe outcomes as confidence and practice history. Both can be useful; they supply different evidence.

## Validation and build order

First: focused loops, musical returns, clear transport scopes, phone layout, saved sessions, and corrected help text. Reuse well-tested parts of the old rehearsal code selectively instead of reconnecting an entire outdated flow.

Next: personal cues, phrase expansion, and later-return suggestions. Add speed and singer control after checking audio requirements. Experiment with optional performance attempts only as a deliberate product extension.

Evaluate one intervention at a time against the current player, using unfamiliar matched passages and counterbalanced assignment. For a personal trial, use several passage pairs over multiple days; do not reuse a learned passage as its own fresh baseline. A small usability pilot can identify friction, but cannot establish general learning efficacy.

Primary outcome: total setup plus active practice minutes to a predeclared accurate performance criterion, then retention after 24 hours and seven days without warmup. Count wrong/missing words, sequence mistakes, failed entrances, and hints separately. Keep accompaniment and scoring conditions consistent across comparisons. Use recordings reviewed by a person when exact timing and wording matter.

Secondary outcomes: time to start the intended passage; number of scrubs, taps, and interruptions; useful singing time; rejected automatic switches; cue usefulness; desire to return. Record enjoyment and fatigue separately from recall.

A possible criterion is at least 95% correct words plus all intended section starts and no unplanned stops on a delayed run. That is an evaluation choice, not a universal scientific definition of mastery.

Defer automatic singing scores, generative remixes, forced quizzes, streak optimization, elaborate scheduler tuning, more emoji coverage for its own sake, and precise mastery percentages inferred from listens. The first question is whether the learner gets more accurate singing practice with less setup and remembers more after a delay.

## Implementation ranking: intuitiveness and value

Added September 7, 2026. This ordering emphasizes the best balance of ease of use and expected benefit for the current app. It complements the research-oriented backlog above; it is not a numerical average or an experimentally established ordering.

**Scores: 5 = best.** Intuitiveness means easy to understand without instructions. Value means expected benefit to useful practice and memorization. These are product judgments informed by the research and app review, not measured learning effects. Implementation effort is a separate consideration; an intuitive control can still require substantial engineering.

| Overall order | Feature | Intuitiveness / 5 | Value / 5 | Why |
| --- | --- | --- | --- | --- |
| **1** | **Continue your last practice — implemented** | **5** | **4** | One button returns to the section and position you were practicing. Removes repeated setup. |
| **2** | **Replay this phrase — covered by tapping a timed lyric** | **5** | **5** | Existing line navigation returns to the selected lyric without timeline scrubbing. A separate replay button is not needed for this use case. |
| **3** | **Mark a difficult spot** | **5** | **5** | Tap once while listening; return to those spots later. Directs effort where it matters. |
| **4** | **Full-width phone lyrics + simpler controls** | **5** | **4** | More readable words, fewer competing controls, easier operation while singing. |
| **5** | **Slow down without changing pitch** | **5** | **4** | Familiar speed control gives you time to understand and deliver dense lyrics. |
| **6** | **Loop selected lyric lines** | **4** | **5** | Practice two troublesome lines instead of repeating an entire verse. |
| **7** | **Return to previous difficult spots across days** | **4** | **5** | Makes spaced practice convenient. Offer suggestions without forcing a schedule. |
| **8** | **Quieter singer control** | **5** | **4** | Hear yourself and gradually reduce reliance on the recording. Requires usable stems. |
| **9** | **A natural lead-in before each repeat** | **4** | **4** | Gives you time and musical context to enter correctly. Mostly works automatically. |
| **10** | **Expand a phrase into the whole verse** | **4** | **4** | Connects individually learned lines into a continuous performance. |
| **11** | **Personal emoji or meaning cues** | **4** | **3** | Can help trigger forgotten words, but cue quality and personal meaning matter. |
| **12** | **Practice section openings and transitions** | **3** | **4** | Targets blanking at entrances and between sections; needs clearer explanation. |
| **13** | **Optional sing-from-memory attempt** | **3** | **5** | Valuable for independent recall, but adds a new workflow beyond visible-lyric rehearsal. |
| **14** | **Automatically rotate practice sections** | **3** | **4** | Could reduce repetitive overpractice, but unexpected switches can feel confusing. |
| **15** | **Record and review your singing** | **4** | **3** | Useful feedback, with extra recording and review effort. |

### Recommended next implementation

**Full-width phone lyrics + simpler controls.** Tapping a timed lyric already returns to that line, so a separate replay action duplicates existing navigation. Prioritize phone readability and access instead. A bounded phrase loop is a separate feature from jumping back to a line.

For memory value alone, later revisits and voluntary recall attempts deserve the highest priority. For the best balance of simplicity and value, replay, difficult-spot marking, and saved practice are the preferred starting points.

### Completed implementation: Continue practice

Choose a section’s **Loop** button, then use **Continue [section name]** from its library card. The action restores the saved section loop and position and starts playback, including after reopening the app in the same browser. Selecting another loop replaces the saved practice section. Regular library autoplay does not restore practice loops, and changed lyric timing invalidates outdated bookmarks.

This implements saved focus, not automatic scheduling or reminders. Its expected benefit is less setup and easier return to practice; it does not itself demonstrate a memory improvement.

Validation at implementation: all **48 frontend tests** and the **production build** passed. The running app was also checked for saved-section restoration and playback after reload.
