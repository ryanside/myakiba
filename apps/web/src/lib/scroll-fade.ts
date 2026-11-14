/**
 * shadcn's `scroll-fade` utilities shrink an edge's fade with a scroll-driven animation as the
 * scroll nears that edge. A browser without scroll timelines, such as Firefox, takes their
 * fallback, which keeps every fade at full size: at the end of a scroll, and when nothing scrolls.
 * There this sets each edge's fade from the scroll position, as the animation would.
 */
const FADING = '[class*="scroll-fade"]';

/** shadcn's default `--scroll-fade-reveal`, `calc(var(--spacing) * 24)`: the scroll over which a fade grows. */
const REVEAL_PX = 96;

function hiddenPast(element: HTMLElement) {
  const { scrollTop, scrollLeft, scrollHeight, scrollWidth, clientHeight, clientWidth } = element;
  return {
    t: scrollTop,
    b: scrollHeight - clientHeight - scrollTop,
    s: scrollLeft,
    e: scrollWidth - clientWidth - scrollLeft,
  };
}

function fadeEdges(element: HTMLElement): void {
  for (const [edge, hidden] of Object.entries(hiddenPast(element))) {
    const property = `--scroll-fade-${edge}`;
    if (hidden >= REVEAL_PX) {
      element.style.removeProperty(property);
    } else if (hidden < 1) {
      element.style.setProperty(property, "0px");
    } else {
      element.style.setProperty(
        property,
        `calc(var(--_scroll-fade-size-${edge}) * ${hidden / REVEAL_PX})`,
      );
    }
  }
}

function fadingList(target: EventTarget | null): HTMLElement | null {
  const list = target instanceof Element ? target.closest(FADING) : null;
  return list instanceof HTMLElement ? list : null;
}

export function startScrollFadeFallback(): () => void {
  if (CSS.supports("animation-timeline: scroll()")) return () => {};

  // A list's content can grow or shrink inside a box whose size stays put, so its children are
  // watched too.
  const resized = new ResizeObserver((entries) => {
    for (const { target } of entries) {
      const list = fadingList(target);
      if (list) fadeEdges(list);
    }
  });
  let frame = 0;
  const track = () => {
    frame = 0;
    resized.disconnect();
    for (const list of document.querySelectorAll(FADING)) {
      if (!(list instanceof HTMLElement)) continue;
      resized.observe(list);
      for (const child of list.children) resized.observe(child);
      fadeEdges(list);
    }
  };
  const changed = new MutationObserver(() => {
    frame ||= requestAnimationFrame(track);
  });
  const scrolled = (event: Event) => {
    if (event.target instanceof HTMLElement && event.target.matches(FADING)) {
      fadeEdges(event.target);
    }
  };

  changed.observe(document.body, {
    childList: true,
    subtree: true,
    attributeFilter: ["class"],
  });
  document.addEventListener("scroll", scrolled, { capture: true, passive: true });
  track();

  return () => {
    cancelAnimationFrame(frame);
    changed.disconnect();
    resized.disconnect();
    document.removeEventListener("scroll", scrolled, { capture: true });
  };
}
