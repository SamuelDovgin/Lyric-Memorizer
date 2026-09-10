import { browserMode, browserRequest } from "./browserLibrary";
import type {
  ImportValues,
  LyricLine,
  LyricSyncPreview,
  Song,
  YoutubeDownload,
  PracticeEvent,
  SavedSession,
  BeatMap,
  SectionOccurrence,
} from "../types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (browserMode) return browserRequest(path, init) as Promise<T>;
  const response = await fetch(path, init);
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = await response.json();
      detail = body.detail ?? body.message ?? detail;
    } catch {
      // Preserve the HTTP status text when a proxy/server fails before JSON.
    }
    throw new Error(detail);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  refreshSongPreview: (id: string) => request<{title: string; artist: string; lyrics: string}>(`/api/songs/${id}/refresh-preview`, {method: "POST"}),
  editSong: (id: string, body: {title: string; artist: string; lyrics: string; revision: number}) => request<Song>(`/api/songs/${id}/edit`, {method: "PUT", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)}),
  listens: (id: string) => request<Record<string, number>>(`/api/songs/${id}/listens`),
  saveListens: (id: string, events: {id: string; lineId: string}[]) => request<Record<string, number>>(`/api/songs/${id}/listens`, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({events})}),
  genius: (body: {url: string; title: string; artist: string}) => request<{lyrics: string; sourceUrl: string}>("/api/lyrics/genius", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)}),
  geniusSections: (id: string, body: {url: string; title: string; artist: string; revision: number}) => request<Song>(`/api/songs/${id}/genius-sections`, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)}),
  health: () =>
    request<{ ok: boolean; demucs: boolean; ytDlp: boolean }>("/api/health"),
  songs: () => request<Song[]>("/api/songs"),
  song: (id: string) => request<Song>(`/api/songs/${id}`),
  importSong: (values: ImportValues) => {
    const body = new FormData();
    body.set("title", values.title);
    body.set("artist", values.artist);
    body.set("lyrics", values.lyrics);
    if (values.youtubeUrl) body.set("youtube_url", values.youtubeUrl);
    if (values.youtubeDownloadId)
      body.set("youtube_download_id", values.youtubeDownloadId);
    if (values.syncLyrics) body.set("sync_lyrics", "true");
    if (values.original) body.set("original", values.original);
    if (values.vocals) body.set("vocals", values.vocals);
    if (values.instrumental) body.set("instrumental", values.instrumental);
    return request<Song>("/api/songs/import", { method: "POST", body });
  },
  previewLyricSync: (values: {
    title: string;
    artist: string;
    duration?: number | null;
    lyrics: string;
  }) =>
    request<LyricSyncPreview>("/api/lyrics/sync-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    }),
  startYoutubeDownload: (url: string) =>
    request<YoutubeDownload>("/api/youtube/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    }),
  youtubeDownload: (id: string) =>
    request<YoutubeDownload>(`/api/youtube/downloads/${id}`),
  uploadStems: (songId: string, vocals: File, instrumental: File) => {
    const body = new FormData();
    body.set("vocals", vocals);
    body.set("instrumental", instrumental);
    return request<Song>(`/api/songs/${songId}/stems`, {
      method: "POST",
      body,
    });
  },
  startAlignment: (songId: string, refineWords = false, options?: {engine: "forced" | "legacy"; language: string}) =>
    request<{ jobId: string }>(
      `/api/songs/${songId}/align?refine_words=${refineWords}${options ? `&engine=${options.engine}&language=${encodeURIComponent(options.language)}` : ""}`,
      { method: "POST" },
    ),
  job: (jobId: string) =>
    request<{ status: string; progress: number; message: string; engine?: string; outcome?: "applied" | "partial" | "unchanged" | "failed" }>(
      `/api/jobs/${jobId}`,
    ),
  restoreAlignment: (songId: string, revision: number) => request<Song>(`/api/songs/${songId}/alignment/restore?revision=${revision}`, {method: "POST"}),
  updateAlignment: (songId: string, lines: LyricLine[], revision = 0) =>
    request<Song>(`/api/songs/${songId}/alignment`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lines, revision }),
    }),
  structure: (id: string) =>
    request<SectionOccurrence[]>(`/api/songs/${id}/structure`),
  saveStructure: (
    id: string,
    body: {
      sectionId: string;
      name: string;
      revision: number;
      splitAt?: string;
    },
  ) =>
    request<Song>(`/api/songs/${id}/structure`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  events: (id: string) =>
    request<{ events: PracticeEvent[] }>(`/api/songs/${id}/practice-state`),
  saveEvents: (events: PracticeEvent[]) =>
    request<{ acknowledged: string[] }>("/api/practice-events/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events }),
    }),
  session: (id: string) =>
    request<SavedSession | null>(`/api/songs/${id}/session`),
  saveSession: (session: SavedSession) =>
    request(`/api/practice-sessions/${session.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(session),
    }),
  beats: (id: string) => request<BeatMap | null>(`/api/songs/${id}/beat-map`),
  saveBeats: (id: string, bpm: number, anchor: number, verified = true) =>
    request<BeatMap>(`/api/songs/${id}/beat-map`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bpm, anchor, verified }),
    }),
  analyzeBeats: (id: string) =>
    request<BeatMap>(`/api/songs/${id}/analyze-beats`, { method: "POST" }),
  separate: (id: string) =>
    request<{ jobId: string }>(`/api/songs/${id}/separate`, { method: "POST" }),
  saveReadiness: (id: string, readiness: number) =>
    request<{ readiness: number }>(`/api/songs/${id}/readiness`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ readiness }),
    }),
  deleteSong: (songId: string) =>
    request<void>(`/api/songs/${songId}`, { method: "DELETE" }),
};
