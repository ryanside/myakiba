import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  mock,
  spyOn,
  test,
} from "bun:test";
import { act, cleanup, render } from "@testing-library/react";
import { AddSentence } from "./add-sentence";

let deviceReduces = false;
const matchMedia = window.matchMedia.bind(window);
spyOn(window, "matchMedia").mockImplementation((query) => {
  const mediaQuery = matchMedia(query);
  Object.defineProperty(mediaQuery, "matches", {
    get: () => deviceReduces && query.includes("prefers-reduced-motion"),
  });
  return mediaQuery;
});

Object.defineProperty(document, "fonts", {
  configurable: true,
  value: { status: "loaded", ready: Promise.resolve() },
});

const realIntersectionObserver = globalThis.IntersectionObserver;
let setOnScreen: (isIntersecting: boolean) => void = () => {};
class OnScreen extends realIntersectionObserver {
  readonly #onChange: IntersectionObserverCallback;
  constructor(onChange: IntersectionObserverCallback) {
    super(onChange);
    this.#onChange = onChange;
  }
  override observe(target: Element) {
    setOnScreen = (isIntersecting) => {
      this.#onChange([{ isIntersecting, target } as IntersectionObserverEntry], this);
    };
    setOnScreen(true);
  }
}

beforeEach(() => {
  deviceReduces = false;
  globalThis.IntersectionObserver = OnScreen;
  jest.useFakeTimers();
});
afterEach(() => {
  cleanup();
  jest.useRealTimers();
  globalThis.IntersectionObserver = realIntersectionObserver;
});
afterAll(() => {
  mock.restore();
  Reflect.deleteProperty(document, "fonts");
});

async function renderSentence() {
  const { container } = render(<AddSentence />);
  await act(async () => {
    await document.fonts.ready;
  });
  const sentence = () => {
    const root = container.querySelector<HTMLElement>("[data-phase]");
    const destination = container.querySelector<HTMLElement>("[data-destination]");
    return {
      phase: root?.dataset.phase,
      pick: container.querySelector("[data-figure][data-current]")?.textContent,
      flyers: container.querySelectorAll("[data-flyer]").length,
      caught: destination?.dataset.caught !== undefined,
    };
  };
  const wait = (ms: number) => {
    act(() => {
      jest.advanceTimersByTime(ms);
    });
  };
  return { sentence, wait };
}

describe("AddSentence", () => {
  test("throws each figure of a pick into its destination, catches it, then shows the next pick", async () => {
    const { sentence, wait } = await renderSentence();
    expect(sentence()).toEqual({ phase: "shown", pick: "an artbook", flyers: 0, caught: false });

    wait(1299);
    expect(sentence().phase).toBe("shown");
    wait(1);
    expect(sentence()).toEqual({ phase: "thrown", pick: "an artbook", flyers: 1, caught: false });

    wait(590);
    expect(sentence()).toEqual({ phase: "caught", pick: "an artbook", flyers: 1, caught: true });

    wait(1500);
    expect(sentence()).toEqual({ phase: "shown", pick: "3 figures", flyers: 0, caught: false });

    wait(1100);
    expect(sentence()).toEqual({ phase: "thrown", pick: "3 figures", flyers: 3, caught: false });
  });

  test("lands a throw's catch with its flight when the sentence scrolls away mid-throw", async () => {
    const { sentence, wait } = await renderSentence();
    wait(1300);
    expect(sentence().phase).toBe("thrown");

    act(() => setOnScreen(false));
    wait(590);
    expect(sentence()).toEqual({ phase: "caught", pick: "an artbook", flyers: 1, caught: true });
    wait(5000);
    expect(sentence().phase).toBe("caught");

    act(() => setOnScreen(true));
    wait(1500);
    expect(sentence()).toEqual({ phase: "shown", pick: "3 figures", flyers: 0, caught: false });
  });

  test("holds the first pick still when motion is reduced", async () => {
    deviceReduces = true;
    const { sentence, wait } = await renderSentence();
    wait(20_000);
    expect(sentence()).toEqual({ phase: "shown", pick: "an artbook", flyers: 0, caught: false });
  });
});
