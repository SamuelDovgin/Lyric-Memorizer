export type SongStatus =
  "PROCESSING" | "NEEDS_STEMS" | "READY_NEEDS_REVIEW" | "READY";

export interface LyricToken {
  id: string;
  index: number;
  text: string;
  start: number;
  end: number;
  confidence: number;
  source: string;
}

export interface LyricLine {
  id: string;
  songId: string;
  index: number;
  section: string;
  sectionId?: string;
  text: string;
  start: number;
  end: number;
  confidence: number;
  verified: boolean;
  timingQuality?: "verified" | "supported" | "needs_review" | "untimed";
  timingEvidence?: {reasons: string[]; engine?: string; model?: string; passageId?: string; referenceDeviationSeconds?: number | null};
  timingSource?: "lrclib_synced_lyrics" | string;
  wordTimingCoverage?: number;
  wordTimingConfidence?: number;
  wordTimingSource?: string;
  tokens: LyricToken[];
}

export interface LyricEmojiPin {
  confidence?: number;
  lineId: string;
  lineText: string;
  wordIndex: number;
  anchor: string;
  emoji: string;
  meaning: string;
}

export interface Song {
  emojiPins?: LyricEmojiPin[];
  readiness?: number;
  id: string;
  title: string;
  artist: string;
  lyrics: string;
  duration: number;
  status: SongStatus;
  statusMessage: string;
  createdAt: string;
  sourceUrl?: string | null;
  jobId?: string;
  originalUrl: string | null;
  vocalsUrl: string | null;
  instrumentalUrl: string | null;
  lines: LyricLine[];
  alignmentRevision?: number;
  alignmentRun?: {engine: string; outcome: "applied" | "partial" | "unchanged"; reviewCount: number; revisedCount: number; recoveredCount: number; accuracyValidated: boolean; inputRevision?: number; engineConfiguration?: {model?: string; language?: string; device?: string; requestedDevice?: string}; snapshotPath?: string; candidateArtifactPath?: string};
  capabilities?: { playable: boolean; stems: boolean; lineTiming: boolean };
}

export interface ImportValues {
  title: string;
  artist: string;
  lyrics: string;
  youtubeUrl?: string;
  youtubeDownloadId?: string;
  syncLyrics?: boolean;
  original?: File;
  vocals?: File;
  instrumental?: File;
}

export interface LyricSyncPreview {
  found: boolean;
  message: string;
  catalogId?: number;
  albumName?: string;
  catalogDuration?: number;
  trackName?: string;
  artistName?: string;
  matchedLines?: number;
  totalLines?: number;
  coverage?: number;
  lyrics?: string;
}

export interface YoutubeDownload {
  id: string;
  url: string;
  status: "QUEUED" | "DOWNLOADING" | "COMPLETE" | "FAILED";
  progress: number;
  message: string;
  title: string;
  artist: string;
  duration: number | null;
  createdAt: string;
}

export interface SectionOccurrence {
  id: string;
  name: string;
  kind: string;
  lineIds: string[];
  start: number;
  end: number;
}
export interface BeatMap {
  bpm: number;
  anchor: number;
  beats: number[];
  confidence: number;
  verified: boolean;
  source: string;
}
export interface PracticeEvent {
  id: string;
  songId: string;
  sessionId: string;
  sequence: number;
  passId: string;
  lineId: string;
  judgment: "again" | "got-it" | "undo";
  sourceTime: number;
  createdAt: string;
  supersedes?: string;
}
export interface PracticeState {
  [lineId: string]: {
    judgment: "again" | "got-it";
    comfortablePasses: number;
    lastAt: string;
  };
}
export interface PlayerSettings {
  leadIn: "previous" | "short" | "none";
  countIn: "off" | "click" | "silent";
  beats: number;
  versesFirst: boolean;
  singer: number;
  mix: boolean;
  fontSize: number;
  syncOffset: number;
}
export interface SavedSession {
  id: string;
  songId: string;
  position: number;
  mode: "full" | "focus";
  scope: string;
  settings: PlayerSettings;
  loop: [number, number] | null;
  elapsed: number;
  plan?: LearningPlan;
  rehearsal?: import("./lib/sectionPractice").SectionPractice;
  updatedAt: string;
}
export interface Passage {
  id: string;
  lineIds: string[];
  start: number;
  end: number;
  targetStart: number;
  targetEnd: number;
  label: string;
}

export interface LearningPlan {
  [lineId: string]: {
    step: "repair" | "revisit" | "connect" | "rest";
    due: number;
    visits: number;
    lastPresented?: number;
    nextSessionAt?: string;
  };
}
