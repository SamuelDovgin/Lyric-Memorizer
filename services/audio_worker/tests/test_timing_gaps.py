from services.audio_worker.lyrics import build_draft_alignment
from services.audio_worker.lrclib import apply_synced_lyrics
from services.audio_worker.timing_gaps import merge_audio_gaps, merge_catalog_gaps, usable


def fixture():
    lines = build_draft_alignment("Missing opening phrase\nFirst known anchor\nSecond known anchor\nLast known anchor", 45, "test")
    primary = "[00:10] First known anchor\n[00:20] Second known anchor\n[00:35] Last known anchor"
    return apply_synced_lyrics(lines, primary, 45)[0]


def test_catalog_fills_intro_without_replacing_anchors_or_ids():
    lines = fixture()
    donor = "[00:02] Missing opening phrase\n[00:05]\n[00:10] First known anchor\n[00:20] Second known anchor\n[00:35] Last known anchor"
    merged = merge_catalog_gaps(lines, donor, 45, 123)
    assert merged[0]["start"] == 2
    assert merged[0]["timingCatalogId"] == 123
    assert merged[0]["id"] == lines[0]["id"]
    assert merged[1:] == lines[1:]
    assert not usable(lines[0])


def test_offset_catalog_and_missing_donor_do_not_invent_timings():
    lines = fixture()
    wrong = "[00:01] Missing opening phrase\n[00:08] First known anchor\n[00:18] Second known anchor\n[00:33] Last known anchor"
    assert merge_catalog_gaps(lines, wrong, 45, 123) == lines
    absent = "[00:10] First known anchor\n[00:20] Second known anchor\n[00:35] Last known anchor"
    assert merge_catalog_gaps(lines, absent, 45, 123) == lines


def test_audio_fills_only_supported_gap_and_preserves_verified_lines():
    lines = fixture()
    lines[1]["verified"] = True
    words = [{"text": text, "start": 2 + i, "end": 2.5 + i, "confidence": .95}
             for i, text in enumerate(["Missing", "opening", "phrase"])]
    merged = merge_audio_gaps(lines, words, 45)
    assert usable(merged[0])
    assert merged[0]["start"] == 2
    assert merged[0]["timingSource"] == "audio_gap_match"
    assert merged[1:] == lines[1:]
    assert merge_audio_gaps(lines, words[:1], 45) == lines
    late = [{**w, "start": w["start"] + 20, "end": w["end"] + 20} for w in words]
    assert merge_audio_gaps(lines, late, 45) == lines


def test_verified_intro_is_never_replaced():
    lines = fixture()
    lines[0]["verified"] = True
    assert merge_audio_gaps(lines, [], 45) == lines


def test_audio_retry_uses_new_anchors_and_stops_when_complete(monkeypatch):
    from services.audio_worker.timing_gaps import fill_audio_gaps
    lines = build_draft_alignment("Opening words\nAnother phrase", 10, "test")
    calls = []
    monkeypatch.setattr("subprocess.run", lambda *a, **k: None)
    def transcribe(*args, **kwargs):
        calls.append(kwargs["prompt"])
        # The second clip starts at the end of the first recovered line (2).
        return [{"text": text, "start": i + .2, "end": i + 1, "confidence": .95}
                for i, text in enumerate(("Opening", "words") if len(calls) == 1 else ("Another", "phrase"))]
    monkeypatch.setattr("services.audio_worker.alignment.transcribe_vocals", transcribe)
    result = fill_audio_gaps(lines, "unused.wav", 10)
    assert len(calls) == 2
    assert all(map(usable, result))
    assert result[1]["start"] == 2.2


def test_hyphenated_refrain_matches_whitespace_tokenized_lyrics():
    lines = build_draft_alignment('La-la-la, la-la-la, la-la-la-la-la\nNext phrase', 10, 'test')
    mapped, _ = apply_synced_lyrics(lines, '[00:02] La-la-la, la-la-la, la-la-la\n[00:05] Next phrase', 10)
    assert usable(mapped[0])
    assert mapped[0]['start'] == 2
    assert mapped[0]['end'] == 5


def test_repeated_main_phrase_with_reordered_backing_vocals_keeps_each_occurrence():
    lines = build_draft_alignment('A lovely melody\nA lovely melody (We all sing)\nA lovely melody (We all sing)', 15, 'test')
    mapped, _ = apply_synced_lyrics(lines,
        '[00:02] A lovely melody\n[00:05] (We all sing) A lovely melody\n[00:09] (We all sing) A lovely melody', 15)
    assert [line['start'] for line in mapped] == [2, 5, 9]
    assert [line['end'] for line in mapped] == [5, 9, 15]
    assert all(map(usable, mapped))
