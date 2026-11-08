import path from "node:path";
import { mfcItemId } from "../src/page";
import type { MfcItemId } from "../src/page";

export function fixture(name: string): Promise<string> {
  return Bun.file(path.join(import.meta.dir, "../fixtures", name)).text();
}

export function itemId(value: number): MfcItemId {
  const id = mfcItemId(value);
  if (id === null) throw new Error(`${value} is not an MFC item id`);
  return id;
}

export function edit(html: string, from: string, to: string): string {
  if (!html.includes(from)) throw new Error(`fixture has no ${from}`);
  return html.replace(from, to);
}
