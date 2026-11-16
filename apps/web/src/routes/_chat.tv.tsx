import { createFileRoute } from "@tanstack/react-router";

import { setTvModeEnabled } from "../tvMode";

export const Route = createFileRoute("/_chat/tv")({
  // Opening the hub is how a device enters TV mode; it stays on until the user exits it. The
  // hub itself is drawn by TvShell, behind whatever page is open.
  onEnter: () => setTvModeEnabled(true),
  component: () => null,
});
