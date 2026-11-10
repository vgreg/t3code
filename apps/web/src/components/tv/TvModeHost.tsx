import { useLocation, useRouter, type AnyRouter } from "@tanstack/react-router";
import { LayoutGridIcon } from "lucide-react";
import { useState } from "react";

import { isEditableFocused } from "../../lib/editableFocus";
import { registerCommands } from "../../shortcuts/dispatcher";
import { isAppModalPage } from "../sidebar/mainAppLocation";
import { Button } from "../ui/button";

const TV_LOBBY_PATH = "/tv";
const OPEN_LAYER_SELECTOR =
  '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]';

function escapeLeavesThread(router: AnyRouter, event: KeyboardEvent) {
  if (event.key !== "Escape" || event.repeat || event.isComposing) return false;
  const { pathname } = router.state.location;
  if (pathname === TV_LOBBY_PATH || isAppModalPage(pathname)) return false;
  return document.querySelector(OPEN_LAYER_SELECTOR) === null;
}

// The composer editor claims every Escape, so a field is left from the capture phase. The blur
// waits a task, letting the editor still handle the key. Once out of a field, Escape returns to
// the lobby only when no other scope used it, so speech-to-text never drops the user mid-prompt.
function registerTvEscapeCommands(router: AnyRouter): () => void {
  const disposers = [
    registerCommands(
      {},
      {
        capture: true,
        onKeyDown: (event) => {
          if (!escapeLeavesThread(router, event)) return false;
          const activeElement = document.activeElement;
          if (isEditableFocused(activeElement) && activeElement instanceof HTMLElement) {
            setTimeout(() => activeElement.blur(), 0);
          }
          return false;
        },
      },
    ),
    registerCommands(
      {},
      {
        observe: (event, consumed) => {
          if (consumed || isEditableFocused() || !escapeLeavesThread(router, event)) return;
          event.preventDefault();
          void router.navigate({ to: TV_LOBBY_PATH });
        },
      },
    ),
  ];
  return () => {
    for (const dispose of disposers) dispose();
  };
}

/** Mounted while TV mode is on: the way back to the lobby from any thread. */
export function TvModeHost() {
  const router = useRouter();
  const pathname = useLocation({ select: (location) => location.pathname });
  const [escapeCommandsRef] = useState(
    () => (node: HTMLDivElement | null) =>
      node === null ? undefined : registerTvEscapeCommands(router),
  );
  return (
    <div ref={escapeCommandsRef} className="fixed top-1/2 left-2 z-50 -translate-y-1/2">
      {pathname === TV_LOBBY_PATH ? null : (
        <Button
          variant="glass"
          size="icon"
          aria-label="Back to lobby (Esc)"
          title="Back to lobby (Esc)"
          onClick={() => void router.navigate({ to: TV_LOBBY_PATH })}
        >
          <LayoutGridIcon />
        </Button>
      )}
    </div>
  );
}
