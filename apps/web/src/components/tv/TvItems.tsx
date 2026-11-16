import type { EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";
import { lazy, Suspense } from "react";

import { resolveMarkdownFileLinkMeta } from "../../markdown-links";
import { isTvPdfHref, labelTvItems, type TvItemKind } from "./tvItems.logic";
import { TvWindow } from "./TvWindow";

const TvPdfItem = lazy(() => import("./TvPdfItem"));

const MIN_IMAGE_PX = 96;

export interface TvItem {
  readonly key: string;
  readonly kind: TvItemKind;
  readonly label: string;
  readonly detail: string;
  readonly element: HTMLElement;
}

/**
 * The tables, images and PDF links rendered in the open thread, in reading order. The timeline
 * only mounts rows near the viewport, so this is what is on screen, not the whole history.
 */
export function collectTvItems(root: ParentNode): TvItem[] {
  const found: Array<{
    kind: TvItemKind;
    name: string | null;
    detail: string;
    element: HTMLElement;
  }> = [];
  for (const element of root.querySelectorAll<HTMLElement>(
    ".chat-markdown table, img, .chat-markdown a[href]",
  )) {
    if (element.closest('[contenteditable="true"]')) continue;
    if (element instanceof HTMLTableElement) {
      const columns = element.rows[0]?.cells.length ?? 0;
      found.push({
        kind: "table",
        name: null,
        detail: `${Math.max(0, element.rows.length - 1)} rows, ${columns} columns`,
        element,
      });
    } else if (element instanceof HTMLImageElement) {
      if (element.naturalWidth < MIN_IMAGE_PX || element.naturalHeight < MIN_IMAGE_PX) continue;
      found.push({
        kind: "image",
        name: element.alt,
        detail: `${element.naturalWidth} × ${element.naturalHeight}`,
        element,
      });
    } else {
      const href = element.getAttribute("href");
      if (!isTvPdfHref(href)) continue;
      found.push({ kind: "pdf", name: element.textContent, detail: "PDF", element });
    }
  }
  const labels = labelTvItems(found);
  return found.map((item, index) => ({
    key: `${item.kind}:${index}`,
    kind: item.kind,
    label: labels[index] ?? item.kind,
    detail: item.detail,
    element: item.element,
  }));
}

export function TvItemRail({
  items,
  index,
  onPick,
}: {
  readonly items: ReadonlyArray<TvItem>;
  readonly index: number;
  readonly onPick: (index: number) => void;
}) {
  return (
    <div data-tv="rail">
      <TvWindow title="On screen">
        <ul>
          {items.map((item, position) => (
            <li key={item.key}>
              <button
                type="button"
                data-tv="rail-item"
                data-focused={position === index ? "" : undefined}
                onClick={() => onPick(position)}
              >
                <span>{item.label}</span>
                <small>{item.detail}</small>
              </button>
            </li>
          ))}
        </ul>
      </TvWindow>
    </div>
  );
}

export interface TvItemThread {
  readonly environmentId: EnvironmentId;
  readonly threadRef: ScopedThreadRef;
  readonly cwd: string;
  readonly workspaceRoot: string;
}

/** One item at reading size. Tables are copied from the timeline so they keep its rendering. */
export function TvItemBody({
  item,
  thread,
}: {
  readonly item: TvItem;
  readonly thread: TvItemThread | null;
}) {
  if (item.kind === "image" && item.element instanceof HTMLImageElement) {
    return (
      <div data-tv="item-scroll">
        <img data-tv="item-image" src={item.element.currentSrc} alt={item.element.alt} />
      </div>
    );
  }
  if (item.kind === "table") {
    return (
      <div
        data-tv="item-scroll"
        className="chat-markdown"
        ref={(node) => {
          node?.replaceChildren(item.element.cloneNode(true));
        }}
      />
    );
  }
  const meta =
    thread === null
      ? null
      : resolveMarkdownFileLinkMeta(item.element.getAttribute("href") ?? undefined, thread.cwd);
  if (thread === null || meta === null) {
    return <p data-tv="item-note">This PDF cannot be opened here.</p>;
  }
  return (
    <Suspense fallback={<p data-tv="item-note">Opening {item.label}…</p>}>
      <TvPdfItem
        environmentId={thread.environmentId}
        threadRef={thread.threadRef}
        absolutePath={meta.targetPath}
        workspaceRoot={thread.workspaceRoot}
        title={item.label}
      />
    </Suspense>
  );
}
