import type { SongStatus } from "../types";

const labels: Record<SongStatus, string> = {
  PROCESSING: "Processing",
  NEEDS_STEMS: "Needs stems",
  READY_NEEDS_REVIEW: "Timing review",
  READY: "Ready",
};

export function StatusPill({ status }: { status: SongStatus }) {
  return (
    <span className={`status-pill status-${status.toLowerCase()}`}>
      <i />
      {labels[status]}
    </span>
  );
}
