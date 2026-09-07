import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import { deriveState } from "../lib/rehearsal";
import type { PracticeEvent, SavedSession } from "../types";

export function readLocal<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback;
  } catch {
    return fallback;
  }
}
export function writeLocal(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
export function usePracticeStore(songId: string) {
  const key = `rehearsal.events.${songId}`;
  const [events, setEvents] = useState<PracticeEvent[]>(() =>
    readLocal(key, []),
  );
  const [saveError, setSaveError] = useState("");
  const pending = useRef<PracticeEvent[]>(
    readLocal(`rehearsal.outbox.${songId}`, []),
  );
  const sequence = useRef(Date.now());
  const sessionId = useRef(crypto.randomUUID());
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    void api
      .events(songId)
      .then(({ events: stored }) => {
        if (mounted.current)
          setEvents((current) => [
            ...new Map([...stored, ...current].map((e) => [e.id, e])).values(),
          ]);
      })
      .catch(() => {
        if (mounted.current)
          setSaveError(
            "Worker unavailable. Marks are stored on this browser and will retry.",
          );
      });
    const flush = async () => {
      if (busy.current || !pending.current.length) return;
      busy.current = true;
      try {
        const batch = pending.current.slice(0, 200);
        const { acknowledged } = await api.saveEvents(batch);
        pending.current = pending.current.filter(
          (e) => !acknowledged.includes(e.id),
        );
        writeLocal(`rehearsal.outbox.${songId}`, pending.current);
        if (mounted.current) setSaveError("");
      } catch (error) {
        if (mounted.current)
          setSaveError(
            `Marks saved in this browser; sync will retry. ${error instanceof Error ? error.message : ""}`,
          );
      } finally {
        busy.current = false;
      }
    };
    void flush();
    const timer = setInterval(() => void flush(), 1500);
    return () => {
      mounted.current = false;
      clearInterval(timer);
      void flush();
    };
  }, [songId]);
  useEffect(() => {
    if (!writeLocal(key, events))
      setSaveError(
        "Browser storage is full. Keep this window open while marks sync.",
      );
  }, [key, events]);
  const record = (
    lineId: string,
    judgment: PracticeEvent["judgment"],
    sourceTime: number,
    passId: string,
    supersedes?: string,
  ) => {
    const event: PracticeEvent = {
      id: crypto.randomUUID(),
      songId,
      sessionId: sessionId.current,
      sequence: ++sequence.current,
      lineId,
      judgment,
      sourceTime,
      passId,
      createdAt: new Date().toISOString(),
      ...(supersedes ? { supersedes } : {}),
    };
    pending.current.push(event);
    if (!writeLocal(`rehearsal.outbox.${songId}`, pending.current))
      setSaveError(
        "Browser storage is full. Keep this window open while marks sync.",
      );
    setEvents((current) => [...current, event]);
    return event;
  };
  return {
    events,
    state: useMemo(() => deriveState(events), [events]),
    record,
    saveError,
    sessionId: sessionId.current,
  };
}
export const localSession = (id: string) =>
  readLocal<SavedSession | null>(`rehearsal.session.${id}`, null);
