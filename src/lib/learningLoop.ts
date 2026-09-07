import type { LearningPlan, PracticeState, Song } from "../types";
import { getSections, usable } from "./rehearsal";

/** Active listening seconds, not source position: rewinds never make an item overdue. */
export function planFeedback(
  plan: LearningPlan,
  lineId: string,
  judgment: "again" | "got-it",
  comfortablePasses: number,
  elapsed: number,
): LearningPlan {
  if (judgment === "again")
    return { ...plan, [lineId]: { step: "repair", due: elapsed, visits: 0 } };
  // Ordinary "I know this" marks don't create work. Revisit only a previously marked spot.
  if (!plan[lineId]) return plan;
  if (comfortablePasses >= 3)
    return {
      ...plan,
      [lineId]: {
        step: "rest",
        due: elapsed,
        visits: 0,
        nextSessionAt: new Date(Date.now() + 86_400_000).toISOString(),
      },
    };
  return {
    ...plan,
    [lineId]: {
      step: comfortablePasses >= 2 ? "connect" : "revisit",
      due: elapsed + (comfortablePasses >= 2 ? 90 : 45),
      visits: 0,
    },
  };
}

export function afterPresentation(
  plan: LearningPlan,
  lineId: string,
  elapsed: number,
): LearningPlan {
  const entry = plan[lineId];
  if (!entry) return plan;
  const visits = entry.visits + 1;
  return {
    ...plan,
    [lineId]: {
      ...entry,
      visits,
      lastPresented: elapsed,
      step:
        visits >= 2 ? "rest" : entry.step === "connect" ? "connect" : "revisit",
      due: elapsed + 45,
      ...(visits >= 2
        ? { nextSessionAt: new Date(Date.now() + 86_400_000).toISOString() }
        : {}),
    },
  };
}

export function restorePlan(
  plan: LearningPlan,
  state: PracticeState,
  elapsed: number,
  now = Date.now(),
): LearningPlan {
  const result = { ...plan };
  for (const [id, mark] of Object.entries(state)) {
    const previous = result[id];
    if (
      previous?.step === "rest" &&
      previous.nextSessionAt &&
      Date.parse(previous.nextSessionAt) <= now
    ) {
      result[id] = { step: "revisit", due: elapsed + 15, visits: 0 };
    } else if (!previous && mark.judgment === "again") {
      result[id] = { step: "revisit", due: elapsed + 15, visits: 0 };
    }
  }
  return result;
}

export function nextDue(
  song: Song,
  plan: LearningPlan,
  elapsed: number,
  scope: string,
  versesFirst: boolean,
  currentLineId?: string,
): string | null {
  const sections = getSections(song);
  const scoped = sections.find((s) => s.id === scope);
  const candidates = song.lines
    .filter(
      (l) =>
        usable(l) &&
        l.end <= song.duration &&
        (!scoped || scoped.lineIds.includes(l.id)),
    )
    .filter(
      (l) =>
        plan[l.id] && plan[l.id].step !== "rest" && plan[l.id].due <= elapsed,
    )
    .filter((l) => l.id !== currentLineId || plan[l.id].step === "repair")
    .sort((a, b) => {
      const priority = (id: string) =>
        plan[id].step === "repair"
          ? 1000
          : versesFirst &&
              sections.find((s) => s.lineIds.includes(id))?.kind === "verse"
            ? 5
            : 0;
      return (
        priority(b.id) - priority(a.id) ||
        plan[a.id].due - plan[b.id].due ||
        a.index - b.index
      );
    });
  return candidates[0]?.id ?? null;
}
