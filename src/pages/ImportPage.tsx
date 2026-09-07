import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  Check,
  Download,
  FileAudio,
  Link2,
  LoaderCircle,
  Music,
  Sparkles,
  Upload,
  Video,
} from "lucide-react";
import { api } from "../lib/api";
import type { LyricSyncPreview, Song, YoutubeDownload } from "../types";

interface Props {
  onCancel: () => void;
  onImported: (song: Song) => void;
}

export function ImportPage({ onCancel, onImported }: Props) {
  const youtubeInputId = useId();
  const [mode, setMode] = useState<"original" | "stems">("original");
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [geniusUrl, setGeniusUrl] = useState("");
  const [geniusBusy, setGeniusBusy] = useState(false);
  const [geniusMessage, setGeniusMessage] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [youtubeDownload, setYoutubeDownload] =
    useState<YoutubeDownload | null>(null);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const downloadRunRef = useRef(0);
  const [original, setOriginal] = useState<File>();
  const [vocals, setVocals] = useState<File>();
  const [instrumental, setInstrumental] = useState<File>();
  const [syncPreview, setSyncPreview] = useState<LyricSyncPreview | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () => () => {
      downloadRunRef.current += 1;
    },
    [],
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (downloadBusy)
      return setError(
        "Wait for the YouTube download to finish before importing.",
      );
    if (mode === "original" && !original && !youtubeUrl.trim())
      return setError("Choose an original recording or paste a YouTube link.");
    if (mode === "stems" && (!vocals || !instrumental))
      return setError("Choose both prepared stems.");
    setBusy(true);
    try {
      const song = await api.importSong({
        title,
        artist,
        lyrics,
        youtubeUrl: youtubeUrl.trim(),
        youtubeDownloadId:
          youtubeDownload?.status === "COMPLETE"
            ? youtubeDownload.id
            : undefined,
        syncLyrics: syncPreview?.found,
        original,
        vocals,
        instrumental,
      });
      onImported(song);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Import failed");
      setBusy(false);
    }
  };

  const checkLyricSync = async () => {
    setSyncBusy(true);
    setError(null);
    try {
      let sourceLyrics = lyrics;
      if (!sourceLyrics.trim()) {
        try {
          const found = await api.genius({url: geniusUrl, title, artist});
          sourceLyrics = found.lyrics;
          setLyrics(sourceLyrics);
          setGeniusMessage("Genius lyrics and section headings found automatically.");
        } catch (caught) {
          setGeniusMessage(`${caught instanceof Error ? caught.message : "Genius lookup failed."} Checking LRCLIB for lyrics and timing; Genius section headings have not been loaded.`);
        }
      }
      const preview = await api.previewLyricSync({
        title,
        artist,
        duration: youtubeDownload?.duration,
        lyrics: sourceLyrics,
      });
      if (preview.lyrics && !sourceLyrics.trim()) setLyrics(preview.lyrics);
      setSyncPreview(preview);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not check synchronized lyrics",
      );
    } finally {
      setSyncBusy(false);
    }
  };

  const downloadYoutube = async () => {
    if (!youtubeUrl.trim())
      return setError("Paste a direct YouTube video link first.");
    const run = ++downloadRunRef.current;
    setDownloadBusy(true);
    setYoutubeDownload(null);
    setError(null);
    try {
      let current = await api.startYoutubeDownload(youtubeUrl.trim());
      if (run !== downloadRunRef.current) return;
      setYoutubeDownload(current);
      while (current.status === "QUEUED" || current.status === "DOWNLOADING") {
        await new Promise((resolve) => window.setTimeout(resolve, 700));
        if (run !== downloadRunRef.current) return;
        current = await api.youtubeDownload(current.id);
        setYoutubeDownload(current);
      }
      if (current.status === "FAILED") throw new Error(current.message);
      const resolvedTitle = title.trim() || current.title;
      const resolvedArtist = artist.trim() || current.artist;
      if (!title.trim() && current.title) setTitle(current.title);
      if (!artist.trim() && current.artist) setArtist(current.artist);
      if (!lyrics.trim() && resolvedTitle) {
        let sourceLyrics = "";
        try {
          const found = await api.genius({url: geniusUrl, title: resolvedTitle, artist: resolvedArtist});
          if (run !== downloadRunRef.current) return;
          sourceLyrics = found.lyrics;
          setLyrics(sourceLyrics);
          setGeniusMessage("Genius lyrics and section headings found automatically.");
        } catch (caught) {
          if (run !== downloadRunRef.current) return;
          setGeniusMessage(`${caught instanceof Error ? caught.message : "Genius lookup failed."} Checking LRCLIB for lyrics and timing; Genius section headings have not been loaded.`);
        }
        const preview = await api.previewLyricSync({
          title: resolvedTitle,
          artist: resolvedArtist,
          duration: current.duration,
          lyrics: sourceLyrics,
        });
        if (run !== downloadRunRef.current) return;
        if (preview.lyrics && !sourceLyrics) setLyrics(preview.lyrics);
        setSyncPreview(preview);
      }
    } catch (caught) {
      if (run !== downloadRunRef.current) return;
      setError(
        caught instanceof Error
          ? caught.message
          : "YouTube audio could not be downloaded",
      );
    } finally {
      if (run === downloadRunRef.current) setDownloadBusy(false);
    }
  };

  return (
    <div className="page narrow-page">
      <button className="back-link" onClick={onCancel}>
        <ArrowLeft size={17} /> Library
      </button>
      <div className="page-intro">
        <span className="eyebrow">New song</span>
        <h1>Bring in a song.</h1>
        <p>
          Enter the title and artist, then choose Get lyrics + sync. Lyrics and
          verse/chorus headings are fetched automatically.
        </p>
      </div>

      <form className="form-card" onSubmit={submit}>
        <div className="field-grid">
          <label>
            <span>Song title</span>
            <input
              required
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                setSyncPreview(null);
              }}
              placeholder="The song you’re learning"
            />
          </label>
          <label>
            <span>
              Artist <small>optional</small>
            </span>
            <input
              value={artist}
              onChange={(event) => {
                setArtist(event.target.value);
                setSyncPreview(null);
              }}
              placeholder="Artist or production"
            />
          </label>
        </div>

        <section
          className="timing-source-card"
          aria-label="Lyric timing source"
        >
          <span className="timing-source-icon">
            <Sparkles size={19} />
          </span>
          <div>
            <small>Timing source</small>
            <b>Free LRCLIB sync + local word refinement</b>
            <em>
              After a YouTube download, existing lyrics and synchronized timing
              are fetched automatically. Or enter a title and check manually.
              Audio is never sent to LRCLIB.
            </em>
            <button
              type="button"
              className={`sync-check-button ${syncPreview?.found ? "complete" : ""}`}
              disabled={syncBusy || !title.trim()}
              onClick={() => void checkLyricSync()}
            >
              {syncBusy ? (
                <LoaderCircle className="spin" size={16} />
              ) : syncPreview?.found ? (
                <Check size={16} />
              ) : (
                <Sparkles size={16} />
              )}
              {syncBusy
                ? "Checking LRCLIB…"
                : syncPreview?.found
                  ? "Lyrics + sync ready"
                  : lyrics.trim()
                    ? "Check LRCLIB sync"
                    : "Get lyrics + sync"}
            </button>
            {syncPreview && (
              <span
                className={`sync-preview ${syncPreview.found ? "found" : "missing"}`}
              >
                {syncPreview.message}
              </span>
            )}
          </div>
        </section>

        <section className="genius-import">
          <h3>Genius lyrics & section headings</h3>
          <p>Bring in verse and chorus labels, then use LRCLIB above to find their timing.</p>
          <label>Genius song URL<input type="url" value={geniusUrl} onChange={e => setGeniusUrl(e.target.value)} placeholder="https://genius.com/…-lyrics" /></label>
          <button type="button" className="button secondary" disabled={geniusBusy} onClick={async () => {
            setGeniusBusy(true); setError(null);
            try { const result = await api.genius({url: geniusUrl, title, artist}); setLyrics(result.lyrics); setSyncPreview(null); setGeniusMessage("Genius lyrics loaded with section headings. Check LRCLIB sync next."); }
            catch(e) {setError(String(e));} finally {setGeniusBusy(false);}
          }}>{geniusBusy ? "Fetching Genius…" : "Get Genius lyrics"}</button>
          <small>Title and artist are enough—no URL, pasted lyrics, or access token needed. LyricsGenius fetches the lyrics and headings. Fetching replaces the lyrics in this form.</small>
          <p role="status">{geniusMessage}</p>
        </section>

        <fieldset className="source-fieldset">
          <legend>Audio source</legend>
          <div className="segmented">
            <button
              type="button"
              className={mode === "original" ? "selected" : ""}
              onClick={() => {
                setMode("original");
                setVocals(undefined);
                setInstrumental(undefined);
              }}
            >
              <Music size={17} /> Original recording
            </button>
            <button
              type="button"
              className={mode === "stems" ? "selected" : ""}
              onClick={() => {
                setMode("stems");
                setOriginal(undefined);
                setYoutubeUrl("");
                setYoutubeDownload(null);
              }}
            >
              <FileAudio size={17} /> Prepared stems
            </button>
          </div>
          {mode === "original" ? (
            <div className="original-source-stack">
              <FileDrop
                label="Original audio"
                detail="Play the original; stems are optional"
                file={original}
                onFile={(file) => {
                  setOriginal(file);
                  setError(null);
                  if (file) {
                    setYoutubeUrl("");
                    setYoutubeDownload(null);
                  }
                }}
              />
              <div className="source-divider">
                <span>or paste a link</span>
              </div>
              <div className="youtube-field">
                <label htmlFor={youtubeInputId}>
                  <Video size={16} /> YouTube video
                </label>
                <div className="youtube-input-row">
                  <div className="url-input">
                    <Link2 size={17} />
                    <input
                      id={youtubeInputId}
                      type="url"
                      value={youtubeUrl}
                      onChange={(event) => {
                        downloadRunRef.current += 1;
                        setDownloadBusy(false);
                        setYoutubeUrl(event.target.value);
                        setYoutubeDownload(null);
                        setSyncPreview(null);
                        setError(null);
                        if (event.target.value) setOriginal(undefined);
                      }}
                      placeholder="https://www.youtube.com/watch?v=…"
                    />
                  </div>
                  <button
                    type="button"
                    className={`youtube-download-button ${youtubeDownload?.status === "COMPLETE" ? "complete" : ""}`}
                    disabled={downloadBusy || !youtubeUrl.trim()}
                    onClick={() => void downloadYoutube()}
                  >
                    {downloadBusy ? (
                      <LoaderCircle className="spin" size={17} />
                    ) : youtubeDownload?.status === "COMPLETE" ? (
                      <Check size={17} />
                    ) : (
                      <Download size={17} />
                    )}
                    {downloadBusy
                      ? "Downloading audio"
                      : youtubeDownload?.status === "COMPLETE"
                        ? "Audio ready"
                        : "Download audio"}
                  </button>
                </div>
                <small>
                  Downloads one video’s audio locally, then automatically looks
                  for free lyrics and synchronized timing for playback.
                  Playlists are disabled.
                </small>
                {youtubeDownload && (
                  <span
                    className={`download-feedback download-${youtubeDownload.status.toLowerCase()}`}
                  >
                    <i>
                      <b
                        style={{
                          width: `${Math.max(6, youtubeDownload.progress * 100)}%`,
                        }}
                      />
                    </i>
                    <span>
                      <strong>
                        {youtubeDownload.status === "COMPLETE" &&
                        youtubeDownload.title
                          ? youtubeDownload.title
                          : youtubeDownload.message}
                      </strong>
                      {youtubeDownload.status === "COMPLETE" && (
                        <small>
                          {[
                            youtubeDownload.artist,
                            youtubeDownload.duration
                              ? formatDuration(youtubeDownload.duration)
                              : "",
                          ]
                            .filter(Boolean)
                            .join(" · ")}{" "}
                          · ready to play
                        </small>
                      )}
                    </span>
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="field-grid">
              <FileDrop
                label="Vocal stem"
                detail="Singer only"
                file={vocals}
                onFile={setVocals}
              />
              <FileDrop
                label="Instrumental stem"
                detail="Everything except lead vocal"
                file={instrumental}
                onFile={setInstrumental}
              />
            </div>
          )}
        </fieldset>

        <label className="lyrics-field">
          <span>Exact lyrics</span>
          <textarea
            required
            value={lyrics}
            onChange={(event) => {
              setLyrics(event.target.value);
              setSyncPreview(null);
            }}
            placeholder={
              "Downloaded songs fill this automatically when LRCLIB has lyrics.\n\nOr paste:\n[Verse 1]\nFirst performed line…"
            }
          />
        </label>
        <p className="field-note">
          Plain lyrics and Genius-style Markdown links are accepted. Link URLs,
          trailing backslashes, and “You might also like” recommendations are
          removed automatically.
        </p>

        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <div className="form-actions">
          <span>
            <Sparkles size={15} /> Free line sync; local audio processing
          </span>
          <button
            className="button primary"
            disabled={busy || downloadBusy}
            type="submit"
          >
            {busy ? (
              <LoaderCircle className="spin" size={18} />
            ) : (
              <Upload size={18} />
            )}
            {busy ? "Importing…" : "Import song"}
          </button>
        </div>
      </form>
    </div>
  );
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${Math.round(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
}

function FileDrop({
  label,
  detail,
  file,
  onFile,
}: {
  label: string;
  detail: string;
  file?: File;
  onFile: (file?: File) => void;
}) {
  const inputId = useId();
  return (
    <label htmlFor={inputId} className={`file-drop ${file ? "has-file" : ""}`}>
      <input
        id={inputId}
        type="file"
        accept="audio/*"
        aria-label={label}
        onChange={(event) => onFile(event.target.files?.[0])}
      />
      <span className="file-icon">
        {file ? <Check size={19} /> : <FileAudio size={19} />}
      </span>
      <span>
        <b>{file?.name ?? label}</b>
        <small>
          {file ? `${(file.size / 1_000_000).toFixed(1)} MB` : detail}
        </small>
      </span>
    </label>
  );
}
