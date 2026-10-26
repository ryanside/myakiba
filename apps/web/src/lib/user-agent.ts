export type DeviceKind = "desktop" | "phone" | "tablet";

export type DeviceDescription = {
  readonly browser: string | null;
  readonly system: string | null;
  readonly kind: DeviceKind;
};

// Order matters: Edge and Opera also say Chrome, and Chrome also says Safari.
const BROWSERS: readonly (readonly [string, RegExp])[] = [
  ["Edge", /Edg(?:e|A|iOS)?\//],
  ["Opera", /OPR\/|Opera/],
  ["Samsung Internet", /SamsungBrowser\//],
  ["Firefox", /Firefox\/|FxiOS\//],
  ["Chrome", /Chrome\/|CriOS\//],
  ["Safari", /Version\/[\d.]+.*Safari\//],
];

const SYSTEMS: readonly (readonly [string, RegExp])[] = [
  ["iPadOS", /iPad/],
  ["iOS", /iPhone|iPod/],
  ["Android", /Android/],
  ["ChromeOS", /CrOS/],
  ["Windows", /Windows/],
  ["macOS", /Macintosh|Mac OS X/],
  ["Linux", /Linux/],
];

function firstMatch(table: readonly (readonly [string, RegExp])[], userAgent: string) {
  return table.find(([, pattern]) => pattern.test(userAgent))?.[0] ?? null;
}

function kindOf(userAgent: string): DeviceKind {
  if (/iPad|Tablet/.test(userAgent) || (/Android/.test(userAgent) && !/Mobile/.test(userAgent))) {
    return "tablet";
  }
  return /Mobile|iPhone|iPod/.test(userAgent) ? "phone" : "desktop";
}

export function describeUserAgent(userAgent: string | null | undefined): DeviceDescription {
  if (!userAgent) return { browser: null, system: null, kind: "desktop" };
  return {
    browser: firstMatch(BROWSERS, userAgent),
    system: firstMatch(SYSTEMS, userAgent),
    kind: kindOf(userAgent),
  };
}

export function deviceName({ browser, system }: DeviceDescription): string {
  if (browser && system) return `${browser} on ${system}`;
  return browser ?? system ?? "Unknown device";
}
