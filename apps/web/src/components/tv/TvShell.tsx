import {
  scopeProjectRef,
  scopeThreadRef,
  scopedProjectKey,
  scopedThreadKey,
} from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";

import { isCommandPaletteOpen } from "../../commandPaletteBus";
import { useNewThreadHandler } from "../../hooks/useHandleNewThread";
import { useNowMinute } from "../../hooks/useNowMinute";
import { useThreadActions } from "../../hooks/useThreadActions";
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
  toggleTvGrouping,
  toggleTvHints,
  useTvMode,
} from "../../tvMode";
import { ProjectFavicon } from "../ProjectFavicon";
import { sortScopedProjectsForSidebar } from "../Sidebar.logic";
import { isAppModalPage } from "../sidebar/mainAppLocation";
import { Kbd } from "../ui/kbd";
import { stackedThreadToast, toastManager } from "../ui/toast";
import {
  buildTvHub,
  buildTvStatusHub,
  resolveTvFocus,
  selectTvThreads,
  stepTvIndex,
  TV_NEW_THREAD_TILE,
  tvArrivals,
  tvRingSlot,
  tvThreadProjectKey,
  tvThreadStatus,
  tvThreadTileKey,
  type TvHubGroup,
  type TvThreadStatus,
} from "./tvHub.logic";
import { collectTvItems, TvItemBody, TvItemRail, type TvItem } from "./TvItems";
import { TvUsageHud } from "./TvUsageHud";
import { TvWindow } from "./TvWindow";
import "./tv.css";

const TV_HUB_PATH = "/tv";
const RING_RADIUS_VW = 62;
// Far enough that the rings above and below the current one sit off screen.
const RING_ROW_GAP_VW = 72;
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
  readonly groupKey: string | null;
  /** The focused tile of each ring, so returning to one lands where it was left. */
  readonly focus: Readonly<Record<string, string>>;
}

/** A card playing out an action: `hop` stays in its ring, `lift` and `drop` leave it. */
interface CardFx {
  readonly key: string;
  readonly kind: "hop" | "lift" | "drop";
  readonly action: "pin" | "unpin" | "settle";
  readonly sent: boolean;
}

interface SeenThreads {
  readonly signature: string | null;
  readonly keys: ReadonlyArray<string> | null;
  /** Threads that appeared since the last change; their cards play an arrival. */
  readonly fresh: ReadonlyArray<string>;
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
  const { hints, grouping: storedGrouping } = useTvMode();
  const { pinThread, unpinThread, settleThread } = useThreadActions();
  const shells = useVisibleThreadShells();
  const projects = useProjects();
  const nowIso = useNowMinute();
  const nowMs = Date.parse(nowIso);
  const [hubState, setHubState] = useState<HubState>({ groupKey: null, focus: {} });
  const [seen, setSeen] = useState<SeenThreads>({ signature: null, keys: null, fresh: [] });
  const [fx, setFx] = useState<CardFx | null>(null);
  const [swap, setSwap] = useState<{ count: number; direction: "next" | "prev" } | null>(null);
  const [rail, setRail] = useState<RailState | null>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const itemRef = useRef<HTMLDivElement>(null);
  const wheelAt = useRef(0);
  // A thread refocuses its composer when it opens. After a swap the user is still browsing,
  // so that focus is declined until they press another key or click.
  const browsing = useRef(false);

  const threads = selectTvThreads(shells, nowIso);
  const projectHub = buildTvHub(
    sortScopedProjectsForSidebar(
      projects.filter((project) => project.archivedAt == null),
      shells,
      "updated_at",
    ),
    threads,
  );
  const statusHub = buildTvStatusHub(threads);
  // With no live thread there is no status ring to show, so the projects stay up.
  const grouping = storedGrouping === "status" && statusHub.length > 0 ? "status" : "project";
  const hub = grouping === "status" ? statusHub : projectHub;
  const projectByKey = new Map(
    projects.map((entry) => [
      scopedProjectKey(scopeProjectRef(entry.environmentId, entry.id)),
      entry,
    ]),
  );
  const projectOf = (thread: EnvironmentThreadShell) =>
    projectByKey.get(tvThreadProjectKey(thread)) ?? null;

  const threadKeys = threads.map(tvThreadTileKey);
  const signature = threadKeys.toSorted().join("\n");
  if (seen.signature !== signature) {
    setSeen({ signature, keys: threadKeys, fresh: tvArrivals(seen.keys, threadKeys) });
  }
  // A card that left its ring stays hidden until the thread's new state arrives.
  const fxThread =
    fx === null ? null : (threads.find((thread) => tvThreadTileKey(thread) === fx.key) ?? null);
  if (
    fx !== null &&
    fx.sent &&
    (fxThread === null || (fxThread.pinnedAt !== null) === (fx.action === "pin"))
  ) {
    setFx(null);
  }
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
  const routeProject = routeThread === null ? null : projectOf(routeThread);
  const routeRoot = routeProject?.workspaceRoot ?? null;
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
  const routeGroup =
    routeThreadKey === null ? null : hub.find((entry) => entry.tiles.includes(routeThreadKey));
  if (
    routeGroup &&
    routeThreadKey !== null &&
    (hubState.groupKey !== routeGroup.key || hubState.focus[routeGroup.key] !== routeThreadKey)
  ) {
    setHubState({
      groupKey: routeGroup.key,
      focus: { ...hubState.focus, [routeGroup.key]: routeThreadKey },
    });
  }

  const groupIndex = Math.max(
    0,
    hub.findIndex((entry) => entry.key === hubState.groupKey),
  );
  const group: TvHubGroup | null = hub[groupIndex] ?? null;
  const tiles = group?.tiles ?? [];
  const focusOf = (entry: TvHubGroup) => resolveTvFocus(entry.tiles, hubState.focus[entry.key]);
  const focusIndex = group === null ? 0 : focusOf(group);
  const threadAt = (entry: TvHubGroup, index: number) =>
    entry.threads.find((thread) => tvThreadTileKey(thread) === entry.tiles[index]) ?? null;
  const focusedThread = group === null ? null : threadAt(group, focusIndex);
  // A new thread starts in the ring's project, or in the focused thread's on a status ring.
  const startRef =
    group?.ref ??
    (focusedThread === null
      ? null
      : scopeProjectRef(focusedThread.environmentId, focusedThread.projectId));

  const settleArrivals = () => {
    if (seen.fresh.length > 0) setSeen({ ...seen, fresh: [] });
  };
  const moveFocus = (delta: number) => {
    const tile = tiles[stepTvIndex(focusIndex, delta, tiles.length)];
    if (group === null || tile === undefined) return;
    settleArrivals();
    setHubState({ ...hubState, focus: { ...hubState.focus, [group.key]: tile } });
  };
  const moveGroup = (delta: number) => {
    const next = hub[stepTvIndex(groupIndex, delta, hub.length)];
    if (next === undefined || next.key === group?.key) return;
    settleArrivals();
    setHubState({ ...hubState, groupKey: next.key });
  };
  // The focused thread stays focused in the other grouping.
  const switchGrouping = () => {
    const other = grouping === "status" ? projectHub : statusHub;
    const tile = focusedThread === null ? null : tvThreadTileKey(focusedThread);
    const target = tile === null ? undefined : other.find((entry) => entry.tiles.includes(tile));
    toggleTvGrouping();
    setHubState(
      target === undefined || tile === null
        ? { ...hubState, groupKey: null }
        : { groupKey: target.key, focus: { ...hubState.focus, [target.key]: tile } },
    );
  };
  const startFx = (action: "pin" | "settle") => {
    if (focusedThread === null || fx !== null) return;
    const pinned = focusedThread.pinnedAt !== null;
    const leaves = action === "settle" || grouping === "status";
    setFx({
      key: tvThreadTileKey(focusedThread),
      kind: !leaves ? "hop" : action === "settle" || pinned ? "drop" : "lift",
      action: action === "settle" ? "settle" : pinned ? "unpin" : "pin",
      sent: false,
    });
  };
  // The animation plays first, so the card is seen leaving before the thread moves.
  const finishFx = async () => {
    if (fx === null || fx.sent || fxThread === null || group === null) return;
    const ref = scopeThreadRef(fxThread.environmentId, fxThread.id);
    const neighbor = tiles[focusIndex + 1] ?? tiles[focusIndex - 1];
    if (fx.kind === "hop") setFx(null);
    else {
      setFx({ ...fx, sent: true });
      if (neighbor !== undefined) {
        setHubState({ ...hubState, focus: { ...hubState.focus, [group.key]: neighbor } });
      }
    }
    const result = await (fx.action === "settle"
      ? settleThread(ref)
      : fx.action === "pin"
        ? pinThread(ref)
        : unpinThread(ref));
    if (result._tag !== "Failure") return;
    setFx(null);
    if (isAtomCommandInterrupted(result)) return;
    const error = squashAtomCommandFailure(result);
    toastManager.add(
      stackedThreadToast({
        type: "error",
        title: `Could not ${fx.action} the thread`,
        description: error instanceof Error ? error.message : "An error occurred.",
      }),
    );
  };
  const openThread = (thread: EnvironmentThreadShell) =>
    void navigate({
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams({ environmentId: thread.environmentId, threadId: thread.id }),
    });
  const startThread = () => {
    if (startRef !== null) void handleNewThread(startRef);
  };
  const openTile = (index: number) => {
    const thread = group === null ? null : threadAt(group, index);
    if (thread) openThread(thread);
    else if (tiles[index] === TV_NEW_THREAD_TILE) startThread();
  };
  const swapThread = (delta: 1 | -1) => {
    if (group === null) return false;
    const current = group.threads.findIndex((thread) => tvThreadTileKey(thread) === routeThreadKey);
    const next = group.threads[current + delta];
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
        moveGroup(-1);
        return true;
      case "ArrowDown":
        moveGroup(1);
        return true;
      case "Enter":
        openTile(focusIndex);
        return true;
      case "g":
      case "G":
        switchGrouping();
        return true;
      case "p":
      case "P":
        startFx("pin");
        return true;
      case "s":
      case "S":
        startFx("settle");
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
  // In a thread the corner names its project; on the hub it names the ring.
  const groupProject = group?.ref ? (projectByKey.get(group.key) ?? null) : null;
  const startProject =
    startRef === null ? null : (projectByKey.get(scopedProjectKey(startRef)) ?? null);
  const whereProject = onHub ? groupProject : (routeProject ?? startProject);
  const whereTitle = onHub ? (group?.title ?? "T3 Code") : (whereProject?.title ?? "T3 Code");
  const position =
    group === null
      ? null
      : `${grouping === "status" ? "Status" : "Project"} ${groupIndex + 1} of ${hub.length}`;
  const above = hub[groupIndex - 1];
  const below = hub[groupIndex + 1];

  return (
    <div data-tv="stage" data-hints={hints ? "" : undefined}>
      <div data-tv="hud" data-edge="top">
        {onHub ? (
          <div data-tv="where">
            {above ? (
              <button type="button" data-tv="where-step" onClick={() => moveGroup(-1)}>
                ▲ <ProjectName project={projectByKey.get(above.key) ?? null} title={above.title} />
              </button>
            ) : null}
            <b>
              <ProjectName project={whereProject} title={whereTitle} />
            </b>
            {below ? (
              <button type="button" data-tv="where-step" onClick={() => moveGroup(1)}>
                ▼ <ProjectName project={projectByKey.get(below.key) ?? null} title={below.title} />
              </button>
            ) : (
              <span>{position}</span>
            )}
          </div>
        ) : (
          <button type="button" data-tv="where" onClick={toHub} aria-label="Back to the hub">
            <b>
              <ProjectName project={whereProject} title={whereTitle} />
            </b>
            <span>{routeThread?.branch ?? "Back to the hub"}</span>
          </button>
        )}
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
        {/* Every ring is stacked in one column; only the current one and its neighbours mount. */}
        {hub.map((entry, row) => {
          const offset = row - groupIndex;
          if (Math.abs(offset) > 1) return null;
          const rowFocus = focusOf(entry);
          const entryProject = entry.ref ? (projectByKey.get(entry.key) ?? null) : null;
          return (
            <div
              key={entry.key}
              data-tv="ring-row"
              data-tv-move=""
              inert={offset !== 0}
              style={{ transform: `translateY(${offset * RING_ROW_GAP_VW}vw)` }}
            >
              {entry.tiles.map((tile, index) => {
                const slot = tvRingSlot(index - rowFocus);
                if (slot === null) return null;
                const thread = threadAt(entry, index);
                const focused = offset === 0 && index === rowFocus;
                const cardFx = fx?.key === tile ? fx.kind : undefined;
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
                      data-fx={cardFx}
                      data-arrived={seen.fresh.includes(tile) ? "" : undefined}
                      tabIndex={focused ? 0 : -1}
                      onClick={() => (focused ? openTile(index) : moveFocus(index - rowFocus))}
                      onAnimationEnd={(event) => {
                        if (cardFx !== undefined && event.animationName.startsWith("tv-fx-")) {
                          void finishFx();
                        }
                      }}
                    >
                      <TvWindow>
                        {thread ? (
                          <>
                            <span data-tv="card-project">
                              <ProjectName
                                project={projectOf(thread)}
                                title={projectOf(thread)?.title ?? "Project"}
                              />
                            </span>
                            <span data-tv="pip" data-status={tvThreadStatus(thread)}>
                              {STATUS_LABEL[tvThreadStatus(thread)]}
                            </span>
                            <span data-tv="card-title">{thread.title}</span>
                            <span data-tv="card-meta">
                              {thread.pinnedAt === null ? null : <b>Pinned</b>}
                              {thread.branch ? <span>{thread.branch}</span> : null}
                              <span>{thread.modelSelection.model}</span>
                              <span>{formatRelativeTimeLabel(thread.updatedAt, nowMs)}</span>
                            </span>
                          </>
                        ) : (
                          <>
                            <span data-tv="card-project">
                              <ProjectName project={entryProject} title={entry.title} />
                            </span>
                            <span data-tv="pip" data-status="new">
                              New thread
                            </span>
                            <span data-tv="card-title">Start a thread here</span>
                            <span data-tv="card-meta">
                              <span>Speak or type the prompt next</span>
                            </span>
                          </>
                        )}
                      </TvWindow>
                    </button>
                  </div>
                );
              })}
            </div>
          );
        })}
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
        data-spawn={routeTarget?.kind === "draft" ? "" : undefined}
        style={
          ringInFront
            ? { transform: "translateZ(-40vw) rotateX(18deg)", opacity: 0, pointerEvents: "none" }
            : activeRail?.open
              ? { transform: "translateZ(-45vw)", opacity: 0.35 }
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
            ? undefined
            : {
                transform: "translateY(18vw) translateZ(-60vw) rotateX(-35deg)",
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
                <Hint keys="↑ ↓">{grouping === "status" ? "Statuses" : "Projects"}</Hint>
                <Hint keys="Enter">Open</Hint>
                <Hint keys="G">{grouping === "status" ? "By project" : "By status"}</Hint>
                <Hint keys="N">New thread</Hint>
                <Hint keys="P">Pin</Hint>
                <Hint keys="S">Settle</Hint>
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

/** A project's name with its icon; a status ring has a name and no project. */
function ProjectName({
  project,
  title,
}: {
  readonly project: EnvironmentProject | null;
  readonly title: string;
}) {
  return (
    <span data-tv="project-name">
      {project === null ? null : <ProjectFavicon project={project} className="size-[1em]" />}
      <span>{title}</span>
    </span>
  );
}
