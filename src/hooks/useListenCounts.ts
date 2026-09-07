import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { readLocal, writeLocal } from "./usePracticeStore";
type Event = {id: string; lineId: string};
export function useListenCounts(songId: string) {
  const key = `listening.${songId}`;
  const pending = useRef<Event[]>(readLocal(`${key}.pending`, []));
  const [base, setBase] = useState<Record<string, number>>(readLocal(`${key}.counts`, {}));
  const [version, setVersion] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true, busy = false;
    const sync = async () => {
      if (busy) return;
      busy = true;
      const batch = pending.current.slice(0, 200);
      try {
        const counts = batch.length ? await api.saveListens(songId, batch) : await api.listens(songId);
        if (!live) return;
        pending.current = pending.current.filter(e => !batch.some(b => b.id === e.id));
        writeLocal(`${key}.pending`, pending.current);
        writeLocal(`${key}.counts`, counts);
        setBase(counts); setVersion(v => v + 1); setError("");
      } catch {
        if (live) setError("Play counts saved in this browser; database sync will retry.");
      } finally { busy = false; }
    };
    void sync();
    const timer = setInterval(() => void sync(), 1500);
    return () => { live = false; clearInterval(timer); };
  }, [songId, key]);
  const record = (lineId: string) => {
    pending.current.push({id: crypto.randomUUID(), lineId});
    if (!writeLocal(`${key}.pending`, pending.current)) setError("Browser storage is full. Keep the app open while counts sync.");
    setVersion(v => v + 1);
  };
  const counts = {...base};
  for (const event of pending.current) counts[event.lineId] = (counts[event.lineId] ?? 0) + 1;
  void version;
  return {counts, record, error};
}
