import * as Schema from "effect/Schema";
import { useSyncExternalStore } from "react";

import { getLocalStorageItem, setLocalStorageItem } from "./hooks/useLocalStorage";

const TV_SCALES = [1, 1.25, 1.5, 1.75, 2, 2.5] as const;
const DEFAULT_TV_SCALE = 1.5;
const TV_MODE_STORAGE_KEY = "t3code:tv-mode:v1";

const TvModeStateSchema = Schema.Struct({
  enabled: Schema.Boolean,
  scale: Schema.Finite,
});
export type TvModeState = typeof TvModeStateSchema.Type;

function readStoredState(): TvModeState {
  try {
    return (
      getLocalStorageItem(TV_MODE_STORAGE_KEY, TvModeStateSchema) ?? {
        enabled: false,
        scale: DEFAULT_TV_SCALE,
      }
    );
  } catch (error) {
    console.error("Could not read TV mode state.", error);
    return { enabled: false, scale: DEFAULT_TV_SCALE };
  }
}

let state: TvModeState | null = null;
const listeners = new Set<() => void>();

function currentState(): TvModeState {
  if (state === null) {
    state = readStoredState();
    applyToDocument(state);
  }
  return state;
}

// Tailwind sizes in rem, so scaling the root font size scales the whole UI without zoom's layout bugs.
function applyToDocument(next: TvModeState) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (next.enabled) {
    root.dataset.tvMode = "";
    root.style.fontSize = `${next.scale * 100}%`;
  } else {
    delete root.dataset.tvMode;
    root.style.removeProperty("font-size");
  }
}

function setState(next: TvModeState) {
  state = next;
  applyToDocument(next);
  try {
    setLocalStorageItem(TV_MODE_STORAGE_KEY, next, TvModeStateSchema);
  } catch (error) {
    console.error("Could not save TV mode state.", error);
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTvMode(): TvModeState {
  return useSyncExternalStore(subscribe, currentState);
}

export function setTvModeEnabled(enabled: boolean) {
  const current = currentState();
  if (current.enabled !== enabled) setState({ ...current, enabled });
}

export function stepTvScale(direction: 1 | -1) {
  const current = currentState();
  const index = TV_SCALES.findIndex((scale) => scale >= current.scale);
  const from = index === -1 ? TV_SCALES.length - 1 : index;
  const to = Math.max(0, Math.min(TV_SCALES.length - 1, from + direction));
  setState({ ...current, scale: TV_SCALES[to] ?? DEFAULT_TV_SCALE });
}

export function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen().catch(() => undefined);
}
