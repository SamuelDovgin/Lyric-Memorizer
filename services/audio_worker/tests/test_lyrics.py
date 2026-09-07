from services.audio_worker.alignment import align_anchored_hypothesis, align_hypothesis
from services.audio_worker.lrclib import apply_synced_lyrics, clean_track_title, parse_synced_lyrics
from services.audio_worker.lyrics import build_draft_alignment, parse_lyrics


def test_parse_sections_and_repetitions():
    parsed = parse_lyrics("[Verse]\nFirst line\n\n[Chorus]\nSame line\nSame line")
    assert [line.section for line in parsed] == ["Verse", "Chorus", "Chorus"]
    assert [line.text for line in parsed] == ["First line", "Same line", "Same line"]


def test_draft_alignment_is_monotonic_and_tokenized():
    lines = build_draft_alignment("[Verse]\nFirst exact line\nSecond line", 20, "song")
    assert len(lines) == 2
    assert lines[0]["start"] < lines[0]["end"] <= lines[1]["start"] < lines[1]["end"]
    assert [token["text"] for token in lines[0]["tokens"]] == ["First", "exact", "line"]
    assert all(token["confidence"] < 0.5 for line in lines for token in line["tokens"])


def test_asr_alignment_preserves_canonical_words():
    lines = build_draft_alignment("Hold on to me", 10, "song")
    hypothesis = [
        {"text": "hold", "start": 1.0, "end": 1.4, "confidence": .9},
        {"text": "on", "start": 1.5, "end": 1.7, "confidence": .9},
        {"text": "two", "start": 1.8, "end": 2.0, "confidence": .8},
        {"text": "me", "start": 2.1, "end": 2.4, "confidence": .95},
    ]
    aligned = align_hypothesis(lines, hypothesis)
    assert [token["text"] for token in aligned[0]["tokens"]] == ["Hold", "on", "to", "me"]
    assert aligned[0]["tokens"][0]["start"] == 1.0
    assert aligned[0]["tokens"][-1]["end"] == 2.4


def test_anchored_word_alignment_uses_the_correct_repeated_line_window():
    lines = build_draft_alignment("Hold on to me\nHold on to me", 20, "song")
    lines[0].update(start=2.0, end=5.0, timingSource="lrclib_synced_lyrics")
    lines[1].update(start=12.0, end=15.0, timingSource="lrclib_synced_lyrics")
    hypothesis = [
        {"text": word, "start": base + offset, "end": base + offset + .35, "confidence": .9}
        for base in (2.2, 12.2)
        for offset, word in ((0, "hold"), (.6, "on"), (1.2, "to"), (1.8, "me"))
    ]
    aligned = align_anchored_hypothesis(lines, hypothesis)
    assert aligned[0]["tokens"][0]["start"] == 2.2
    assert aligned[1]["tokens"][0]["start"] == 12.2
    assert aligned[0]["start"] == 2.165
    assert aligned[0]["end"] == 4.405
    assert aligned[0]["wordTimingCoverage"] == 1
    assert all(token["source"] == "whisper_anchored_word" for token in aligned[0]["tokens"])


def test_anchored_alignment_assigns_one_heard_repetition_to_the_earliest_word():
    line = build_draft_alignment("Are you happy happy happy", 10, "song")[0]
    line.update(start=2.0, end=6.0, timingSource="lrclib_synced_lyrics")
    aligned = align_anchored_hypothesis([line], [
        {"text": "are", "start": 2.2, "end": 2.5, "confidence": .9},
        {"text": "you", "start": 2.5, "end": 2.8, "confidence": .9},
        {"text": "happy", "start": 2.8, "end": 3.3, "confidence": .9},
    ])[0]
    assert aligned["tokens"][2]["source"] == "whisper_anchored_word"
    assert aligned["tokens"][4]["source"] == "interpolated_between_word_anchors"
    assert aligned["tokens"][3]["start"] >= aligned["tokens"][2]["end"]


def test_anchored_alignment_removes_the_silent_tail_before_the_next_lrc_line():
    line = build_draft_alignment("One accurate ending", 12, "song")[0]
    line.update(start=1.0, end=9.0, timingSource="lrclib_synced_lyrics")
    aligned = align_anchored_hypothesis([line], [
        {"text": "one", "start": 1.2, "end": 1.45, "confidence": .95},
        {"text": "accurate", "start": 1.55, "end": 2.0, "confidence": .95},
        {"text": "ending", "start": 2.1, "end": 2.55, "confidence": .95},
    ])[0]
    assert aligned["start"] == 1.165
    assert aligned["end"] == 2.605
    assert aligned["end"] < 9.0


def test_lrclib_mapping_merges_fragments_and_preserves_repetitions():
    lines = build_draft_alignment(
        "[Chorus]\nAre you happy? (Happy, happy)\nBrise mon cœur, encore, ce soir\n"
        "[Chorus]\nAre you happy? (Happy, happy)",
        30,
        "song",
    )
    synced = """[00:03.00]Are you happy?
[00:06.00]Brise
[00:07.00]Mon cœur
[00:08.00]Encore
[00:09.00]Ce soir
[00:10.00]
[00:18.00]Are you happy?
[00:21.00]
"""
    aligned, coverage = apply_synced_lyrics(lines, synced, 30)
    assert coverage > 0.65
    assert [(line["start"], line["end"]) for line in aligned] == [
        (3.0, 6.0),
        (6.0, 10.0),
        (18.0, 21.0),
    ]
    assert all(line["confidence"] >= 0.55 for line in aligned)
    assert all(token["end"] > token["start"] for line in aligned for token in line["tokens"])


def test_lrclib_parser_uses_blank_timestamp_as_end_boundary():
    entries = parse_synced_lyrics("[00:01.00]A line\n[00:02.50]\n[00:08.00]Next", 12)
    assert entries[0].end == 2.5
    assert clean_track_title("Doja Cat - Happy (Official Audio)", "Doja Cat") == "Happy"


def test_accepts_genius_markdown_and_removes_recommendations():
    raw = """[Chorus]\\
[First linked lyric](https://genius.com/example/First-linked-lyric)\\
[Second linked lyric](https://genius.com/example/Second-linked-lyric)\\
\\
[Pre-Chorus]\\
[A real pre chorus](https://genius.com/example/A-real-pre-chorus)\\
You might also like
[Unrelated Song](https://genius.com/unrelated-song-lyrics)
[Unrelated Artist](https://genius.com/unrelated-song-lyrics)
[Verse 1]\\
[The next real lyric](https://genius.com/example/The-next-real-lyric)\\
"""
    parsed = parse_lyrics(raw)
    assert [(line.section, line.text) for line in parsed] == [
        ("Chorus", "First linked lyric"),
        ("Chorus", "Second linked lyric"),
        ("Pre-Chorus", "A real pre chorus"),
        ("Verse 1", "The next real lyric"),
    ]


def test_plain_and_markdown_section_headings():
    parsed = parse_lyrics("Verse 1:\nA lyric\n## Pre-Chorus\nAnother lyric\nChorus\nFinal lyric")
    assert [line.section for line in parsed] == ["Verse 1", "Pre-Chorus", "Chorus"]
    assert [line.occurrence for line in parsed] == [1, 2, 3]
