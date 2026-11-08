import { afterEach, describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { getCoreRowModel, getExpandedRowModel, useReactTable } from "@tanstack/react-table";
import { RowExpandButton } from "@/components/data-table/row-expand-button";
import { Switch } from "@/components/ui/switch";

afterEach(cleanup);

const src = path.resolve(import.meta.dir, "..");
const css = readFileSync(path.join(src, "index.css"), "utf-8");

function block(opening: string): string | undefined {
  const start = css.indexOf(`${opening} {`);
  return start === -1 ? undefined : css.slice(start, css.indexOf("\n}", start));
}

function tokensIn(opening: string): Map<string, string> {
  return new Map(
    [...(block(opening) ?? "").matchAll(/^\s*(--[\w-]+):\s*([^;]+);/gm)].map((match) => [
      match[1] ?? "",
      match[2]?.trim() ?? "",
    ]),
  );
}

const reduced = tokensIn(":root[data-reduce-motion]");

function movesUnderReducedMotion(element: Element): boolean {
  const classes = [...element.classList];
  if (classes.some((name) => /^(transition|duration)(-|$)/.test(name))) return true;
  return !classes.some((name) => {
    const utility = block(`@utility ${name}`);
    const duration = utility && /transition-duration:\s*([^;]+);/.exec(utility)?.[1];
    if (!duration) return false;
    const tokens = [...duration.matchAll(/var\((--[\w-]+)\)/g)].map((match) => match[1]);
    return tokens.length > 0 && tokens.every((token) => reduced.get(token ?? "") === "0ms");
  });
}

function ExpandableRow() {
  const table = useReactTable({
    data: [{ name: "AmiAmi" }],
    columns: [{ id: "expand" }],
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getRowCanExpand: () => true,
  });
  const [row] = table.getRowModel().rows;
  return row ? <RowExpandButton row={row} /> : null;
}

describe("under Reduce motion, controls snap to their new state", () => {
  test("the switch thumb", () => {
    render(<Switch aria-label="Setting" />);
    const thumb = screen.getByRole("switch").querySelector("[data-slot=switch-thumb]");
    if (!thumb) throw new Error("Missing the switch thumb");
    expect(movesUnderReducedMotion(thumb)).toBe(false);
  });

  test("the row expand chevron", () => {
    render(<ExpandableRow />);
    const chevron = screen.getByRole("button", { name: "Expand row" }).querySelector("svg");
    if (!chevron) throw new Error("Missing the row chevron");
    expect(movesUnderReducedMotion(chevron)).toBe(false);
  });
});

const SCRAPER = /^components\/(sync|settings\/data-transfer)\//;

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return sources(file);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [file] : [];
  });
}

test("a hover nudge moves by the --nudge distance, which Reduce motion sets to nothing", () => {
  const nudges = sources(src)
    .filter((file) => !SCRAPER.test(path.relative(src, file)))
    .flatMap((file) =>
      [
        ...readFileSync(file, "utf-8").matchAll(
          /[^\s"'`]*hover[^\s"'`]*:-?(?:translate|rotate|scale)-[^\s"'`]+/g,
        ),
      ].map((match) => `${path.relative(src, file)}: ${match[0]}`),
    );
  expect(nudges.length).toBeGreaterThan(0);
  expect(nudges.filter((nudge) => !nudge.endsWith("-(--nudge)"))).toEqual([]);
  expect(reduced.get("--nudge")).toBe("0px");
});

/** Tailwind v4 sets these with their own properties, not `transform`. */
const PROPERTY_OF = [
  [/^-?translate-/, "translate"],
  [/^-?scale-/, "scale"],
  [/^-?rotate-/, "rotate"],
  [/^blur/, "filter"],
  [/^opacity-/, "opacity"],
] as const;

const STILL = new Set(["0px", "0%", "0deg", "1"]);

test("an entrance transitions each property it starts from, and Reduce motion keeps it from moving", () => {
  const starts = sources(src)
    .filter((file) => !SCRAPER.test(path.relative(src, file)))
    .flatMap((file) =>
      readFileSync(file, "utf-8")
        .split("\n")
        .flatMap((line) => {
          const transitioned = /transition-\[([^\]]+)\]/.exec(line)?.[1]?.split(",") ?? [];
          return [...line.matchAll(/starting:([^\s"'`]+)/g)].map(([, start = ""]) => ({
            where: `${path.relative(src, file)}: starting:${start}`,
            property: PROPERTY_OF.find(([pattern]) => pattern.test(start))?.[1],
            token: /-\((--[\w-]+)\)$/.exec(start)?.[1],
            transitioned,
          }));
        }),
    );
  expect(starts.length).toBeGreaterThan(0);

  const problems = starts.flatMap(({ where, property, token, transitioned }) => [
    ...(property && transitioned.includes(property) ? [] : [`${where} is not transitioned`]),
    ...(["translate", "scale", "rotate"].includes(property ?? "") &&
    !STILL.has(reduced.get(token ?? "") ?? "")
      ? [`${where} still moves under Reduce motion`]
      : []),
  ]);
  expect(problems).toEqual([]);
});
