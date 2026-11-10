import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { describe, expect, it } from "vite-plus/test";

import { moveTvFocus, selectTvThreads, tvThreadStatus } from "./tvLobby.logic";

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

describe("moveTvFocus", () => {
  // 0 1 2
  // 3 4 5
  // 6
  it.each([
    [4, "ArrowLeft", 3],
    [0, "ArrowLeft", 0],
    [5, "ArrowRight", 6],
    [6, "ArrowRight", 6],
    [4, "ArrowUp", 1],
    [1, "ArrowUp", 1],
    [1, "ArrowDown", 4],
    [5, "ArrowDown", 6],
    [6, "ArrowDown", 6],
    [4, "Home", 0],
    [1, "End", 6],
  ] as const)("from %i, %s lands on %i", (from, key, expected) => {
    expect(moveTvFocus(from, key, 7, 3)).toBe(expected);
  });

  it("clamps a stale index after the list shrinks", () => {
    expect(moveTvFocus(9, "ArrowLeft", 3, 3)).toBe(1);
  });
});
