export function AlignmentOptions() {
  return <div className="alignment-options" aria-label="Timing method">
    <small>Timing method</small>
    <b>Whisper large-v3 forced alignment</b>
    <p>Uses the higher-accuracy Whisper model and your lyrics to estimate line starts. Existing timestamps guide the search; manually verified lines stay locked. Imports are queued one at a time to keep memory use safe. Please check the result by listening.</p>
  </div>;
}
