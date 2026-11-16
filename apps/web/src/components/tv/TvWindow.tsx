import type { ReactNode } from "react";

/** The game-window frame every TV surface sits in. Layout comes from the parent. */
export function TvWindow({
  title,
  children,
}: {
  readonly title?: string | null;
  readonly children: ReactNode;
}) {
  return (
    <div data-tv="win">
      <div data-tv="win-shadow" />
      <div data-tv="win-rim" />
      {title ? (
        <div data-tv="win-plate">
          <span>{title}</span>
        </div>
      ) : null}
      <div data-tv="win-body">{children}</div>
    </div>
  );
}
