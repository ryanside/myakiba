export type Stored =
  | string
  | number
  | boolean
  | null
  | readonly Stored[]
  | { readonly [key: string]: Stored | undefined };

const encoder = new TextEncoder();

/** A lone surrogate's escape, every other escape whole so an escaped backslash is never misread, `<`, U+2028, U+2029. */
const REWRITTEN = /\\u[dD][89a-fA-F][\dA-Fa-f]{2}|\\.|[<\u2028\u2029]/g;

/**
 * The bytes Chrome's `storage.local` quota counts for an item: the key's UTF-8 plus the value as Chromium's JSONWriter
 * writes it, counted as JSON.stringify's output and the bytes where the two differ. Per base/json/string_escape.cc,
 * Chromium writes `<`, U+2028 and U+2029 as `\uXXXX`, and a lone surrogate as U+FFFD, not as its escape. Per
 * base/json/json_writer.cc, a number outside int32 is a double, written shortest in decimal from 1e-6 up to 1e12 and
 * in exponent form outside that, with `.0` when neither shows. Firefox counts less, so this only over-counts there.
 */
export function storedBytes(key: string, value: Stored): number {
  let difference = 0;
  const json = JSON.stringify(value, (_key, item: Stored) => {
    if (Number.isFinite(item)) difference += doubleGrowth(Number(item));
    return item;
  });
  for (const [rewritten] of json.matchAll(REWRITTEN)) difference += escapeGrowth(rewritten);
  return encoder.encode(key).byteLength + encoder.encode(json).byteLength + difference;
}

function escapeGrowth(rewritten: string): number {
  if (rewritten === "<") return "\\u003C".length - 1;
  if (rewritten === "\u2028" || rewritten === "\u2029") return "\\u2028".length - 3;
  // A lone surrogate reaches the browser as U+FFFD, three bytes where its escape is six.
  return rewritten.length === "\\uD800".length ? -3 : 0;
}

const INT32 = 2 ** 31;

function doubleGrowth(value: number): number {
  if (Number.isInteger(value) && value >= -INT32 && value < INT32) return 0;
  const exponent = Number(value.toExponential().split("e")[1]);
  const shortest = exponent >= -6 && exponent < 12 ? String(value) : value.toExponential();
  const written = /[.e]/.test(shortest) ? shortest : `${shortest}.0`;
  return written.length - String(value).length;
}
