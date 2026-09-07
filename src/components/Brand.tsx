import { AudioLines } from "lucide-react";

export function Brand() {
  return (
    <div className="brand" aria-label="Lyric Memorizer home">
      <span className="brand-mark">
        <AudioLines size={19} strokeWidth={2.4} />
      </span>
      <span>Lyric Memorizer</span>
    </div>
  );
}
