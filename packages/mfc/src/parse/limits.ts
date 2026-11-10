import { DomHandler, Parser } from "htmlparser2";

/**
 * Sizes no real MFC Item page reaches, so a page past one was built to slow the parser down and is
 * rejected as too_large. The captured 98777 page nests 18 elements deep, 5 inside a data field, and
 * has 9 data fields, 7 entries, 1 release, a 64-character title, an 18-character entry name and no
 * warnings. Each limit sits far above what a real page shows. Every release past the first is a
 * data field of its own, so dataFields leaves room for every release and every labelled field.
 * entryNameLength also keeps a name inside Postgres's 2704-byte btree row limit, which
 * `entry_name_category_idx` enforces.
 */
export const PAGE_LIMITS = {
  depth: 256,
  fieldDepth: 32,
  dataFields: 300,
  entries: 1000,
  releases: 200,
  titleLength: 2000,
  entryNameLength: 500,
  warnings: 100,
} as const;

export type PageLimit = keyof typeof PAGE_LIMITS;

class DepthLimitedHandler extends DomHandler {
  depth = 0;
  tooDeep = false;
  pausable: Parser | null = null;

  override onopentag(name: string, attribs: Record<string, string>): void {
    super.onopentag(name, attribs);
    this.depth += 1;
    if (this.depth > PAGE_LIMITS.depth) {
      this.tooDeep = true;
      this.pausable?.pause();
    }
  }

  override onclosetag(): void {
    super.onclosetag();
    this.depth -= 1;
  }
}

/** Parses with htmlparser2, which is linear in the page's size only while its open-element stack stays shallow. */
export function parseShallowDocument(html: string): DomHandler["root"] | null {
  const handler = new DepthLimitedHandler();
  const parser = new Parser(handler);
  handler.pausable = parser;
  parser.end(html);
  return handler.tooDeep ? null : handler.root;
}

const CLIPPED_LENGTH = 100;

/** A page value quoted for a warning, cut short so a crafted value cannot flood the logs. */
export function quoted(value: string): string {
  return `"${value.length > CLIPPED_LENGTH ? `${value.slice(0, CLIPPED_LENGTH)}…` : value}"`;
}
