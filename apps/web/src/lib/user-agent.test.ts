import { expect, test } from "bun:test";
import { describeUserAgent, deviceName } from "./user-agent";

const name = (userAgent: string | null) => deviceName(describeUserAgent(userAgent));

test.each([
  [
    "Chrome on macOS",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  ],
  [
    "Edge on Windows",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
  ],
  [
    "Safari on iOS",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  ],
  ["Firefox on Linux", "Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0"],
  [
    "Chrome on Android",
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
  ],
])("names %s", (expected, userAgent) => {
  expect(name(userAgent)).toBe(expected);
});

test("a phone, a tablet and a computer get their own kind", () => {
  expect(describeUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Mobile Safari").kind).toBe(
    "phone",
  );
  expect(describeUserAgent("Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)").kind).toBe("tablet");
  expect(describeUserAgent("Mozilla/5.0 (Linux; Android 14; SM-X710) Chrome/130").kind).toBe(
    "tablet",
  );
  expect(describeUserAgent("Mozilla/5.0 (Windows NT 10.0) Firefox/131.0").kind).toBe("desktop");
});

test("a missing or unknown user agent still gets a name", () => {
  expect(name(null)).toBe("Unknown device");
  expect(name("curl/8.7.1")).toBe("Unknown device");
});
