import { parseMfcItemPage } from "../src/parse";
import { itemId } from "./fixtures";

const html = await Bun.stdin.text();
const started = performance.now();
let outcome: string;
try {
  const parsed = parseMfcItemPage(html, itemId(1));
  outcome = parsed.isOk() ? "parsed" : parsed.error.problem.kind;
} catch (error) {
  outcome = `threw ${error instanceof Error ? error.name : String(error)}`;
}
console.log(JSON.stringify({ ms: performance.now() - started, outcome }));
