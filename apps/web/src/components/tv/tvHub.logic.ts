import {
  scopeProjectRef,
  scopedProjectKey,
  scopedThreadKey,
} from "@t3tools/client-runtime/environment";
import type { ScopedProjectRef } from "@t3tools/contracts";
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

export const TV_NEW_THREAD_TILE = "new-thread";

export interface TvHubProject {
  readonly key: string;
  readonly ref: ScopedProjectRef;
  readonly title: string;
  readonly threads: ReadonlyArray<EnvironmentThreadShell>;
  /** Ring order: the new-thread tile, then one tile per thread. */
  readonly tiles: ReadonlyArray<string>;
}

export function tvThreadTileKey(thread: Pick<EnvironmentThreadShell, "environmentId" | "id">) {
  return scopedThreadKey({ environmentId: thread.environmentId, threadId: thread.id });
}

/**
 * One ring per project. `threads` is already in attention order, so a project is placed by its
 * most urgent thread; projects with nothing active follow in the order given.
 */
export function buildTvHub(
  projects: ReadonlyArray<{
    readonly environmentId: EnvironmentThreadShell["environmentId"];
    readonly id: EnvironmentThreadShell["projectId"];
    readonly title: string;
  }>,
  threads: ReadonlyArray<EnvironmentThreadShell>,
): TvHubProject[] {
  const threadsByProject = new Map<string, EnvironmentThreadShell[]>();
  for (const thread of threads) {
    const key = scopedProjectKey(scopeProjectRef(thread.environmentId, thread.projectId));
    const group = threadsByProject.get(key);
    if (group) group.push(thread);
    else threadsByProject.set(key, [thread]);
  }
  const urgency = [...threadsByProject.keys()];
  const rank = (key: string) => {
    const index = urgency.indexOf(key);
    return index === -1 ? urgency.length : index;
  };
  return projects
    .map((project) => {
      const ref = scopeProjectRef(project.environmentId, project.id);
      const key = scopedProjectKey(ref);
      const projectThreads = threadsByProject.get(key) ?? [];
      return {
        key,
        ref,
        title: project.title,
        threads: projectThreads,
        tiles: [TV_NEW_THREAD_TILE, ...projectThreads.map(tvThreadTileKey)],
      };
    })
    .map((project, order) => ({ project, order }))
    .sort(
      (left, right) => rank(left.project.key) - rank(right.project.key) || left.order - right.order,
    )
    .map(({ project }) => project);
}

/** Index of the remembered tile, or the first thread (the new-thread tile when there is none). */
export function resolveTvFocus(tiles: ReadonlyArray<string>, remembered: string | undefined) {
  const index = remembered === undefined ? -1 : tiles.indexOf(remembered);
  return index !== -1 ? index : Math.min(1, tiles.length - 1);
}

export function stepTvIndex(index: number, delta: number, count: number) {
  return Math.max(0, Math.min(count - 1, index + delta));
}

const RING_STEP_DEGREES = 33;
const RING_OPACITY = [1, 0.85, 0.4];

/** Placement of a ring slot `offset` steps from the focused one; null when out of view. */
export function tvRingSlot(offset: number): { angle: number; opacity: number } | null {
  const opacity = RING_OPACITY[Math.abs(offset)];
  return opacity === undefined ? null : { angle: offset * RING_STEP_DEGREES, opacity };
}

const GAUGE_CELLS = 10;

/** A limit window as lit cells; any quota left lights at least one. */
export function tvGauge(remainingPercent: number): {
  cells: number;
  full: number;
  level: "ok" | "low" | "critical";
} {
  const full =
    remainingPercent <= 0
      ? 0
      : Math.max(1, Math.min(GAUGE_CELLS, Math.round(remainingPercent / GAUGE_CELLS)));
  return {
    cells: GAUGE_CELLS,
    full,
    level: remainingPercent > 50 ? "ok" : remainingPercent > 20 ? "low" : "critical",
  };
}
