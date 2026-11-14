import { afterEach, expect, test } from "bun:test";
import { startScrollFadeFallback } from "@/lib/scroll-fade";

let stop = () => {};
const browserCss = Object.getOwnPropertyDescriptor(globalThis, "CSS") ?? { value: CSS };

/** Starts the fallback in a browser whose CSS answers `supported` for scroll timelines. */
function startIn(supported: boolean) {
  Object.defineProperty(globalThis, "CSS", {
    configurable: true,
    value: { supports: () => supported },
  });
  stop = startScrollFadeFallback();
}

afterEach(() => {
  stop();
  Object.defineProperty(globalThis, "CSS", browserCss);
  document.body.replaceChildren();
});

/** A list as a browser lays it out: `content` tall inside a `height` box. */
function list(content: number, height: number): HTMLDivElement {
  const element = document.createElement("div");
  element.className = "max-h-40 overflow-y-auto scroll-fade-b";
  Object.defineProperty(element, "scrollHeight", { get: () => content });
  Object.defineProperty(element, "clientHeight", { get: () => height });
  return element;
}

const footFade = (element: HTMLElement) =>
  getComputedStyle(element).getPropertyValue("--scroll-fade-b");

/** The frame after the one a DOM change asks for, when the fallback has caught up. */
const settled = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });

test("a list with nothing to scroll has no foot fade", () => {
  const short = list(96, 96);
  document.body.append(short);
  startIn(false);
  expect(footFade(short)).toBe("0px");
});

test("a list scrolled to its end has no foot fade", () => {
  const long = list(400, 160);
  document.body.append(long);
  startIn(false);
  expect(footFade(long)).toBe("");
  long.scrollTop = 240;
  long.dispatchEvent(new Event("scroll"));
  expect(footFade(long)).toBe("0px");
});

test("a list that opens later, as a menu does, has no foot fade when it has nothing to scroll", async () => {
  startIn(false);
  const menu = list(120, 120);
  document.body.append(menu);
  await settled();
  expect(footFade(menu)).toBe("0px");
});

test("a browser with scroll timelines keeps its own fade", () => {
  const short = list(96, 96);
  document.body.append(short);
  startIn(true);
  expect(footFade(short)).toBe("");
});
