import type { Candidate, PhotoResult } from "../identify";

/** One row on the Holio on PC panel: what the component handed the host. */
export type SessionEvent =
  | { kind: "photo"; at: number; order: string; mock: boolean; result: PhotoResult; product: Candidate | null; linked: boolean }
  | { kind: "manual"; at: number; order: string; mock: boolean };

const KEY = "holio-demo-session";

export function readSession(): SessionEvent[] {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? "[]") as SessionEvent[];
  } catch {
    return [];
  }
}

export function writeSession(events: SessionEvent[]) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(events));
  } catch {
    // Storage blocked: the panel still shows this page's events.
  }
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}
