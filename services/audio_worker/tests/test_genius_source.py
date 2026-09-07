import pytest
from fastapi import HTTPException
from services.audio_worker.genius_source import PublicLyricsClient, GeniusRequest, fetch_genius


def test_lookup_without_environment_token_preserves_headings(monkeypatch):
    monkeypatch.delenv('GENIUS_ACCESS_TOKEN', raising=False)
    calls = []

    def request(self, path, **kwargs):
        assert self.authorization_header == {}
        calls.append((path, kwargs))
        if kwargs.get('web'):
            return {'html': '<div data-lyrics-container="true">[Verse 1]<br/>A new day<br/>[Chorus]<br/>Sing along</div>'}
        return {'sections': [{'hits': [
            {'result': {'title': 'Example', 'primary_artist': {'name': 'Wrong Artist'}, 'url': 'https://genius.com/Wrong-lyrics'}},
            {'result': {'title': 'Example', 'primary_artist': {'name': 'Right Artist'}, 'url': 'https://genius.com/Right-lyrics'}},
        ]}]}

    monkeypatch.setattr(PublicLyricsClient, '_make_request', request)
    result = fetch_genius(GeniusRequest(title='Example', artist='Right Artist'))
    assert result['sourceUrl'] == 'https://genius.com/Right-lyrics'
    assert result['lyrics'] == '[Verse 1]\nA new day\n[Chorus]\nSing along'
    assert len(calls) == 2


def test_empty_search_is_a_not_found_not_a_network_error(monkeypatch):
    monkeypatch.delenv('GENIUS_ACCESS_TOKEN', raising=False)
    monkeypatch.setattr(PublicLyricsClient, 'search', lambda *a, **k: {'sections': []})
    with pytest.raises(HTTPException) as caught:
        fetch_genius(GeniusRequest(title='Unknown'))
    assert caught.value.status_code == 404


def test_direct_url_uses_no_search_or_credentials(monkeypatch):
    monkeypatch.delenv('GENIUS_ACCESS_TOKEN', raising=False)
    monkeypatch.setattr(PublicLyricsClient, 'search', lambda *a, **k: pytest.fail('Unexpected search'))
    def lyrics(self, song_url):
        assert self.authorization_header == {}
        assert song_url == 'https://genius.com/Example-lyrics'
        return '[Verse]\nExample'
    monkeypatch.setattr(PublicLyricsClient, 'lyrics', lyrics)
    assert fetch_genius(GeniusRequest(url='https://www.genius.com/Example-lyrics'))['lyrics'] == '[Verse]\nExample'


@pytest.mark.parametrize('title', [
    'Doja Cat - Happy (Audio)',
    'Doja Cat – Happy (Official Audio)',
    'Happy',
])
def test_youtube_title_matches_genius_song(monkeypatch, title):
    def search(self, query, **kwargs):
        assert query == 'Happy Doja Cat'
        return {'sections': [{'hits': [
            {'result': {'title': 'Happy', 'primary_artist': {'name': 'Other Artist'}, 'url': 'https://genius.com/Other-happy-lyrics'}},
            {'result': {'title': 'Happy', 'primary_artist': {'name': 'Doja Cat'}, 'url': 'https://genius.com/Doja-cat-happy-lyrics'}},
        ]}]}

    monkeypatch.setattr(PublicLyricsClient, 'search', search)
    monkeypatch.setattr(PublicLyricsClient, 'lyrics', lambda *a, **k: '[Verse 1]\nExample line\n[Chorus]\nAnother line')
    result = fetch_genius(GeniusRequest(title=title, artist='Doja Cat'))
    assert result['sourceUrl'] == 'https://genius.com/Doja-cat-happy-lyrics'
    assert result['lyrics'] == '[Verse 1]\nExample line\n[Chorus]\nAnother line'
