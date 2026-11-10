import { createFileRoute } from "@tanstack/react-router";

import { TvLobby } from "../components/tv/TvLobby";
import { setTvModeEnabled } from "../tvMode";

export const Route = createFileRoute("/_chat/tv")({
  // Opening the lobby is how a device enters TV mode; it stays on until the user exits it.
  onEnter: () => setTvModeEnabled(true),
  component: TvLobby,
});
