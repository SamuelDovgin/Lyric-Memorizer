"""LyricsGenius adapter and conservative, ordered section matching."""
import re
from difflib import SequenceMatcher
from urllib.parse import urlparse
from lyricsgenius import Genius, PublicAPI
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from .lyrics import parse_lyrics
from .lrclib import clean_track_title
from . import database as db

router = APIRouter(prefix='/api')


class PublicLyricsClient(PublicAPI):
    """Use LyricsGenius's parser with only its unauthenticated public client."""
    remove_section_headers = False
    lyrics = Genius.lyrics


def song_url(value: str) -> str:
    try:
        url = urlparse(value.strip())
        valid = url.scheme == 'https' and url.hostname in {'genius.com', 'www.genius.com'} and not url.username and not url.port and url.path.endswith('-lyrics')
    except ValueError:
        valid = False
    if not valid:
        raise HTTPException(422, 'Invalid Genius song URL.')
    return 'https://genius.com' + url.path


def find_song(client, title: str, artist: str) -> str:
    if not title.strip():
        raise HTTPException(422, 'Enter the song title first.')
    title = clean_track_title(title, artist)
    response = client.search(f'{title} {artist}'.strip(), type_='song')
    normalize = lambda value: ' '.join(re.findall(r'\w+', value.casefold()))
    candidates = []
    for section in response.get('sections', []):
        for hit in section.get('hits', []):
            result = hit.get('result', {})
            title_score = SequenceMatcher(None, normalize(title), normalize(result.get('title', ''))).ratio()
            artist_score = SequenceMatcher(None, normalize(artist), normalize(result.get('primary_artist', {}).get('name', ''))).ratio() if artist.strip() else 1
            if title_score >= .8 and artist_score >= .7 and result.get('url'):
                candidates.append((title_score + artist_score, result['url']))
    if not candidates:
        raise HTTPException(404, 'No close Genius match. Check the song title and artist, then retry.')
    return song_url(max(candidates, key=lambda item: item[0])[1])

class GeniusRequest(BaseModel):
    url: str = Field(default='', max_length=2000)
    title: str = Field(default='', max_length=300)
    artist: str = Field(default='', max_length=300)
    revision: int = 0


def fetch_genius(request: GeniusRequest):
    source_url = song_url(request.url) if request.url.strip() else ''
    try:
        client = PublicLyricsClient(access_token='', timeout=12, retries=0)
        if not source_url:
            source_url = find_song(client, request.title, request.artist)
        raw = client.lyrics(song_url=source_url)
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(502, 'Genius is temporarily unavailable. Retry automatic lookup shortly.') from error
    if not raw:
        raise HTTPException(404, 'No lyrics found on Genius.')
    parsed = parse_lyrics(raw)
    # Discard page metadata preceding the first actual section, if headings exist.
    if any(line.occurrence for line in parsed):
        parsed = [line for line in parsed if line.occurrence]
    rows, previous = [], None
    for line in parsed:
        if line.occurrence != previous:
            rows.append(f'[{line.section}]')
            previous = line.occurrence
        rows.append(line.text)
    return {'lyrics': '\n'.join(rows), 'sourceUrl': source_url}


@router.post('/lyrics/genius')
def preview(request: GeniusRequest):
    return fetch_genius(request)


def merge_sections(lines, raw):
    parsed = parse_lyrics(raw)
    if not any(line.section != 'Song' for line in parsed):
        raise HTTPException(422, 'Genius lyrics have no section headings.')
    words = lambda text: re.findall(r"\w+", text.casefold())
    source, owners = [], []
    for line in parsed:
        tokens = words(line.text)
        source.extend(tokens)
        owners.extend([line] * len(tokens))
    target, ranges = [], []
    for line in lines:
        start = len(target)
        target.extend(words(line['text']))
        ranges.append((start, len(target)))
    matches = {}
    for block in SequenceMatcher(None, source, target, autojunk=False).get_matching_blocks():
        for offset in range(block.size):
            matches[block.b + offset] = owners[block.a + offset]
    if not target or len(matches) / len(target) < .85:
        raise HTTPException(422, 'Genius lyrics do not closely match this recording. Existing sections were kept.')
    result = []
    for line, (start, end) in zip(lines, ranges):
        aligned = [matches[i] for i in range(start, end) if i in matches]
        occurrences = {l.occurrence for l in aligned}
        if not aligned or len(aligned) / max(1, end - start) < .7 or len(occurrences) != 1:
            raise HTTPException(422, 'A lyric line crosses or does not match a Genius section. Existing sections were kept.')
        name = re.sub(r':.*$', '', aligned[0].section).strip()
        result.append({**line, 'section': name, 'sectionId': f"genius_{aligned[0].occurrence}"})
    return result


@router.post('/songs/{song_id}/genius-sections')
def apply(song_id: str, request: GeniusRequest):
    found = db.get_song(song_id)
    if not found:
        raise HTTPException(404, 'Song not found')
    song, paths = found
    if song.get('alignmentRevision', 0) != request.revision:
        raise HTTPException(409, 'Song changed. Reload before applying sections.')
    fetched = fetch_genius(request)
    song['lines'] = merge_sections(song['lines'], fetched['lyrics'])
    song['geniusUrl'] = fetched['sourceUrl']
    song['alignmentRevision'] = request.revision + 1
    db.save_song(song, paths, datetime.now(timezone.utc).isoformat(), expected_revision=request.revision)
    return song
