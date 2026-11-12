// Measuring: where things are, in stage pixels. Targets and rects for the
// script API, the drawn scale that turns screen pixels into stage pixels,
// and the rect math the stage and script share.

export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; width: number; height: number };
/**
 * A target is the name in an element's data-target (aimed at its center), a
 * named element with x and y as fractions of its box ({ at: 'apply', x: 0.8, y: 0.7 }),
 * or a point in stage pixels.
 */
export type Target =
  | string
  | Point
  | { at: string; x: number; y: number }
  | { wide: Target; compact: Target };

export const EMPTY: Rect = { x: 0, y: 0, width: 0, height: 0 };

const isName = (t: Target): t is string => typeof t === "string";

/** A named element with x and y as fractions of its box. */
export const isAnchor = (t: Target): t is { at: string; x: number; y: number } =>
  typeof t === "object" && "at" in t;

/** One value per layout: `{ wide, compact }`. */
export const isPerLayout = <T>(v: T | { wide: T; compact: T }): v is { wide: T; compact: T } =>
  typeof v === "object" && v !== null && "wide" in v;

export const nameOf = (t: Target) => {
  if (isName(t)) return t;
  return "at" in t ? t.at : null;
};

// Reuse one stage read while measuring a collection of targets. A fresh
// snapshot on each pass still includes parent Camera/Phone transforms.
export function stageSpace(root: HTMLElement, fallback: number) {
  const bounds = root.getBoundingClientRect();
  return {
    left: bounds.left,
    top: bounds.top,
    scale: (root.offsetWidth && bounds.width / root.offsetWidth) || fallback || 1,
    borderX: root.clientLeft,
    borderY: root.clientTop,
  };
}

export function rectOf(
  root: HTMLElement,
  el: HTMLElement,
  fallback: number,
  space = stageSpace(root, fallback),
): Rect {
  const b = el.getBoundingClientRect();
  const { scale } = space;
  // From the inside of the stage's border, where its absolute children are placed
  return {
    x: (b.left - space.left) / scale - space.borderX,
    y: (b.top - space.top) / scale - space.borderY,
    width: b.width / scale,
    height: b.height / scale,
  };
}

// A target's box as rect() hands it to the scene: where it is drawn, but
// without a scale of its own (a button's press, a hover lift). Anything
// placed from it (a popover under a button) would otherwise shift by a
// fraction of a pixel for every press and settle back after
export function targetRectOf(
  root: HTMLElement,
  el: HTMLElement,
  fallback: number,
  space = stageSpace(root, fallback),
): Rect {
  const r = rectOf(root, el, fallback, space);
  const style = getComputedStyle(el);
  const t = style.transform;
  const values = t && t !== "none" ? /^matrix\(([^)]+)\)$/.exec(t)?.[1] : undefined;
  if (!values) return r;
  const [a, b, c, d, e, f] = values.split(",").map(Number);
  if (b || c || e || f || !a || !d) return r;
  // Unscaled from the drawn box, not offsetWidth, which rounds to whole pixels
  const w = r.width / a;
  const h = r.height / d;
  const [ox = 0, oy = 0] = style.transformOrigin.split(" ").map((v) => Number.parseFloat(v));
  return { x: r.x - ox * (1 - a), y: r.y - oy * (1 - d), width: w, height: h };
}

// The untransformed layout box: offsets up to the stage, ignoring any scale
// or slide an element is part way through. When nothing between the element
// and the stage is transformed, the drawn box is the layout box, measured
// exactly; offsets round to whole pixels. Otherwise it walks the offsets. An
// offset is measured from the inside of its parent's border and before its
// scroll, so each parent's border is added and its scroll taken off on the way
// up: without that, an element in a bordered box measured a pixel up and left,
// and whatever landed on it (a flyer) jumped that pixel on the handoff.
const transformed = (n: Element) => {
  const c = getComputedStyle(n);
  return (
    c.transform !== "none" ||
    (c.translate && c.translate !== "none") ||
    (c.scale && c.scale !== "none") ||
    (c.rotate && c.rotate !== "none")
  );
};
export function layoutRectOf(root: HTMLElement, el: HTMLElement): Rect {
  let still = true;
  for (let a: Element | null = el; a && a !== root; a = a.parentElement)
    if (transformed(a)) {
      still = false;
      break;
    }
  if (still) return rectOf(root, el, 1);
  let x = 0;
  let y = 0;
  let n: HTMLElement | null = el;
  while (n && n !== root) {
    x += n.offsetLeft;
    y += n.offsetTop;
    const parent: Element | null = n.offsetParent;
    if (!parent || !root.contains(parent)) break;
    n = parent as HTMLElement;
    if (n !== root) {
      x += n.clientLeft - n.scrollLeft;
      y += n.clientTop - n.scrollTop;
    }
  }
  return { x, y, width: el.offsetWidth, height: el.offsetHeight };
}

export function sameRects(a: Record<string, Rect>, b: Record<string, Rect>) {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => {
    const x = a[k];
    const y = b[k];
    return (
      x &&
      y &&
      Math.abs(x.x - y.x) < 0.5 &&
      Math.abs(x.y - y.y) < 0.5 &&
      Math.abs(x.width - y.width) < 0.5 &&
      Math.abs(x.height - y.height) < 0.5
    );
  });
}
