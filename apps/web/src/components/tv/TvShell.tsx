import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";

import { isCommandPaletteOpen } from "../../commandPaletteBus";
import { useNewThreadHandler } from "../../hooks/useHandleNewThread";
import { useNowMinute } from "../../hooks/useNowMinute";
import { useThreadRouteTarget } from "../../hooks/useThreadRouteTarget";
import { isEditableFocused } from "../../lib/editableFocus";
import { registerCommands } from "../../shortcuts/dispatcher";
import { useProjects, useVisibleThreadShells } from "../../state/entities";
import { buildThreadRouteParams } from "../../threadRoutes";
import { formatRelativeTimeLabel } from "../../timestampFormat";
import {
  setTvModeEnabled,
  stepTvScale,
  toggleFullscreen,
  toggleTvHints,
  useTvMode,
} from "../../tvMode";
import { sortScopedProjectsForSidebar } from "../Sidebar.logic";
import { isAppModalPage } from "../sidebar/mainAppLocation";
import { Kbd } from "../ui/kbd";
import {
  buildTvHub,
  resolveTvFocus,
  selectTvThreads,
  stepTvIndex,
  TV_NEW_THREAD_TILE,
  tvRingSlot,
  tvThreadStatus,
  tvThreadTileKey,
  type TvHubProject,
  type TvThreadStatus,
} from "./tvHub.logic";
import { collectTvItems, TvItemBody, TvItemRail, type TvItem } from "./TvItems";
import { TvUsageHud } from "./TvUsageHud";
import { TvWindow } from "./TvWindow";
import "./tv.css";

const TV_HUB_PATH = "/tv";
const RING_RADIUS_VW = 62;
const WHEEL_STEP_MS = 180;
const OPEN_LAYER_SELECTOR =
  '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]';

const STATUS_LABEL: Record<TvThreadStatus, string> = {
  approval: "Needs approval",
  input: "Asks you",
  failed: "Failed",
  working: "Working",
  idle: "Idle",
};

interface HubState {
  readonly projectKey: string | null;
  /** The focused tile of each project, so returning to a ring lands where it was left. */
  readonly focus: Readonly<Record<string, string>>;
  readonly swing: "up" | "down" | null;
}

interface RailState {
  readonly forKey: string;
  readonly items: ReadonlyArray<TvItem>;
  readonly index: number;
  readonly open: boolean;
}

function findScrollable(root: HTMLElement): HTMLElement | null {
  for (const element of root.querySelectorAll<HTMLElement>("*")) {
    if (element.scrollHeight <= element.clientHeight + 1) continue;
    const overflow = getComputedStyle(element).overflowY;
    if (overflow === "auto" || overflow === "scroll") return element;
  }
  return null;
}

function pageTitle(
  pathname: string,
  target: ReturnType<typeof useThreadRouteTarget>,
  thread: EnvironmentThreadShell | null,
) {
  if (target?.kind === "draft") return "New thread";
  if (target?.kind === "server") return thread?.title ?? "Thread";
  if (pathname === "/usage") return "Usage";
  if (pathname.startsWith("/settings")) return "Settings";
  return null;
}

/**
 * The whole TV surface: the hub ring of threads, and the routed page (thread, draft, usage)
 * in a window in front of it. `children` is the normal app shell, so a thread renders exactly
 * as it does outside TV mode.
 */
export function TvShell({ children }: { readonly children: ReactNode }) {
  const navigate = useNavigate();
  const pathname = useLocation({ select: (location) => location.pathname });
  const routeTarget = useThreadRouteTarget();
  const handleNewThread = useNewThreadHandler();
  const { hints } = useTvMode();
  const shells = useVisibleThreadShells();
  const projects = useProjects();
  const nowIso = useNowMinute();
  const nowMs = Date.parse(nowIso);
  const [hubState, setHubState] = useState<HubState>({ projectKey: null, focus: {}, swing: null });
  const [swap, setSwap] = useState<{ count: number; direction: "next" | "prev" } | null>(null);
  const [rail, setRail] = useState<RailState | null>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const itemRef = useRef<HTMLDivElement>(null);
  const wheelAt = useRef(0);
  // A thread refocuses its composer when it opens. After a swap the user is still browsing,
  // so that focus is declined until they press another key or click.
  const browsing = useRef(false);

  const hub = buildTvHub(
    sortScopedProjectsForSidebar(
      projects.filter((project) => project.archivedAt == null),
      shells,
      "updated_at",
    ),
    selectTvThreads(shells, nowIso),
  );
  const onHub = pathname === TV_HUB_PATH;
  const routeThreadKey =
    routeTarget?.kind === "server" ? scopedThreadKey(routeTarget.threadRef) : null;
  const routeThread =
    routeThreadKey === null
      ? null
      : (shells.find((thread) => tvThreadTileKey(thread) === routeThreadKey) ?? null);

  // Settings and Usage open as the app's own dialogs, so the hub stays in view behind them.
  const ringInFront = onHub || isAppModalPage(pathname);
  const activeRail = !onHub && rail !== null && rail.forKey === routeThreadKey ? rail : null;
  const activeItem = activeRail?.items[activeRail.index] ?? null;
  const routeRoot =
    routeThread === null
      ? null
      : (projects.find(
          (entry) =>
            entry.environmentId === routeThread.environmentId && entry.id === routeThread.projectId,
        )?.workspaceRoot ?? null);
  const itemThread =
    routeTarget?.kind === "server" && routeThread !== null && routeRoot !== null
      ? {
          environmentId: routeThread.environmentId,
          threadRef: routeTarget.threadRef,
          cwd: routeThread.worktreePath ?? routeRoot,
          workspaceRoot: routeThread.worktreePath ?? routeRoot,
        }
      : null;

  // The open thread is the hub's focus, however it was opened, so Back lands on its card.
  const routeProject =
    routeThreadKey === null ? null : hub.find((entry) => entry.tiles.includes(routeThreadKey));
  if (
    routeProject &&
    routeThreadKey !== null &&
    (hubState.projectKey !== routeProject.key ||
      hubState.focus[routeProject.key] !== routeThreadKey)
  ) {
    setHubState({
      projectKey: routeProject.key,
      focus: { ...hubState.focus, [routeProject.key]: routeThreadKey },
      swing: null,
    });
  }

  const projectIndex = Math.max(
    0,
    hub.findIndex((entry) => entry.key === hubState.projectKey),
  );
  const project: TvHubProject | null = hub[projectIndex] ?? null;
  const tiles = project?.tiles ?? [];
  const focusIndex = project === null ? 0 : resolveTvFocus(tiles, hubState.focus[project.key]);

  const moveFocus = (delta: number) => {
    const tile = tiles[stepTvIndex(focusIndex, delta, tiles.length)];
    if (project === null || tile === undefined) return;
    setHubState({ ...hubState, focus: { ...hubState.focus, [project.key]: tile } });
  };
  const moveProject = (delta: number) => {
    const next = hub[stepTvIndex(projectIndex, delta, hub.length)];
    if (next === undefined || next.key === project?.key) return;
    setHubState({ ...hubState, projectKey: next.key, swing: delta > 0 ? "down" : "up" });
  };
  const openThread = (thread: EnvironmentThreadShell) =>
    void navigate({
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams({ environmentId: thread.environmentId, threadId: thread.id }),
    });
  const startThread = () => {
    if (project !== null) void handleNewThread(project.ref);
  };
  const openTile = (index: number) => {
    const thread = project?.threads[index - 1];
    if (thread) openThread(thread);
    else if (tiles[index] === TV_NEW_THREAD_TILE) startThread();
  };
  const swapThread = (delta: 1 | -1) => {
    if (project === null) return false;
    const current = project.threads.findIndex(
      (thread) => tvThreadTileKey(thread) === routeThreadKey,
    );
    const next = project.threads[current + delta];
    if (next === undefined) return false;
    setSwap({ count: (swap?.count ?? 0) + 1, direction: delta === 1 ? "next" : "prev" });
    browsing.current = true;
    openThread(next);
    return true;
  };
  const toHub = () => void navigate({ to: TV_HUB_PATH });
  const exitTvMode = () => {
    setTvModeEnabled(false);
    void navigate({ to: "/" });
  };

  // Tab lists what is on screen; Enter pops the picked item out into its own window.
  const itemKey = (key: string): boolean => {
    if (key === "Tab") {
      const items =
        activeRail !== null || pageRef.current === null ? [] : collectTvItems(pageRef.current);
      setRail(
        items.length > 0 && routeThreadKey !== null
          ? { forKey: routeThreadKey, items, index: 0, open: false }
          : null,
      );
      return true;
    }
    if (activeRail === null) return false;
    const step = (delta: number) =>
      setRail({
        ...activeRail,
        index: stepTvIndex(activeRail.index, delta, activeRail.items.length),
      });
    switch (key) {
      case "Escape":
        setRail(activeRail.open ? { ...activeRail, open: false } : null);
        return true;
      case "Enter":
        if (activeRail.open) return false;
        setRail({ ...activeRail, open: true });
        return true;
      case "ArrowUp":
      case "ArrowDown": {
        const delta = key === "ArrowDown" ? 1 : -1;
        if (!activeRail.open) step(delta);
        else {
          const scroller = itemRef.current === null ? null : findScrollable(itemRef.current);
          scroller?.scrollBy({ top: delta * scroller.clientHeight * 0.8, behavior: "smooth" });
        }
        return true;
      }
      case "ArrowLeft":
      case "ArrowRight":
        if (!activeRail.open) return false;
        step(key === "ArrowRight" ? 1 : -1);
        return true;
      default:
        return false;
    }
  };

  const hubKey = (key: string): boolean => {
    switch (key) {
      case "ArrowLeft":
        moveFocus(-1);
        return true;
      case "ArrowRight":
        moveFocus(1);
        return true;
      case "ArrowUp":
        moveProject(-1);
        return true;
      case "ArrowDown":
        moveProject(1);
        return true;
      case "Enter":
        openTile(focusIndex);
        return true;
      case "n":
      case "N":
        startThread();
        return true;
      case "u":
      case "U":
        void navigate({ to: "/usage" });
        return true;
      case "h":
      case "H":
        toggleTvHints();
        return true;
      case "+":
      case "=":
        stepTvScale(1);
        return true;
      case "-":
      case "_":
        stepTvScale(-1);
        return true;
      case "f":
      case "F":
        toggleFullscreen();
        return true;
      case "q":
      case "Q":
        exitTvMode();
        return true;
      default:
        return false;
    }
  };

  // Runs ahead of the app's own handlers. Navigation keys act only outside a text field, so
  // dictated or typed text is never read as a command; Escape is what leaves a field.
  const onCaptureKeyDown = useEffectEvent((event: KeyboardEvent): boolean => {
    if (event.key !== "[" && event.key !== "]") browsing.current = false;
    if (event.isComposing || event.metaKey || event.ctrlKey || event.altKey) return false;
    if (isCommandPaletteOpen() || document.querySelector(OPEN_LAYER_SELECTOR) !== null) {
      return false;
    }
    const editable = isEditableFocused(event.target);
    if (!onHub && !editable && !isAppModalPage(pathname) && itemKey(event.key)) {
      event.preventDefault();
      return true;
    }
    if (!onHub && event.key === "Escape") {
      const active = document.activeElement;
      // The blur waits a task so the editor still handles this Escape itself.
      if (editable && !event.repeat && active instanceof HTMLElement) {
        setTimeout(() => active.blur(), 0);
      }
      return false;
    }
    if (editable) return false;
    const handled = onHub
      ? hubKey(event.key)
      : !isAppModalPage(pathname) &&
        (event.key === "[" || event.key === "]") &&
        swapThread(event.key === "]" ? 1 : -1);
    if (handled) event.preventDefault();
    return handled;
  });
  // Escape returns to the hub only when nothing else used it.
  const onObservedKeyDown = useEffectEvent((event: KeyboardEvent, consumed: boolean) => {
    if (consumed || onHub || event.key !== "Escape" || event.repeat || event.isComposing) return;
    if (isEditableFocused() || isAppModalPage(pathname)) return;
    if (document.querySelector(OPEN_LAYER_SELECTOR) !== null) return;
    event.preventDefault();
    toHub();
  });
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- registers TV key handling with the shortcut dispatcher
  useEffect(() => {
    const disposers = [
      registerCommands({}, { capture: true, onKeyDown: (event) => onCaptureKeyDown(event) }),
      registerCommands({}, { observe: (event, consumed) => onObservedKeyDown(event, consumed) }),
    ];
    return () => {
      for (const dispose of disposers) dispose();
    };
  }, []);

  const title = pageTitle(pathname, routeTarget, routeThread);
  const position = project === null ? null : `Project ${projectIndex + 1} of ${hub.length}`;

  return (
    <div data-tv="stage" data-hints={hints ? "" : undefined}>
      <div data-tv="hud" data-edge="top">
        <button
          type="button"
          data-tv="where"
          onClick={toHub}
          aria-label="Back to the hub"
          disabled={onHub}
        >
          <b>{project?.title ?? "T3 Code"}</b>
          <span>{onHub ? position : (routeThread?.branch ?? position)}</span>
        </button>
        <TvUsageHud />
      </div>

      <div
        data-tv="ring"
        data-tv-move=""
        inert={!onHub}
        style={{
          transform: ringInFront
            ? `translateZ(${-RING_RADIUS_VW}vw)`
            : `translateZ(${-RING_RADIUS_VW - 60}vw) translateY(-10vw)`,
          opacity: ringInFront ? 1 : 0.12,
        }}
        onWheel={(event) => {
          const delta =
            Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
          if (Math.abs(delta) < 20 || event.timeStamp - wheelAt.current < WHEEL_STEP_MS) return;
          wheelAt.current = event.timeStamp;
          moveFocus(delta > 0 ? 1 : -1);
        }}
      >
        {project === null ? null : (
          <div key={project.key} data-tv="ring-swing" data-swing={hubState.swing ?? undefined}>
            {tiles.map((tile, index) => {
              const slot = tvRingSlot(index - focusIndex);
              if (slot === null) return null;
              const thread = project.threads[index - 1];
              const focused = index === focusIndex;
              return (
                <div
                  key={tile}
                  data-tv="slot"
                  data-tv-move=""
                  style={{
                    transform: `rotateY(${slot.angle}deg) translateZ(${RING_RADIUS_VW}vw)`,
                    opacity: slot.opacity,
                  }}
                >
                  <button
                    type="button"
                    data-tv="card"
                    data-focused={focused ? "" : undefined}
                    tabIndex={focused ? 0 : -1}
                    onClick={() => (focused ? openTile(index) : moveFocus(index - focusIndex))}
                  >
                    <TvWindow>
                      {thread ? (
                        <>
                          <span data-tv="pip" data-status={tvThreadStatus(thread)}>
                            {STATUS_LABEL[tvThreadStatus(thread)]}
                          </span>
                          <span data-tv="card-title">{thread.title}</span>
                          <span data-tv="card-meta">
                            {[thread.branch, formatRelativeTimeLabel(thread.updatedAt, nowMs)]
                              .filter(Boolean)
                              .join(", ")}
                          </span>
                        </>
                      ) : (
                        <>
                          <span data-tv="pip" data-status="new">
                            New thread
                          </span>
                          <span data-tv="card-title">Start a thread in {project.title}</span>
                          <span data-tv="card-meta">Speak or type the prompt next</span>
                        </>
                      )}
                    </TvWindow>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div
        ref={pageRef}
        data-tv="page"
        data-tv-move=""
        inert={onHub || activeRail?.open === true}
        onPointerDownCapture={() => {
          browsing.current = false;
        }}
        onFocusCapture={(event) => {
          const target = event.target;
          // Deferred: blurring inside the focus event re-enters the editor mid-render.
          if (browsing.current && isEditableFocused(target)) setTimeout(() => target.blur(), 0);
        }}
        data-swing={
          swap === null ? undefined : `${swap.direction}-${swap.count % 2 === 0 ? "a" : "b"}`
        }
        style={
          ringInFront
            ? { transform: "translateZ(-40vw) rotateX(18deg)", opacity: 0, pointerEvents: "none" }
            : activeRail?.open
              ? { transform: "translateX(-24vw) translateZ(-52vw) rotateY(34deg)", opacity: 0.55 }
              : undefined
        }
      >
        <TvWindow title={title}>{children}</TvWindow>
        {activeRail !== null && !activeRail.open ? (
          <TvItemRail
            items={activeRail.items}
            index={activeRail.index}
            onPick={(index) => setRail({ ...activeRail, index, open: true })}
          />
        ) : null}
      </div>

      <div
        ref={itemRef}
        data-tv="item"
        data-tv-move=""
        inert={activeRail?.open !== true}
        style={
          activeRail?.open
            ? { transform: "rotateY(-6deg)" }
            : {
                transform: "translateX(20vw) translateZ(-50vw) rotateY(-70deg)",
                opacity: 0,
                pointerEvents: "none",
              }
        }
      >
        {activeItem === null ? null : (
          <TvWindow title={activeItem.label}>
            {activeRail?.open ? (
              <TvItemBody key={activeItem.key} item={activeItem} thread={itemThread} />
            ) : null}
          </TvWindow>
        )}
      </div>

      {hints ? (
        <div data-tv="hud" data-edge="bottom">
          <div data-tv="hints">
            {onHub ? (
              <>
                <Hint keys="← →">Threads</Hint>
                <Hint keys="↑ ↓">Projects</Hint>
                <Hint keys="Enter">Open</Hint>
                <Hint keys="N">New thread</Hint>
                <Hint keys="U">Usage</Hint>
                <Hint keys="+ −">Text size</Hint>
                <Hint keys="F">Full screen</Hint>
                <Hint keys="Q">Exit TV mode</Hint>
                <Hint keys="H">Hide keys</Hint>
              </>
            ) : (
              <>
                <Hint keys="Esc">Leave the text field, then back</Hint>
                <Hint keys="[ ]">Previous or next thread</Hint>
                <Hint keys="Tab">Tables, images and PDFs on screen</Hint>
                <Hint keys="↑ ↓ Enter">Pick and open one</Hint>
                <Hint keys="← →">Next item</Hint>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Hint({ keys, children }: { readonly keys: string; readonly children: ReactNode }) {
  return (
    <span>
      <Kbd variant="outline">{keys}</Kbd>
      {children}
    </span>
  );
}
