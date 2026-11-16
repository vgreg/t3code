import { describe, expect, it } from "vite-plus/test";

import { isTvPdfHref, labelTvItems } from "./tvItems.logic";

describe("labelTvItems", () => {
  it("numbers tables and images separately and keeps file names", () => {
    expect(
      labelTvItems([
        { kind: "table", name: null },
        { kind: "image", name: "Cumulative returns" },
        { kind: "pdf", name: "report.pdf" },
        { kind: "table", name: "  " },
        { kind: "pdf", name: null },
      ]),
    ).toEqual(["Table 1", "Image 1: Cumulative returns", "report.pdf", "Table 2", "PDF 2"]);
  });
});

describe("isTvPdfHref", () => {
  it.each([
    ["out/report.pdf", true],
    ["out/Report.PDF#page=3", true],
    ["out/report.pdf:12", true],
    ["out/report.pdf.txt", false],
    [null, false],
  ])("%s is a PDF link: %s", (href, expected) => {
    expect(isTvPdfHref(href)).toBe(expected);
  });
});
