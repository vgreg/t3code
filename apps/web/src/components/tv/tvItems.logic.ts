export type TvItemKind = "table" | "image" | "pdf";

const PDF_HREF = /\.pdf(?:[?#:].*)?$/i;

export function isTvPdfHref(href: string | null): href is string {
  return href !== null && PDF_HREF.test(href);
}

/** Names for the item rail: files keep their name, the rest are numbered per kind. */
export function labelTvItems(
  items: ReadonlyArray<{ readonly kind: TvItemKind; readonly name: string | null }>,
): string[] {
  const counts: Record<TvItemKind, number> = { table: 0, image: 0, pdf: 0 };
  return items.map(({ kind, name }) => {
    counts[kind] += 1;
    const trimmed = name?.trim() ?? "";
    if (kind === "pdf") return trimmed === "" ? `PDF ${counts.pdf}` : trimmed;
    const numbered = `${kind === "table" ? "Table" : "Image"} ${counts[kind]}`;
    return trimmed === "" ? numbered : `${numbered}: ${trimmed}`;
  });
}
