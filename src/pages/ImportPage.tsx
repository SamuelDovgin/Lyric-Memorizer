import { AlignmentOptions } from "../components/AlignmentOptions";
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
import { browserMode } from "../lib/browserLibrary";
import { api } from "../lib/api";
import type { LyricSyncPreview, Song, YoutubeDownload } from "../types";

type BatchEntryStatus = "pending" | "importing" | "imported" | "failed";

interface BatchImportEntry {
  id: string;
  file: File;
  title: string;
  lyrics: string;
  status: BatchEntryStatus;
  error?: string;
}

interface Props {
  song?: Song;
  onUpdate?: (song: Song) => void;
  onNavigationState?: (state: {dirty: boolean; busy: boolean}) => void;
  onCancel: () => void;
  onImported: (song: Song, keepOpen?: boolean) => void;
}

export function ImportPage({ song, onCancel, onImported, onUpdate, onNavigationState }: Props) {
  const editing = Boolean(song);
  const [saved, setSaved] = useState(song);
  const [message, setMessage] = useState(
    song?.status === "READY_NEEDS_REVIEW" ? song.statusMessage : "",
  );
  const youtubeInputId = useId();
  const [mode, setMode] = useState<"original" | "stems">("original");
  const [title, setTitle] = useState(song?.title ?? "");
  const [artist, setArtist] = useState(song?.artist ?? "");
  const [lyrics, setLyrics] = useState(song?.lyrics ?? "");
  const [geniusUrl, setGeniusUrl] = useState("");
  const [geniusBusy, setGeniusBusy] = useState(false);
  const [geniusMessage, setGeniusMessage] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState(song?.sourceUrl ?? "");
  const [youtubeDownload, setYoutubeDownload] =
    useState<YoutubeDownload | null>(null);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const downloadRunRef = useRef(0);
  const [original, setOriginal] = useState<File>();
  const [batchEntries, setBatchEntries] = useState<BatchImportEntry[]>([]);
  const [batchBusy, setBatchBusy] = useState(false);
  const [vocals, setVocals] = useState<File>();
  const [instrumental, setInstrumental] = useState<File>();
  const [syncPreview, setSyncPreview] = useState<LyricSyncPreview | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [importFormVersion, setImportFormVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const batchMode = !editing && batchEntries.length > 1;
  const working = busy || batchBusy || downloadBusy || syncBusy || geniusBusy;
  const dirty = editing ? title !== saved?.title || artist !== saved?.artist || lyrics !== saved?.lyrics
    : batchMode
      ? Boolean(artist || batchEntries.some((entry) => entry.status !== "imported" || entry.title || entry.lyrics))
      : Boolean(title || artist || lyrics || youtubeUrl || original || vocals || instrumental);
  useEffect(() => { onNavigationState?.({dirty, busy: working}); }, [dirty, working, onNavigationState]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty || working) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, working]);

  useEffect(
    () => () => {
      downloadRunRef.current += 1;
    },
    [],
  );

  const clearBatch = () => {
    setOriginal(undefined);
    setBatchEntries([]);
    setImportFormVersion((version) => version + 1);
  };

  const batchTitle = (file: File, index: number) => {
    const withoutExtension = file.name.replace(/\.[^.]+$/, "").trim();
    const cleaned = withoutExtension.replace(/[._-]+/g, " ").replace(/\s+/g, " ").trim();
    return cleaned || `Song ${index + 1}`;
  };

  const selectOriginalFiles = (files: File[]) => {
    const first = files[0];
    setSyncPreview(null);
    setError(null);
    setOriginal(first);
    setYoutubeUrl("");
    setYoutubeDownload(null);
    if (files.length > 1) {
      setBatchEntries(files.map((file, index) => ({
        id: `${file.name}-${file.lastModified}-${index}`,
        file,
        title: batchTitle(file, index),
        lyrics: "",
        status: "pending",
      })));
      setTitle("");
      setLyrics("");
    } else {
      setBatchEntries([]);
    }
  };

  const updateBatchEntry = (id: string, patch: Partial<BatchImportEntry>) => {
    setBatchEntries((entries) => entries.map((entry) => entry.id === id ? {...entry, ...patch} : entry));
  };

  const submitBatch = async () => {
    const pending = batchEntries.filter((entry) => entry.status !== "imported");
    const invalid = pending.find((entry) => !entry.title.trim() || !entry.lyrics.trim());
    if (invalid) {
      setError(`Add a title and exact lyrics for “${invalid.file.name}” before importing.`);
      return;
    }
    if (!pending.length) {
      setError("Select more audio files to start another batch.");
      return;
    }

    setBatchBusy(true);
    setError(null);
    let importedCount = 0;
    let failedCount = 0;
    for (const entry of pending) {
      updateBatchEntry(entry.id, {status: "importing", error: undefined});
      try {
        const imported = await api.importSong({
          title: entry.title.trim(),
          artist,
          lyrics: entry.lyrics,
          original: entry.file,
        });
        importedCount += 1;
        updateBatchEntry(entry.id, {status: "imported"});
        onImported(imported, true);
      } catch (caught) {
        failedCount += 1;
        updateBatchEntry(entry.id, {
          status: "failed",
          error: caught instanceof Error ? caught.message : "Import failed",
        });
      }
    }
    setBatchBusy(false);
    if (failedCount) {
      setMessage(`Imported ${importedCount} of ${pending.length}. Fix the failed files below and try again.`);
    } else {
      setMessage(`Imported ${importedCount} songs. Whisper alignment is running in the background; progress appears in your library.`);
      setArtist("");
      clearBatch();
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (batchMode) {
      await submitBatch();
      return;
    }
    if (downloadBusy)
      return setError(
        "Wait for the YouTube download to finish before importing.",
      );
    if (!editing && mode === "original" && !original && !youtubeUrl.trim())
      return setError("Choose an original recording or paste a YouTube link.");
    if (!editing && mode === "stems" && (!vocals || !instrumental))
      return setError("Choose both prepared stems.");
    if (working || browserMode) return;
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const redo = submitter?.getAttribute("value") === "timing";
    const keepImporting = submitter?.getAttribute("value") === "another";
    setBusy(true);
    try {
      if (saved) {
        let updated = await api.editSong(saved.id, {title, artist, lyrics, revision: saved.alignmentRevision ?? 0});
        setSaved(updated); onUpdate?.(updated); setMessage("Changes saved.");
        if (redo) {
          setMessage("Changes saved. Preparing lyric timing…");
          const {jobId} = await api.startAlignment(saved.id, false);
          while (true) {
            const job = await api.job(jobId);
            if (job.status === 'FAILED') {
              setMessage('');
              throw new Error(`Edits saved, but timing could not be updated: ${job.message}`);
            }
            setMessage(job.status === "COMPLETE" ? job.message : formatJobProgress(job));
            if (job.status === 'COMPLETE') {
              updated = await api.song(saved.id); setSaved(updated); onUpdate?.(updated); break;
            }
            await new Promise(resolve => window.setTimeout(resolve, 1500));
          }
        }
        setBusy(false); return;
      }
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
      if (keepImporting) onImported(song, true);
      else onImported(song);
      if (keepImporting) {
        downloadRunRef.current += 1;
        setTitle("");
        setArtist("");
        setLyrics("");
        setGeniusMessage("");
        setYoutubeUrl("");
        setYoutubeDownload(null);
        setOriginal(undefined);
        setVocals(undefined);
        setInstrumental(undefined);
        setSyncPreview(null);
        setMode("original");
        setImportFormVersion((version) => version + 1);
        setMessage(`${song.title} imported. Whisper alignment is running in the background; the library shows its live percentage. Add another song whenever you’re ready.`);
        setBusy(false);
      }
    } catch (caught) {
      setMessage("");
      setError(caught instanceof Error ? caught.message : "Save failed");
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
        duration: saved?.duration ?? youtubeDownload?.duration,
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
      <button className="back-link" disabled={working} onClick={onCancel}>
        <ArrowLeft size={17} /> Library
      </button>
      <div className="page-intro">
        <span className="eyebrow">{editing ? "Edit song" : "New song"}</span>
        <h1>{editing ? "Edit your song." : "Bring in a song."}</h1>
        <p>
          {editing ? "Review your source, lyrics, and timing in one place. Save edits or run a fresh timing comparison." : "Start with a YouTube link or audio file, then review the lyrics and add your song."}
        </p>
      </div>

      <form className="form-card" onSubmit={submit}>
        {browserMode && <p role="status">Song preparation requires the local audio worker. Open this song on your Mac to edit lyrics and timing.</p>}
        <fieldset className="song-form-fields" disabled={working || browserMode}>
        {editing ? <section className="source-fieldset" aria-label="Audio source">
          <h2>Audio source</h2>
          <label>YouTube source<input readOnly value={youtubeUrl} placeholder="Imported audio file" /></label>
          <p className="field-note">Your saved recording stays attached to this song.</p>
          {youtubeUrl && <button type="button" className="button secondary" onClick={async () => {
            setSyncBusy(true); setError(null); setMessage("Finding lyrics from your YouTube source…");
            try {
              const preview = await api.refreshSongPreview(song!.id);
              setTitle(preview.title); setArtist(preview.artist); setLyrics(preview.lyrics); setSyncPreview(null);
              setMessage("Fresh lyrics loaded for review. Save to apply them.");
            } catch (e) { setError(String(e)); setMessage(""); }
            finally { setSyncBusy(false); }
          }}>Pull lyrics from YouTube source</button>}
        </section> : (
        <fieldset className="source-fieldset">
          <legend>Audio source</legend>
          <div className="segmented">
            <button
              type="button"
              aria-pressed={mode === "original"}
              className={mode === "original" ? "selected" : ""}
              onClick={() => {
                setSyncPreview(null);
                setMode("original");
                setVocals(undefined);
                setInstrumental(undefined);
              }}
            >
              <Music size={17} /> Original recording
            </button>
            <button
              type="button"
              aria-pressed={mode === "stems"}
              className={mode === "stems" ? "selected" : ""}
              onClick={() => {
                setSyncPreview(null);
                setMode("stems");
                setOriginal(undefined);
                setBatchEntries([]);
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
                key={`original-${importFormVersion}`}
                label="Original audio"
                detail="Play the original; select several files for a batch"
                file={original}
                files={batchEntries.map((entry) => entry.file)}
                multiple
                onFiles={selectOriginalFiles}
              />
              {batchMode && <section className="batch-import-panel" aria-label="Batch import">
                <div className="batch-import-heading">
                  <div>
                    <small>Batch import</small>
                    <b>{batchEntries.length} recordings selected</b>
                  </div>
                  <button type="button" className="button secondary" onClick={clearBatch}>Clear selection</button>
                </div>
                <p>Give each recording its own title and exact lyrics. The shared artist field below is reused for every song. Each import starts Whisper timing in the background.</p>
                <div className="batch-import-list">
                  {batchEntries.map((entry) => <article className={`batch-import-entry batch-${entry.status}`} key={entry.id}>
                    <div className="batch-entry-file">
                      <FileAudio size={17} />
                      <span><b>{entry.file.name}</b><small>{(entry.file.size / 1_000_000).toFixed(1)} MB</small></span>
                      <strong>{entry.status === "importing" ? "Importing…" : entry.status === "imported" ? "Imported" : entry.status === "failed" ? "Needs attention" : "Ready"}</strong>
                    </div>
                    <label>
                      <span>Song title</span>
                      <input required value={entry.title} disabled={entry.status === "importing" || entry.status === "imported"} onChange={(event) => updateBatchEntry(entry.id, {title: event.target.value})} />
                    </label>
                    <label className="batch-entry-lyrics">
                      <span>Exact lyrics</span>
                      <textarea required value={entry.lyrics} disabled={entry.status === "importing" || entry.status === "imported"} onChange={(event) => updateBatchEntry(entry.id, {lyrics: event.target.value})} placeholder="Paste the lyrics for this recording" />
                    </label>
                    {entry.error && <p className="form-error" role="alert">{entry.error}</p>}
                  </article>)}
                </div>
              </section>}
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
                key={`vocals-${importFormVersion}`}
                label="Vocal stem"
                detail="Singer only"
                file={vocals}
                onFile={setVocals}
              />
              <FileDrop
                key={`instrumental-${importFormVersion}`}
                label="Instrumental stem"
                detail="Everything except lead vocal"
                file={instrumental}
                onFile={setInstrumental}
              />
            </div>
          )}
        </fieldset>
        )}

        {!batchMode && <><h2>Song details</h2>
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
        </div></>}

        {batchMode && <section className="batch-shared-details">
          <h2>Shared song details</h2>
          <label>
            <span>Artist for all songs <small>optional</small></span>
            <input value={artist} onChange={(event) => setArtist(event.target.value)} placeholder="Artist or production" />
          </label>
        </section>}

        {editing && !browserMode && <AlignmentOptions />}
        {!batchMode && <section
          className="timing-source-card"
          aria-label="Lyric timing source"
        >
          <span className="timing-source-icon">
            <Sparkles size={19} />
          </span>
          <div>
            <small>Timing source</small>
            <b>Find matching line timings</b>
            <em>
              Check for available lyric timestamps. This lookup does not verify
              them against your recording. Audio comparison runs when you redo timings.
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
                {syncPreview.albumName ? ` · Source: ${syncPreview.albumName}` : ""}
              </span>
            )}
          </div>
        </section>}

        {!batchMode && <details className="genius-import">
          <summary>Alternative lyric source · Genius</summary>

          <p>Bring in verse and chorus labels, then use LRCLIB above to find their timing.</p>
          <label>Genius song URL<input type="url" value={geniusUrl} onChange={e => setGeniusUrl(e.target.value)} placeholder="https://genius.com/…-lyrics" /></label>
          <button type="button" className="button secondary" disabled={geniusBusy} onClick={async () => {
            setGeniusBusy(true); setError(null);
            try { const result = await api.genius({url: geniusUrl, title, artist}); setLyrics(result.lyrics); setSyncPreview(null); setGeniusMessage("Genius lyrics loaded with section headings. Check LRCLIB sync next."); }
            catch(e) {setError(String(e));} finally {setGeniusBusy(false);}
          }}>{geniusBusy ? "Fetching Genius…" : "Get Genius lyrics"}</button>
          <small>Title and artist are enough—no URL, pasted lyrics, or access token needed. LyricsGenius fetches the lyrics and headings. Fetching replaces the lyrics in this form.</small>
        </details>}
        {!batchMode && geniusMessage && <p role="status">{geniusMessage}</p>}



        {!batchMode && <label className="lyrics-field">
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
        </label>}
        {!batchMode && <p className="field-note">
          Plain lyrics and Genius-style Markdown links are accepted. Link URLs,
          trailing backslashes, and “You might also like” recommendations are
          removed automatically.
        </p>}

        {editing && lyrics !== saved?.lyrics && <p className="field-note" role="status">Changed lyrics reset the old line timings. Save & redo timings to compare the new lyrics with your recording.</p>}
        </fieldset>
        {message && <p role="status" className="song-form-message">{message}</p>}
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <div className="form-actions">
          <span>
            {working ? <><LoaderCircle className="spin" size={15} /> {batchBusy ? "Importing selected songs…" : message || "Working…"}</> : dirty ? "Unsaved changes" : editing ? "All changes saved" : "Ready when you are"}
          </span>
          <button
            className="button primary"
            disabled={working || browserMode || (batchMode ? false : !title.trim() || !lyrics.trim())}
            type="submit"
          >
            {busy ? (
              <LoaderCircle className="spin" size={18} />
            ) : (
              <Upload size={18} />
            )}
            {busy ? (editing ? "Saving…" : "Importing…") : editing ? "Save changes" : batchMode ? "Import all songs" : "Import song"}
          </button>
          {editing && <button type="submit" value="timing" className="button secondary"
            disabled={working || browserMode || !title.trim() || !lyrics.trim() || !song?.originalUrl}>Save & redo timings</button>}
          {!editing && !batchMode && <button type="submit" value="another" className="button secondary"
            disabled={working || browserMode || !title.trim() || !lyrics.trim()}>Import & add another</button>}
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

function formatJobProgress(job: {progress: number; message: string}) {
  const percent = Math.round(Math.max(0, Math.min(1, job.progress)) * 100);
  return `${percent}% · ${job.message || "Preparing lyric timing"}`;
}

function FileDrop({
  label,
  detail,
  file,
  files,
  multiple = false,
  onFile,
  onFiles,
}: {
  label: string;
  detail: string;
  file?: File;
  files?: File[];
  multiple?: boolean;
  onFile?: (file?: File) => void;
  onFiles?: (files: File[]) => void;
}) {
  const inputId = useId();
  const selectedFiles = files ?? (file ? [file] : []);
  return (
    <label htmlFor={inputId} className={`file-drop ${selectedFiles.length ? "has-file" : ""}`}>
      <input
        id={inputId}
        type="file"
        accept="audio/*"
        multiple={multiple}
        aria-label={label}
        onChange={(event) => {
          const selected = Array.from(event.target.files ?? []);
          if (multiple) onFiles?.(selected);
          else onFile?.(selected[0]);
        }}
      />
      <span className="file-icon">
        {selectedFiles.length ? <Check size={19} /> : <FileAudio size={19} />}
      </span>
      <span>
        <b>{selectedFiles.length > 1 ? `${selectedFiles.length} audio files selected` : selectedFiles[0]?.name ?? label}</b>
        <small>
          {selectedFiles.length > 1 ? "Each file gets its own title and lyrics below" : selectedFiles[0] ? `${(selectedFiles[0].size / 1_000_000).toFixed(1)} MB` : detail}
        </small>
      </span>
    </label>
  );
}
