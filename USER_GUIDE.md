# How to use Lyric Memorizer

Practice a whole verse, chorus, or bridge. Keep singing it until you feel ready to choose another section. The lyrics always stay visible.

This guide is also available through **Guide**, the player's **?**, and **How to use**.

## Start the app

Requirements: Node 20+, Python 3.11+, and FFmpeg/ffprobe.

```sh
npm install
python3 -m pip install -r services/audio_worker/requirements.txt
npm run dev
```

Open [the local app](http://localhost:5173).

## Add a song and its sections

Choose **Add song**, select your recording, and add the exact lyrics as performed. You can fetch catalog lyrics and timing with **Get lyrics + sync**, or paste them yourself.

Use headings such as `[Verse 1]`, `[Chorus]`, `[Verse 2]`, and `[Bridge]`. Keep repeated choruses in their performed positions: each occurrence gets its own section heading and rating.

The app preserves supplied headings, including plain headings such as `Verse 1:`. Without headings, it uses stanza breaks, repeated lyric blocks, and reliable timing gaps. Repeated blocks may be labeled **Chorus (suggested)**; ambiguous passages receive neutral **Section** labels and are split into at most eight lines. These are editable practice suggestions, not guaranteed musical analysis. If boundaries are wrong, use **Timing** to split and rename sections. Reliable timing is required across the selected section. Original audio plays without stem separation.

## Choose → repeat → rate → move on

1. Open **Rehearse**. All lyrics are visible, grouped under clickable section headings with saved ratings. Choose **Freeplay from beginning** to hear the whole recording.
2. Choose a section. It starts playing and repeats in full.
3. Sing along for as many passes as you want. You do not have to select or judge individual lines.
4. Rate the section whenever you want:
   - **J / Needs practice**
   - **Getting there**
   - **K / Ready**
5. When you want something else, choose **Choose / change section**, then click another heading.

While playing, the new section is queued for the current section ending. Your current performance finishes before the switch. While paused, choosing a section starts it immediately. During a committed count-in, wait until the entrance before changing sections.

**Ready does not stop repetition or move you automatically.** All ratings describe your confidence, not a score or proof of mastery. Change a rating whenever it feels different. There are no spontaneous line detours, timed revisits, or forced session endings.

Opening rehearsal again shows all lyrics and your saved ratings so you can choose today's starting point.

## Freeplay and navigate freely

**Freeplay** releases the section loop and starts the original recording from the beginning. Press Play/Pause to pause or resume.

Clicking a lyric enters Freeplay and jumps directly to that line, with a tiny entrance margin. Playing audio keeps playing; paused audio stays paused. Search or scroll without moving playback, then choose **Follow song** to recenter.

A custom loop is still available: choose **Select loop**, select first and last lines, then **Loop selection**. Direct lyric navigation releases it. Custom loops do not receive whole-section confidence ratings.

Returning to the library keeps playback available in a compact bottom bar.

## Optional musical reset

In **Settings**, choose one, two, or four count-in beats:
- **Quiet clicks:** a brief metronome with no recording underneath.
- **Silent visual pulses:** the same reset without click audio.
- **Off:** repeat without a counted gap.

A confirmed beat map is required for count-ins. Use **Analyze beats**, audition the pulse with **Hear beats with song**, then confirm it. Or enter a steady BPM and a known beat anchor. Preserve detected beat timestamps for variable-tempo recordings.

Repeats default to a direct entrance. A short pickup or previous-line lead-in is optional. Clicking a lyric always enters directly regardless of that setting. Pausing during a count-in restarts that count when you resume.

Automatic beat estimation requires:

```sh
python3 -m pip install -r services/audio_worker/requirements-rhythm.txt
```

## Fix lyric timing

Open **Timing**, select a line, and play the recording using the drawer controls. Mark its start and end at the playhead or enter seconds. Listen, check the verification box, and save.

You can also rename a section or start a new section at a selected lyric. Estimated lines remain readable, but a section with unreliable timing needs repair before looping. Boundary edits do not certify word-level synchronization.

Catalog timing is available without stems. Optional vocal separation and local word refinement require:

```sh
python3 -m pip install -r services/audio_worker/requirements-ml.txt
```

Model weights download on first use. These enhancements are optional; original playback remains available if they fail.

## Keyboard reference

| Key | Action |
| --- | --- |
| Space | Play / pause; in Rehearse, choose a section first |
| J | Selected section needs practice |
| K | Selected section feels ready |
| R | Replay the selected section at its ending |
| Left / Right | Navigate lyrics directly |
| L | Toggle a custom loop |
| Escape | Release an uncommitted repeat and continue listening |

Shortcuts are inactive while typing or using a dialog. Mouse and touch controls are available for every primary action.

## Saving and sound

Section ratings, position, loop, and settings save locally and sync to the local worker. The same browser retains them if the worker disconnects temporarily. Reloading audio needs the worker; decoded audio can continue in an already open page.

Optional stems enable singer-volume control. Lyric size and visual sync offset are in Settings. Background playback depends on the browser/device.

Audio remains local. Catalog lyric lookup sends track metadata to LRCLIB. Existing legacy practice history is retained but does not determine section ratings.

## Troubleshooting

| Symptom | What to do |
| --- | --- |
| One huge section | Add section headings or split sections in Timing |
| Section opens Timing instead of playing | Verify the line boundaries throughout that section |
| Ready keeps repeating | Choose another section or start Freeplay; ratings never force a move |
| Count-ins are missing | Confirm beat timing and enable clicks or silent pulses |
| Entrance feels abrupt | Adjust timing or try an optional pickup |
| Worker offline | Run `npm run dev` and check terminal errors |
| Recording too large | Import a shorter excerpt; buffered playback has a decoded-memory limit |
