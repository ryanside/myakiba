import { isTag } from "domhandler";
import type { ChildNode } from "domhandler";
import { DomHandler, Parser } from "htmlparser2";

/**
 * Sizes no real MFC Item page reaches, so a page past one was built to slow the parser down and is
 * rejected as too_large. The captured 98777 page has 1,123 nodes, nests 18 elements deep, 5 inside
 * a data field, and its widest element has 46 element children. The page the extension sends keeps
 * only what the parser reads: 143 nodes, 18 deep, 9 wide. The page has 9 data fields, 7 entries,
 * 1 release, a 64-character title, an 18-character entry name and no warnings. Each limit sits far
 * above what a real page shows. Every release past the first is a data field of its own, so
 * dataFields leaves room for every release and every labelled field. entryNameLength also keeps a
 * name inside Postgres's 2704-byte btree row limit, which `entry_name_category_idx` enforces.
 *
 * depth, children and nodes bound the tree before cheerio sees it. A cheerio find runs domutils'
 * removeSubsets over the element children of the element it searches from, which costs
 * children² × depth, and the nodes limit bounds how many such elements a page can hold.
 */
export const PAGE_LIMITS = {
  depth: 64,
  children: 512,
  nodes: 10_000,
  fieldDepth: 32,
  dataFields: 300,
  entries: 1000,
  releases: 200,
  titleLength: 2000,
  entryNameLength: 500,
  warnings: 100,
} as const;

export type PageLimit = keyof typeof PAGE_LIMITS;

class BoundedTree extends DomHandler {
  /** The element children of each open element, the document's first. */
  readonly #elementChildren = [0];
  #nodes = 0;
  exceeded: PageLimit | null = null;
  pausable: Parser | null = null;

  override onopentag(name: string, attribs: Record<string, string>): void {
    super.onopentag(name, attribs);
    this.#elementChildren.push(0);
    if (this.#elementChildren.length - 1 > PAGE_LIMITS.depth) this.#stop("depth");
  }

  override onclosetag(): void {
    super.onclosetag();
    this.#elementChildren.pop();
  }

  protected override addNode(node: ChildNode): void {
    super.addNode(node);
    this.#nodes += 1;
    if (this.#nodes > PAGE_LIMITS.nodes) this.#stop("nodes");
    if (!isTag(node)) return;
    const parent = this.#elementChildren.length - 1;
    const children = (this.#elementChildren[parent] ?? 0) + 1;
    this.#elementChildren[parent] = children;
    if (children > PAGE_LIMITS.children) this.#stop("children");
  }

  #stop(limit: PageLimit): void {
    this.exceeded ??= limit;
    this.pausable?.pause();
  }
}

/** Parses with htmlparser2 and stops at the first node past the depth, children or nodes limit. */
export function parseBoundedDocument(
  html: string,
): { readonly root: DomHandler["root"] } | { readonly exceeded: PageLimit } {
  const tree = new BoundedTree();
  const parser = new Parser(tree);
  tree.pausable = parser;
  parser.end(html);
  return tree.exceeded ? { exceeded: tree.exceeded } : { root: tree.root };
}

const CLIPPED_LENGTH = 100;

export function clippedQuote(value: string): string {
  return `"${value.length > CLIPPED_LENGTH ? `${value.slice(0, CLIPPED_LENGTH)}…` : value}"`;
}
