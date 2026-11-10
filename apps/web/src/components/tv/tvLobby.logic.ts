import {
  threadRuntimeIsActive,
  type EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/models";
import { effectiveSnoozed } from "@t3tools/client-runtime/state/thread-settled";

export type TvThreadStatus = "approval" | "input" | "failed" | "working" | "idle";

const STATUS_RANK: Record<TvThreadStatus, number> = {
  approval: 0,
  input: 1,
  failed: 2,
  working: 3,
  idle: 4,
};

export function tvThreadStatus(thread: EnvironmentThreadShell): TvThreadStatus {
  if (thread.hasPendingApprovals) return "approval";
  if (thread.hasPendingUserInput || thread.pendingSubagentRequest != null) return "input";
  if (threadRuntimeIsActive(thread.runtime)) return "working";
  if (thread.runtime?.lastError != null || thread.latestRun?.status === "failed") return "failed";
  return "idle";
}

function isSettled(thread: EnvironmentThreadShell): boolean {
  if (thread.settledOverride !== null) return thread.settledOverride === "settled";
  return thread.settledAt !== null;
}

/** Threads the lobby shows: live and unsettled, those asking for the user first. */
export function selectTvThreads(
  threads: ReadonlyArray<EnvironmentThreadShell>,
  now: string,
): EnvironmentThreadShell[] {
  return threads
    .filter(
      (thread) =>
        thread.archivedAt === null &&
        thread.deletedAt === null &&
        !isSettled(thread) &&
        !effectiveSnoozed(thread, { now }),
    )
    .map((thread) => ({ thread, rank: STATUS_RANK[tvThreadStatus(thread)] }))
    .sort(
      (left, right) =>
        left.rank - right.rank || right.thread.updatedAt.localeCompare(left.thread.updatedAt),
    )
    .map(({ thread }) => thread);
}

export type TvFocusKey = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight" | "Home" | "End";

/** Moves focus in a row-major grid; vertical moves past the last row land on the last item. */
export function moveTvFocus(
  index: number,
  key: TvFocusKey,
  count: number,
  columns: number,
): number {
  if (count === 0) return 0;
  const last = count - 1;
  const current = Math.max(0, Math.min(last, index));
  switch (key) {
    case "ArrowLeft":
      return Math.max(0, current - 1);
    case "ArrowRight":
      return Math.min(last, current + 1);
    case "ArrowUp":
      return current - columns >= 0 ? current - columns : current;
    case "ArrowDown":
      return Math.floor(current / columns) < Math.floor(last / columns)
        ? Math.min(last, current + columns)
        : current;
    case "Home":
      return 0;
    case "End":
      return last;
  }
}

export function isTvFocusKey(key: string): key is TvFocusKey {
  return (
    key === "ArrowUp" ||
    key === "ArrowDown" ||
    key === "ArrowLeft" ||
    key === "ArrowRight" ||
    key === "Home" ||
    key === "End"
  );
}
