import {
  scopeProjectRef,
  scopedProjectKey,
  scopedThreadKey,
} from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { useNavigate } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { isCommandPaletteOpen } from "../../commandPaletteBus";
import { useNewThreadHandler } from "../../hooks/useHandleNewThread";
import { useNowMinute } from "../../hooks/useNowMinute";
import { isEditableFocused } from "../../lib/editableFocus";
import { cn } from "../../lib/utils";
import { useProjects, useVisibleThreadShells } from "../../state/entities";
import { buildThreadRouteParams } from "../../threadRoutes";
import { formatRelativeTimeLabel } from "../../timestampFormat";
import { setTvModeEnabled, stepTvScale, toggleFullscreen, useTvMode } from "../../tvMode";
import { sortScopedProjectsForSidebar } from "../Sidebar.logic";
import { Kbd } from "../ui/kbd";
import {
  isTvFocusKey,
  moveTvFocus,
  selectTvThreads,
  tvThreadStatus,
  type TvThreadStatus,
} from "./tvLobby.logic";
import { TvUsageHud } from "./TvUsageHud";

const CARD_WIDTH_REM = 24;
const PAGE_PADDING_REM = 6;

const STATUS_PRESENTATION: Record<TvThreadStatus, { label: string; className: string }> = {
  approval: {
    label: "Needs approval",
    className: "bg-amber-500/15 text-amber-600 dark:text-amber-300",
  },
  input: { label: "Needs input", className: "bg-sky-500/15 text-sky-600 dark:text-sky-300" },
  failed: { label: "Failed", className: "bg-red-500/15 text-red-600 dark:text-red-300" },
  working: {
    label: "Working",
    className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
  },
  idle: { label: "Idle", className: "bg-foreground/8 text-muted-foreground" },
};

function subscribeToResize(onChange: () => void) {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

function useGridColumns(scale: number) {
  const width = useSyncExternalStore(subscribeToResize, () => window.innerWidth);
  const remPx = 16 * scale;
  return Math.max(1, Math.floor((width - PAGE_PADDING_REM * remPx) / (CARD_WIDTH_REM * remPx)));
}

type LobbyTile =
  | { readonly kind: "new-thread"; readonly key: string }
  | { readonly kind: "thread"; readonly key: string; readonly thread: EnvironmentThreadShell }
  | {
      readonly kind: "project";
      readonly key: string;
      readonly title: string;
      readonly workspaceRoot: string;
      readonly run: () => void;
    };

export function TvLobby() {
  const navigate = useNavigate();
  const handleNewThread = useNewThreadHandler();
  const { scale } = useTvMode();
  const columns = useGridColumns(scale);
  const shells = useVisibleThreadShells();
  const projects = useProjects();
  const [picking, setPicking] = useState(false);
  const [focusIndex, setFocusIndex] = useState(0);
  const tileRefs = useRef(new Map<string, HTMLButtonElement>());

  const nowIso = useNowMinute();
  const nowMs = Date.parse(nowIso);
  const projectTitles = new Map(
    projects.map((project) => [
      scopedProjectKey(scopeProjectRef(project.environmentId, project.id)),
      project.title,
    ]),
  );

  const openThread = (thread: EnvironmentThreadShell) =>
    void navigate({
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams({ environmentId: thread.environmentId, threadId: thread.id }),
    });

  const tiles: LobbyTile[] = picking
    ? sortScopedProjectsForSidebar(
        projects.filter((project) => project.archivedAt == null),
        shells,
        "updated_at",
      ).map((project) => ({
        kind: "project",
        key: scopedProjectKey(scopeProjectRef(project.environmentId, project.id)),
        title: project.title,
        workspaceRoot: project.workspaceRoot,
        run: () => void handleNewThread(scopeProjectRef(project.environmentId, project.id)),
      }))
    : [
        { kind: "new-thread", key: "new-thread" },
        ...selectTvThreads(shells, nowIso).map((thread) => ({
          kind: "thread" as const,
          key: scopedThreadKey({ environmentId: thread.environmentId, threadId: thread.id }),
          thread,
        })),
      ];
  const focused = Math.min(focusIndex, Math.max(0, tiles.length - 1));
  const focusedKey = tiles[focused]?.key ?? null;

  const switchView = (nextPicking: boolean) => {
    setPicking(nextPicking);
    setFocusIndex(0);
  };
  const exitTvMode = () => {
    setTvModeEnabled(false);
    void navigate({ to: "/" });
  };

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- moves DOM focus to the tile the keyboard selected
  useEffect(() => {
    const element = focusedKey === null ? undefined : tileRefs.current.get(focusedKey);
    if (element === undefined || document.activeElement === element) return;
    element.focus({ preventScroll: true });
    element.scrollIntoView({ block: "nearest" });
  }, [focusedKey]);

  const onKeyDown = (event: KeyboardEvent) => {
    if (
      event.defaultPrevented ||
      event.isComposing ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey
    )
      return;
    if (isCommandPaletteOpen() || isEditableFocused(event.target)) return;
    if (document.querySelector('[role="dialog"], [role="alertdialog"]') !== null) return;
    const handled = () => {
      event.preventDefault();
      event.stopPropagation();
    };
    if (isTvFocusKey(event.key)) {
      handled();
      setFocusIndex(moveTvFocus(focused, event.key, tiles.length, columns));
      return;
    }
    switch (event.key) {
      case "Escape":
      case "Backspace":
        if (picking) {
          handled();
          switchView(false);
        }
        return;
      case "n":
      case "N":
        handled();
        switchView(true);
        return;
      case "u":
      case "U":
        handled();
        void navigate({ to: "/usage" });
        return;
      case "+":
      case "=":
        handled();
        stepTvScale(1);
        return;
      case "-":
      case "_":
        handled();
        stepTvScale(-1);
        return;
      case "f":
      case "F":
        handled();
        toggleFullscreen();
        return;
      case "q":
      case "Q":
        handled();
        exitTvMode();
        return;
    }
  };
  const onWindowKeyDown = useEffectEvent(onKeyDown);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- window keydown listener for lobby navigation
  useEffect(() => {
    const listener = (event: KeyboardEvent) => onWindowKeyDown(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  return (
    <main className="flex h-dvh w-full min-w-0 flex-col overflow-hidden bg-background text-foreground">
      <header className="flex shrink-0 items-start justify-between gap-8 px-12 pt-10 pb-6">
        <div className="flex flex-col gap-1">
          <h1 className="font-semibold text-3xl tracking-tight">
            {picking ? "Start a thread in…" : "Active threads"}
          </h1>
          <p className="text-muted-foreground">
            {picking
              ? "Pick a project. The composer opens next; dictate or type your prompt."
              : `${tiles.length - 1} active`}
          </p>
        </div>
        <TvUsageHud />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-12 py-8 [perspective:120rem]">
        <ul
          className="grid gap-8 [transform-style:preserve-3d] [transform:rotateX(4deg)]"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {tiles.map((tile, index) => (
            <li key={tile.key} className="[transform-style:preserve-3d]">
              <TvTile
                ref={(element) => {
                  if (element) tileRefs.current.set(tile.key, element);
                  else tileRefs.current.delete(tile.key);
                }}
                focused={index === focused}
                onFocus={() => setFocusIndex(index)}
                onClick={() => {
                  if (tile.kind === "new-thread") switchView(true);
                  else if (tile.kind === "thread") openThread(tile.thread);
                  else tile.run();
                }}
              >
                {tile.kind === "new-thread" ? (
                  <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
                    <PlusIcon className="size-10" />
                    <span className="font-medium text-xl">New thread</span>
                  </div>
                ) : tile.kind === "project" ? (
                  <div className="flex h-full flex-col justify-between gap-3">
                    <span className="line-clamp-2 font-semibold text-2xl">{tile.title}</span>
                    <span className="truncate text-muted-foreground text-sm">
                      {tile.workspaceRoot}
                    </span>
                  </div>
                ) : (
                  <ThreadTileBody
                    thread={tile.thread}
                    projectTitle={
                      projectTitles.get(
                        scopedProjectKey(
                          scopeProjectRef(tile.thread.environmentId, tile.thread.projectId),
                        ),
                      ) ?? null
                    }
                    nowMs={nowMs}
                  />
                )}
              </TvTile>
            </li>
          ))}
        </ul>
      </div>

      <footer className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-2 border-t px-12 py-4 text-muted-foreground text-sm">
        <KeyHint keys="← ↑ → ↓">Move</KeyHint>
        <KeyHint keys="Enter">Open</KeyHint>
        {picking ? <KeyHint keys="Esc">Back</KeyHint> : <KeyHint keys="N">New thread</KeyHint>}
        <KeyHint keys="U">Usage</KeyHint>
        <KeyHint keys="+ / −">Text size</KeyHint>
        <KeyHint keys="F">Full screen</KeyHint>
        <span className="flex-1" />
        <button
          type="button"
          className="rounded-md px-2 py-1 hover:bg-accent hover:text-foreground"
          onClick={exitTvMode}
        >
          <KeyHint keys="Q">Exit TV mode</KeyHint>
        </button>
      </footer>
    </main>
  );
}

function KeyHint({ keys, children }: { readonly keys: string; readonly children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Kbd variant="outline">{keys}</Kbd>
      {children}
    </span>
  );
}

function TvTile({
  ref,
  focused,
  onFocus,
  onClick,
  children,
}: {
  readonly ref: (element: HTMLButtonElement | null) => void;
  readonly focused: boolean;
  readonly onFocus: () => void;
  readonly onClick: () => void;
  readonly children: ReactNode;
}) {
  return (
    <button
      ref={ref}
      type="button"
      tabIndex={focused ? 0 : -1}
      onFocus={onFocus}
      onClick={onClick}
      className={cn(
        "block h-44 w-full rounded-2xl border bg-card p-6 text-left shadow-sm outline-none transition-[transform,box-shadow,border-color] duration-150 motion-reduce:transition-none",
        focused
          ? "border-primary shadow-2xl ring-4 ring-primary/40 [transform:translateZ(3rem)_scale(1.04)]"
          : "opacity-85",
      )}
    >
      {children}
    </button>
  );
}

function ThreadTileBody({
  thread,
  projectTitle,
  nowMs,
}: {
  readonly thread: EnvironmentThreadShell;
  readonly projectTitle: string | null;
  readonly nowMs: number;
}) {
  const status = STATUS_PRESENTATION[tvThreadStatus(thread)];
  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className={cn("rounded-full px-2.5 py-0.5 font-medium", status.className)}>
          {status.label}
        </span>
        <span className="text-muted-foreground">
          {formatRelativeTimeLabel(thread.updatedAt, nowMs)}
        </span>
      </div>
      <span className="line-clamp-2 font-semibold text-xl leading-snug">{thread.title}</span>
      <span className="mt-auto truncate text-muted-foreground text-sm">
        {[projectTitle, thread.branch].filter(Boolean).join(" · ")}
      </span>
    </div>
  );
}
