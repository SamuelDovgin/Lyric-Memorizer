export function UserGuide() {
  return <div className="user-guide"><h2>Your music.<br/>Room for every word.</h2>
    <section><h3>Just listen</h3><p>Open a song and press Play. Lyrics move smoothly as each line arrives. Click any lyric or a section in the left panel to jump there. Playback continues in order.</p></section>
    <section><h3>Your song map</h3><p>The left panel stays available while browsing your library or adding another song. Scroll lyrics freely; Follow lyrics returns to the current line. Space plays or pauses; arrow keys move between lines.</p></section>
    <section><h3>Every listen adds up</h3><p>Each section shows its lifetime completed plays. Listen through at least 90% of the section in one visit to count a play. Pausing is fine; seeking resets the visit. Counts save in this browser and sync to the local database. They describe listening, not mastery.</p></section>
    <section><h3>Better section headings</h3><p>Paste a Genius song URL during import to fetch lyrics with verse and chorus labels using LyricsGenius. Then check LRCLIB for timing. For existing songs, Settings → Get Genius sections matches headings to the current lyrics without replacing words or timing. Mismatched versions are rejected.</p></section>
    <section><h3>Make it yours</h3><p>Settings adjusts lyric size. Timing lets you fix line boundaries or rename and split sections. Automatic suggestions remain available when no source headings exist.</p></section>
  </div>;
}
