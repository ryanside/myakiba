import { describe, expect, test } from "bun:test";
import { storedBytes } from "./stored-bytes";

const utf8 = (text: string) => new TextEncoder().encode(text).byteLength;

/** Each case's expected size is the length of what Chromium's JSONWriter writes, which Chrome 156 measured the same. */
describe("an item's stored size", () => {
  test("is its key's UTF-8 plus its value's JSON", () => {
    expect(storedBytes("ké", "é€😀")).toBe(utf8('ké"é€😀"'));
  });

  test("counts `<` as its six-byte escape", () => {
    expect(storedBytes("k", "<p>")).toBe('k"\\u003Cp>"'.length);
  });

  test("counts line and paragraph separators as their six-byte escapes", () => {
    expect(storedBytes("k", "\u2028\u2029")).toBe('k"\\u2028\\u2029"'.length);
  });

  test("counts control characters as their escapes", () => {
    expect(storedBytes("k", "\u0000\u001F\b\f\n\r\t")).toBe(
      'k"\\u0000\\u001F\\b\\f\\n\\r\\t"'.length,
    );
    expect(storedBytes("k", '"\\/\u007F')).toBe('k"\\"\\\\/\u007F"'.length);
  });

  test("counts a lone surrogate as the replacement character it becomes", () => {
    expect(storedBytes("k", "\uD800")).toBe(utf8('k"\uFFFD"'));
    expect(storedBytes("k", "\\uD800")).toBe('k"\\\\uD800"'.length);
  });

  test("counts a number outside int32 as the double Chromium writes", () => {
    expect(storedBytes("k", 2_147_483_647)).toBe("k2147483647".length);
    expect(storedBytes("k", 2_147_483_648)).toBe("k2147483648.0".length);
    expect(storedBytes("k", 1_730_000_000_123)).toBe("k1.730000000123e+12".length);
    expect(storedBytes("k", 1e12)).toBe("k1e+12".length);
    expect(storedBytes("k", 3.5)).toBe("k3.5".length);
    expect(storedBytes("k", 1e-7)).toBe("k1e-7".length);
    expect(storedBytes("k", -0)).toBe("k0".length);
  });

  test("leaves out object fields that are undefined, as the browser does", () => {
    expect(storedBytes("k", { a: undefined, b: [1, null, true, {}, []] })).toBe(
      'k{"b":[1,null,true,{},[]]}'.length,
    );
  });
});
