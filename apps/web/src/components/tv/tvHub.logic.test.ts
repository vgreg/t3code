import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { describe, expect, it } from "vite-plus/test";

import {
  buildTvHub,
  buildTvStatusHub,
  resolveTvFocus,
  selectTvThreads,
  stepTvIndex,
  TV_NEW_THREAD_TILE,
  tvArrivals,
  tvGauge,
  tvRingSlot,
  tvThreadStatus,
} from "./tvHub.logic";

const NOW = "2026-11-10T12:00:00.000Z";

function shell(
  id: string,
  overrides: Partial<EnvironmentThreadShell> = {},
): EnvironmentThreadShell {
  return {
    id,
    updatedAt: "2026-11-10T10:00:00.000Z",
    archivedAt: null,
    deletedAt: null,
    settledOverride: null,
    settledAt: null,
    snoozedUntil: null,
    snoozedAt: null,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    pendingSubagentRequest: null,
    pinnedAt: null,
    runtime: null,
    latestRun: null,
    ...overrides,
  } as EnvironmentThreadShell;
}

const running = {
  status: "running",
  activeRunId: null,
  providerInstanceId: "codex",
  providerName: null,
  lastError: null,
  updatedAt: NOW,
} as unknown as EnvironmentThreadShell["runtime"];

describe("tvThreadStatus", () => {
  it.each([
    ["approval", shell("a", { hasPendingApprovals: true, runtime: running })],
    ["input", shell("b", { hasPendingUserInput: true })],
    ["working", shell("c", { runtime: running })],
    [
      "failed",
      shell("d", {
        runtime: { ...running!, status: "idle", lastError: "boom" },
      }),
    ],
    ["idle", shell("e")],
  ])("reports %s", (expected, thread) => {
    expect(tvThreadStatus(thread)).toBe(expected);
  });
});

describe("selectTvThreads", () => {
  it("drops archived, settled, and snoozed threads and puts requests for the user first", () => {
    const threads = [
      shell("newest-idle", { updatedAt: "2026-11-10T11:00:00.000Z" }),
      shell("older-idle"),
      shell("working", { runtime: running }),
      shell("approval", { hasPendingApprovals: true, updatedAt: "2026-11-09T00:00:00.000Z" }),
      shell("archived", { archivedAt: NOW }),
      shell("auto-settled", { settledAt: NOW }),
      shell("reopened", { settledAt: NOW, settledOverride: "active" }),
      shell("snoozed", { snoozedUntil: "2026-11-11T00:00:00.000Z", snoozedAt: NOW }),
    ];
    expect(selectTvThreads(threads, NOW).map((thread) => thread.id)).toEqual([
      "approval",
      "working",
      "newest-idle",
      "older-idle",
      "reopened",
    ]);
  });
});

describe("buildTvHub", () => {
  const project = (id: string) =>
    ({ environmentId: "env", id, title: id }) as Parameters<typeof buildTvHub>[0][number];
  const inProject = (id: string, projectId: string) =>
    shell(id, { environmentId: "env", projectId } as Partial<EnvironmentThreadShell>);

  it("orders projects by their most urgent thread and keeps idle projects last", () => {
    const hub = buildTvHub(
      [project("quiet"), project("b"), project("a")],
      [inProject("a1", "a"), inProject("b1", "b"), inProject("a2", "a")],
    );
    expect(hub.map((entry) => entry.title)).toEqual(["a", "b", "quiet"]);
    expect(hub[0]?.threads.map((thread) => thread.id)).toEqual(["a1", "a2"]);
    expect(hub[0]?.tiles).toHaveLength(3);
    expect(hub[2]?.tiles).toEqual([TV_NEW_THREAD_TILE]);
  });
});

describe("buildTvStatusHub", () => {
  it("makes one ring per state in use, with a pinned thread only in Pinned", () => {
    const hub = buildTvStatusHub([
      shell("asks", { hasPendingUserInput: true }),
      shell("approve", { hasPendingApprovals: true }),
      shell("busy", { runtime: running }),
      shell("kept", { runtime: running, pinnedAt: NOW }),
    ]);
    expect(hub.map((group) => [group.title, group.threads.map((thread) => thread.id)])).toEqual([
      ["Pinned", ["kept"]],
      ["Waiting on you", ["asks", "approve"]],
      ["Working", ["busy"]],
    ]);
    expect(hub[0]?.tiles).not.toContain(TV_NEW_THREAD_TILE);
  });
});

describe("tvArrivals", () => {
  it("reports threads that were not there before, and none on the first look", () => {
    expect(tvArrivals(null, ["a"])).toEqual([]);
    expect(tvArrivals(["a"], ["b", "a", "c"])).toEqual(["b", "c"]);
  });
});

describe("resolveTvFocus", () => {
  const tiles = [TV_NEW_THREAD_TILE, "t1", "t2"];

  it.each([
    ["the remembered tile", "t2", 2],
    ["the first thread when nothing is remembered", undefined, 1],
    ["the first thread when the remembered one is gone", "gone", 1],
  ])("lands on %s", (_label, remembered, expected) => {
    expect(resolveTvFocus(tiles, remembered)).toBe(expected);
  });

  it("lands on the new-thread tile in a project with no threads", () => {
    expect(resolveTvFocus([TV_NEW_THREAD_TILE], "gone")).toBe(0);
  });

  it("lands on the first thread of a status ring, which has no new-thread tile", () => {
    expect(resolveTvFocus(["t1", "t2"], undefined)).toBe(0);
  });
});

describe("stepTvIndex", () => {
  it.each([
    [0, -1, 0],
    [1, 1, 2],
    [2, 1, 2],
  ])("from %i by %i lands on %i", (from, delta, expected) => {
    expect(stepTvIndex(from, delta, 3)).toBe(expected);
  });
});

describe("tvRingSlot", () => {
  it("shows two slots each side of the focus and hides the rest", () => {
    expect(tvRingSlot(0)).toEqual({ angle: 0, opacity: 1 });
    expect(tvRingSlot(-2)?.angle).toBe(-66);
    expect(tvRingSlot(3)).toBeNull();
  });
});

describe("tvGauge", () => {
  it.each([
    [100, 10, "ok"],
    [83, 8, "ok"],
    [41, 4, "low"],
    [3, 1, "critical"],
    [0, 0, "critical"],
  ] as const)("%i%% left lights %i cells at level %s", (percent, full, level) => {
    expect(tvGauge(percent)).toMatchObject({ full, level });
  });
});
