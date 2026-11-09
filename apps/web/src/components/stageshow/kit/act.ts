import { flushSync } from "react-dom";
import type { Dispatch, SetStateAction } from "react";
import type { CursorKind } from "./cursor";
import { capsOf } from "./keys";
import type { Keys } from "./keys";
import type { Layout } from "./looks";
import { EMPTY, nameOf, layoutRectOf, rectOf } from "./measure";
import type { Point, Rect, Target } from "./measure";
import { clamp, easeInOutCubic, hash, warn } from "./util";

// The touch dot lingers a beat after a lift, then goes
const fingerGone = (el: HTMLElement | null | undefined) => {
  if (!el) return;
  window.setTimeout(() => delete el.dataset.touching, 240);
};

// The script API: the act a demo's script is handed each run. It drives the
// scene state and the cursor, measures targets, and stops the moment its
// signal aborts (the stage left the screen, or the layout changed).

/** A patch to scene state, or a function of the current state that returns one. */
type Patch<S> = Partial<S> | ((s: S) => Partial<S>);

const isUpdater = <S>(patch: Patch<S>): patch is (s: S) => Partial<S> =>
  typeof patch === "function";

export interface Act<S> {
  /** Merge a patch into scene state. Resolves once it has painted, so rects are fresh. */
  set: (patch: Patch<S>) => Promise<void>;
  /** Like set, without waiting. For per-frame updates inside drag. */
  put: (patch: Patch<S>) => void;
  wait: (ms: number) => Promise<void>;
  /**
   * Where a target is now, in stage pixels. With `layout`, where it sits in
   * the layout, ignoring transforms: use that to aim at something that is
   * still scaling or sliding in.
   */
  rect: (name: string, opts?: { layout?: boolean }) => Rect;
  /**
   * Move the cursor in a hand-like arc. Hovering a target marks it data-hover.
   * `path` sets the route in stage coordinates (eased 0 to 1 progress, the
   * same contract as drag's) instead of the shallow arc: a hand running
   * along a chart line. `onMove(at, from, t)` gets each point on the way, as drag's does, for anything
   * that follows the pointer (a scrubbed day, a hover readout).
   */
  move: (
    to: Target,
    opts?: {
      duration?: number;
      path?: (progress: number, from: Point, to: Point) => Point;
      onMove?: (at: Point, from: Point, t: number) => void;
    },
  ) => Promise<void>;
  /**
   * Move (if given a target) and press. `double` presses twice, as a double
   * click does (open a file, select a word). `right` is a secondary click: it
   * looks like any press, so what opens at the pointer (a context menu) is
   * what tells it; pressed elements get data-pressed="right" to tell them apart.
   */
  click: (to?: Target, opts?: { double?: boolean; right?: boolean }) => Promise<void>;
  /**
   * Apply a patch with transitions off, for resets nothing on screen should
   * explain. Pass a target name to switch transitions off only inside it.
   */
  snap: (patch: Patch<S>, scope?: string) => Promise<void>;
  /**
   * Show a keystroke as keycaps: 'cmd+k', 'enter', 'shift+cmd+p'. Resolves
   * as the key comes back up, the moment an app would react; the caps fade
   * on their own.
   */
  key: (combo: string) => Promise<void>;
  /**
   * Start fn for each item, `gap` ms apart (60 by default), and wait for them all. Staggered
   * starts read as organic where a single block reads as mechanical.
   */
  stagger: <T>(
    items: T[],
    fn: (item: T, i: number) => Promise<void> | void,
    gap?: number,
  ) => Promise<void>;
  /** Name the current beat. Sets data-mark on the stage so a film can start there (film.mjs --at). */
  mark: (name: string) => void;
  /** Type text into a string key of state, one character at a time, `interval` ms apart on average (35 by default). */
  type: (key: keyof S, text: string, opts?: { interval?: number }) => Promise<void>;
  /** Press, hold and move in the same shallow, hand-like arc as move(), reporting each frame. The cursor
   * dips as it presses and closes into the grab hand at the bottom of the dip, and opens on release by itself:
   * don't switch to 'grab' before a drag, a hovering cursor is never a fist.
   * I-beam and crosshair selections keep their kind. Use cursor: 'preserve'
   * when the product keeps its current cursor during a drag, such as an arrow
   * creating a calendar event. This changes the cursor only, not the path.
   * For constrained mechanics, path receives eased progress (0..1) and returns
   * stage coordinates shared by the hand and onMove. Its endpoints must match
   * from and to. Use a circular path for a dial, or a straight path for a rail. */
  drag: (
    to: Target,
    onMove?: (at: Point, from: Point, t: number) => void,
    opts?: {
      duration?: number;
      cursor?: "preserve";
      path?: (progress: number, from: Point, to: Point) => Point;
    },
  ) => Promise<void>;
  /** Put the cursor there at once, with no travel. Only behind a cut, where nothing on screen has to explain it. */
  place: (to: Target) => void;
  readonly signal: AbortSignal;
  /** 'wide' or 'compact': which design is showing, so a script can aim or pace per layout. */
  readonly layout: Layout;
}

export type Script<S> = (act: Act<S>) => Promise<void>;

/** Thrown into a script when its stage stops it: it left the screen, or the layout changed. */
export class StoppedError extends Error {
  constructor(message = "The stage stopped this run") {
    super(message);
    this.name = "StoppedError";
  }
}

// A beat started without await (a move alongside other beats) rejects with
// StoppedError when the stage stops; that is expected, so it must not
// surface as an unhandled rejection. Any other error is reported here, since
// nobody may be awaiting it. Awaited calls still see the rejection.
const settle = async (out: Promise<void>) => {
  try {
    await out;
  } catch (error) {
    if (!(error instanceof StoppedError)) console.error("[stageshow] script error", error);
  }
};
const watched = (out: Promise<void>) => {
  // settle never rejects, so void loses nothing here
  void settle(out);
  return out;
};

type Ref<T> = { current: T };

/** What an act works with: the stage's elements, refs and setters, read when the act is made. */
export interface ActEnv<S> {
  rootRef: { readonly current: HTMLDivElement | null };
  cursorRef: { readonly current: HTMLDivElement | null };
  pos: Ref<Point>;
  hovered: Ref<HTMLElement | null>;
  kindRef: Ref<CursorKind>;
  keysRef: Ref<Keys>;
  dragging: Ref<boolean>;
  autoUsed: Ref<boolean>;
  autoRef: Ref<((p: Point) => void) | null>;
  scaleRef: Ref<number>;
  speed: number;
  layout: Layout;
  cursor?: { ripple?: boolean; style?: string };
  resolve: (t: Target) => Point;
  place: (p: Point) => void;
  ripple: (at: Point) => void;
  setState: Dispatch<SetStateAction<S>>;
  setKind: Dispatch<SetStateAction<CursorKind>>;
  setKeys: Dispatch<SetStateAction<Keys>>;
  setLastKeys: Dispatch<SetStateAction<Keys | null>>;
}

const CONTROL =
  '[data-cursor], button, a[href], [role="button"], [role="menuitem"], [role="option"], [role="tab"]';

// Gathers speed over the first quarter, then one speed to the lift,
// still moving when it leaves so the throw carries straight on
const RAMP = 0.25;
const GAIN = 1 / (1 - RAMP / 2);
const fingerEase = (t: number) =>
  t < RAMP ? ((t * t) / (2 * RAMP)) * GAIN : (t - RAMP / 2) * GAIN;

// Each run gets its own act, bound to its own signal, so a canceled run can
// never pick up the next run's signal and keep going.
export function createAct<S>(signal: AbortSignal, env: ActEnv<S>): Act<S> {
  const {
    rootRef,
    cursorRef,
    pos,
    hovered,
    kindRef,
    keysRef,
    dragging,
    autoUsed,
    autoRef,
    scaleRef,
    speed,
    layout,
    cursor,
    resolve: aim,
    place: placeAt,
    ripple,
    setState,
    setKind,
    setKeys,
    setLastKeys,
  } = env;
  const check = () => {
    if (signal.aborted) throw new StoppedError();
  };
  // Both clocks belong to this run. A settled wait releases its listener;
  // abort cancels the pending work before another run can take over.
  const pause = <T>(schedule: (done: () => void) => T, cancel: (id: T) => void) =>
    new Promise<void>((resolve, reject) => {
      check();
      const abort = () => {
        cancel(id);
        signal.removeEventListener("abort", abort);
        reject(new StoppedError());
      };
      const id = schedule(() => {
        signal.removeEventListener("abort", abort);
        if (signal.aborted) reject(new StoppedError());
        else resolve();
      });
      signal.addEventListener("abort", abort, { once: true });
    });
  const frame = () => pause((done) => requestAnimationFrame(done), cancelAnimationFrame);
  const wait = (ms: number) => pause((done) => setTimeout(done, ms / speed), clearTimeout);
  // Release transient DOM/ref state synchronously on abort. The guarded
  // finally call cannot then clear a new run's press or drag ownership.
  const own = (release: () => void) => {
    let live = true;
    const done = () => {
      if (!live) return;
      live = false;
      signal.removeEventListener("abort", done);
      release();
    };
    signal.addEventListener("abort", done, { once: true });
    return done;
  };
  const tween = async (ms: number, step: (t: number) => void) => {
    const start = performance.now();
    const dur = ms / speed;
    for (;;) {
      check();
      const t = Math.min(1, (performance.now() - start) / dur);
      step(t);
      if (t === 1) return;
      await frame();
    }
  };
  // Hover is the target and every data-target around it, as in a browser:
  // a row stays hovered while the cursor is on a button inside it.
  const chain = (el: HTMLElement | null) => {
    const out: HTMLElement[] = [];
    for (let n = el; n && n !== rootRef.current; n = n.parentElement)
      if ("target" in n.dataset) out.push(n);
    return out;
  };
  // Kind from what's under the cursor, as a real one works: any element
  // marked data-cursor="hand" | "ibeam" | ... sets the kind while the cursor
  // is over it, switching the moment it crosses the edge. Stages that mark
  // nothing keep the kind the script sets.
  const auto = (p: Point) => {
    const root = rootRef.current;
    if (!root) return;
    const marked = root.querySelectorAll<HTMLElement>("[data-cursor]");
    // A stage that never marks anything keeps the script's kind. One that
    // did falls back to the pointer once its marked elements are gone, so
    // a hand doesn't outlive the thing it was over.
    if (!marked.length && !autoUsed.current) return;
    if (marked.length) autoUsed.current = true;
    const box = root.getBoundingClientRect();
    const s = box.width / root.offsetWidth || 1;
    // What it shows over anything unmarked: the pointer, or the stage's own
    // base kind (a launch film keeps the hand throughout)
    const base = (root.dataset.cursorBase as CursorKind | undefined) ?? "pointer";
    let next: CursorKind = base;
    // What is actually on top under the point decides, as a real pointer
    // works: a button in a popover over a text area is not text. Walk up
    // from the topmost element to the nearest marked one.
    // Every layer, with pointer-events forced on for the test: demos turn
    // them off on overlays (a menu, margin buttons), and the cursor must
    // still read what is visibly on top, not the text beneath it. Layers
    // that are see-through (faded out) are skipped.
    root.dataset.hit = "";
    const stack = document.elementsFromPoint(box.left + p.x * s, box.top + p.y * s);
    delete root.dataset.hit;
    const top = stack.find((el) => {
      if (!root.contains(el) || el.closest(".ss-cursor, .ss-keys, .ss-ripple")) return false;
      // A layer that turned pointer-events off counts only where it is a
      // control or a target; a bare overlay (connectors, a flight layer)
      // must not cover what is under it
      if (getComputedStyle(el).pointerEvents === "none" && !el.closest(`${CONTROL}, [data-target]`))
        return false;
      let o = 1;
      for (let n: Element | null = el; n && n !== root.parentElement; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (cs.visibility === "hidden") return false;
        o *= Number(cs.opacity);
      }
      return o > 0.15;
    });
    if (top) {
      // A control inside a marked area (a button over text) is the pointer
      // again unless it's marked itself, as on a real screen
      const n = top.closest<HTMLElement>(CONTROL);
      next = n && root.contains(n) && n.dataset.cursor ? (n.dataset.cursor as CursorKind) : base;
      if (next !== kindRef.current) setKind(next);
      return;
    }
    // Off screen (nothing to hit-test): judge by boxes alone
    marked.forEach((n) => {
      const r = n.getBoundingClientRect();
      const x = (r.left - box.left) / s;
      const y = (r.top - box.top) / s;
      // Later (inner) matches win, so a link inside a text block is a hand
      if (p.x >= x && p.x <= x + r.width / s && p.y >= y && p.y <= y + r.height / s)
        next = n.dataset.cursor as CursorKind;
    });
    if (next !== kindRef.current) setKind(next);
  };
  autoRef.current = auto;
  // A run starts in the kind of what the cursor rests on, so a loop's first
  // frame matches its last
  if (!dragging.current) auto(pos.current);
  const hover = (el: HTMLElement | null) => {
    if (hovered.current === el) return;
    const next = chain(el);
    for (const n of chain(hovered.current)) if (!next.includes(n)) delete n.dataset.hover;
    for (const n of next) n.dataset.hover = "";
    hovered.current = el;
  };
  // Stage keeps the last key row through resets; a new Act must not reuse its identity.
  let keyId = keysRef.current.id;
  const targetEl = (t: Target) => {
    const name = nameOf(t);
    return name === null
      ? null
      : (rootRef.current?.querySelector<HTMLElement>(`[data-target="${name}"]`) ?? null);
  };

  const put = (patch: Patch<S>) => {
    if (!signal.aborted) setState((s) => ({ ...s, ...(isUpdater(patch) ? patch(s) : patch) }));
  };

  const set = async (patch: Patch<S>) => {
    check();
    put(patch);
    await frame();
    await frame();
    // The scene changed under a still pointer: a button that left, a menu
    // that opened. Re-read what is under it now, as a real cursor would
    autoRef.current?.(pos.current);
    check();
  };

  const pauseFor = async (ms: number) => {
    check();
    await wait(ms);
  };

  const rect = (name: string, opts?: { layout?: boolean }) => {
    const root = rootRef.current;
    const el = root?.querySelector<HTMLElement>(`[data-target="${name}"]`);
    if (!root || !el) {
      warn(`no element with data-target="${name}"`);
      return EMPTY;
    }
    return opts?.layout ? layoutRectOf(root, el) : rectOf(root, el, scaleRef.current);
  };

  const move: Act<S>["move"] = async (to, opts) => {
    check();
    const from = { ...pos.current };
    const end = aim(to);
    const dist = Math.hypot(end.x - from.x, end.y - from.y);
    if (dist < 0.5) {
      hover(targetEl(to));
      return;
    }
    // Leave hover only on what the cursor actually leaves: moving from a
    // row onto a button inside it keeps the row hovered all the way
    const dest = chain(targetEl(to));
    hover(chain(hovered.current).find((n) => dest.includes(n)) ?? null);
    // A hand travels in a shallow arc, quicker over short hops
    const ms = opts?.duration ?? clamp(260 + dist * 0.9, 300, 650);
    const bow = Math.min(dist * 0.08, 24);
    const nx = -(end.y - from.y) / dist;
    const ny = (end.x - from.x) / dist;
    const onMove = opts?.onMove;
    await tween(ms, (t) => {
      const e = easeInOutCubic(t);
      const lift = Math.sin(Math.PI * e) * bow;
      const p = opts?.path
        ? opts.path(e, from, end)
        : {
            x: from.x + (end.x - from.x) * e + nx * lift,
            y: from.y + (end.y - from.y) * e + ny * lift,
          };
      placeAt(p);
      auto(p);
      if (onMove) flushSync(() => onMove(p, from, t));
    });
    check();
    hover(targetEl(to));
  };

  const click: Act<S>["click"] = async (to, opts) => {
    check();
    if (to !== undefined) {
      await move(to);
      await wait(120);
    }
    check();
    const el = to === undefined ? hovered.current : targetEl(to);
    const cursorEl = cursorRef.current;
    const finger = cursor?.style === "touch";
    const release = own(() => {
      delete cursorEl?.dataset.pressed;
      delete el?.dataset.pressed;
      if (finger) fingerGone(cursorEl);
    });
    try {
      // A finger is only there when it touches: it shows just before, and goes after it lifts
      if (finger) {
        if (cursorEl) cursorEl.dataset.touching = "";
        await wait(140);
        check();
      }
      for (let i = 0; i < (opts?.double ? 2 : 1); i++) {
        if (i) await wait(70);
        check();
        if (cursorEl) cursorEl.dataset.pressed = "true";
        if (cursor?.ripple) ripple(pos.current);
        if (el) el.dataset.pressed = opts?.right ? "right" : "";
        await wait(opts?.double ? 80 : 100);
        check();
        delete cursorEl?.dataset.pressed;
        delete el?.dataset.pressed;
      }
    } finally {
      release();
    }
  };

  const snap = async (patch: Patch<S>, scope?: string) => {
    check();
    const el = scope
      ? rootRef.current?.querySelector<HTMLElement>(`[data-target="${scope}"]`)
      : rootRef.current;
    if (el) el.dataset.instant = "";
    const release = own(() => delete el?.dataset.instant);
    try {
      put(patch);
      await frame();
      await frame();
      check();
    } finally {
      release();
    }
  };

  const key = async (combo: string) => {
    check();
    const caps = capsOf(combo);
    const id = ++keyId;
    const k = keysRef.current;
    setLastKeys(k.caps.length ? { ...k, show: false, down: false } : null);
    setKeys({ id, caps, show: false, down: false });
    await frame();
    await frame();
    check();
    setKeys({ id, caps, show: true, down: false });
    await wait(180);
    check();
    setKeys({ id, caps, show: true, down: true });
    await wait(140);
    check();
    setKeys({ id, caps, show: true, down: false });
    // The caps linger and fade without holding up the script.
    const fade = async () => {
      try {
        await wait(600);
      } catch (error) {
        if (!(error instanceof StoppedError)) console.error("[stageshow] script error", error);
        return;
      }
      if (keyId === id && !signal.aborted) setKeys({ id, caps, show: false, down: false });
    };
    // fade reports its own errors, so void loses nothing here
    void fade();
  };

  const stagger = async <T>(
    items: T[],
    fn: (item: T, i: number) => Promise<void> | void,
    gap = 60,
  ) => {
    await Promise.all(
      items.map(async (item, i) => {
        if (i) await wait(gap * i);
        check();
        await fn(item, i);
      }),
    );
  };

  const mark = (name: string) => {
    if (!signal.aborted && rootRef.current) rootRef.current.dataset.mark = name;
  };

  const type = async (field: keyof S, text: string, opts?: { interval?: number }) => {
    const interval = opts?.interval ?? 35;
    for (let i = 0; i <= text.length; i++) {
      check();
      setState((s) => ({ ...s, [field]: text.slice(0, i) }));
      // Uneven but repeatable rhythm, so every loop types the same way
      await wait(interval * (0.7 + 0.6 * hash(i)));
    }
  };

  const place = (to: Target) => {
    if (signal.aborted) return;
    const p = aim(to);
    placeAt(p);
    autoRef.current?.(p);
  };

  const drag: Act<S>["drag"] = async (to, onMove, opts) => {
    check();
    const from = { ...pos.current };
    const end = aim(to);
    const dist = Math.hypot(end.x - from.x, end.y - from.y);
    hover(null);
    // The hand closes only while the button is held, as a real cursor's
    // does: on press here, and back to what it was on release. Over text
    // (I-beam) or a canvas (crosshair) a drag selects, so it keeps its kind.
    const before = kindRef.current;
    const selects = before === "ibeam" || before === "crosshair";
    const closesHand = !selects && opts?.cursor !== "preserve";
    // A finger swipes in one motion: it lands and is already moving, fast
    // first and slowing as it goes. A mouse presses, then carries.
    const finger = cursor?.style === "touch";
    if (finger) {
      if (cursorRef.current) cursorRef.current.dataset.touching = "";
      await wait(140);
      check();
    }
    // The trail: one streak from where the finger was a few frames ago to
    // where it is now, turned along the motion and fading toward its tail
    const streak = finger
      ? (cursorRef.current?.querySelector<HTMLElement>(".ss-cursor__streak") ?? null)
      : null;
    const trail: Point[] = [];
    const drawTrail = (at: Point) => {
      trail.unshift({ ...at });
      if (trail.length > 9) trail.pop();
      const tail = trail.at(-1) ?? at;
      const dx = at.x - tail.x;
      const dy = at.y - tail.y;
      const len = Math.min(Math.hypot(dx, dy), 100);
      if (!streak) return;
      streak.style.width = `${len}px`;
      streak.style.left = `${-len}px`;
      streak.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
    };
    dragging.current = true;
    const cursorEl = cursorRef.current;
    const release = own(() => {
      dragging.current = false;
      delete cursorEl?.dataset.pressed;
      delete cursorEl?.dataset.swiping;
      if (finger) fingerGone(cursorEl);
    });
    try {
      // The press dips first and the hand closes at the bottom of it, so
      // the change of shape sits inside the press
      if (cursorEl) cursorEl.dataset.pressed = "true";
      // A finger presses first, seen as a press, and then swipes
      await wait(finger ? 170 : 60);
      if (finger) {
        if (streak) streak.style.width = "0px";
        if (cursorEl) cursorEl.dataset.swiping = "";
      }
      check();
      if (closesHand && !finger) setKind("grab");
      if (!finger) await wait(70);
      check();
      delete cursorEl?.dataset.pressed;
      // Carried by a hand: the same shallow arc and ease as a move, a little
      // slower for the weight, never a ruler-straight slide
      // A selection is precise: straight, so the caret never leaves the text
      const bow = selects ? 0 : Math.min(dist * 0.06, 18);
      const nx = dist ? -(end.y - from.y) / dist : 0;
      const ny = dist ? (end.x - from.x) / dist : 0;
      // A selection across lines drops into its last line first, then
      // sweeps along it, as a hand does. A straight diagonal runs back past
      // the anchor on the first line (selecting nothing, or backwards) and
      // then fills everything at once as it crosses into the next.
      const lines = selects && Math.abs(end.y - from.y) > 6;
      // Ending left of where it started, no path reads right: the beam runs
      // back along the first line or past the end on the last
      if (lines && end.y > from.y && end.x < from.x - 2)
        warn(
          "a text selection that ends left of where it starts overshoots and shrinks back; select text that starts a line, or fits on one",
        );
      // A flick is brief, about a quarter second; the throw does the rest
      const mouseMs = clamp(360 + dist * 1.1, 450, 900);
      const fingerMs = clamp(180 + dist * 0.5, 240, 300);
      await tween(opts?.duration ?? (finger ? fingerMs : mouseMs), (t) => {
        // A finger gathers speed for a few frames and then runs at one
        // speed until it lifts, still moving: what it threw carries on at
        // that speed and eases off. A finger that slows before it lifts
        // makes the throw jolt; one that eases out early reads as a pause
        const e = finger ? fingerEase(t) : easeInOutCubic(t);
        const lift = Math.sin(Math.PI * e) * bow;
        // The drop: y arrives early, x mostly late (a curve through (from.x, end.y))
        const ey = lines ? 1 - (1 - e) * (1 - e) : e;
        const ex = lines ? e * e : e;
        const at = opts?.path?.(e, from, end) ?? {
          x: from.x + (end.x - from.x) * ex + nx * lift,
          y: from.y + (end.y - from.y) * ey + ny * lift,
        };
        // The cursor and whatever follows it (a card, a selection) paint in
        // the same frame: render the scene now, not a frame behind
        flushSync(() => onMove?.(at, from, t));
        placeAt(at);
        if (finger) drawTrail(at);
      });
      check();
      if (closesHand && !finger) setKind(before === "grab" ? "pointer" : before);
    } finally {
      release();
    }
    // What's under the cursor now decides (the thing it was over may have moved or gone)
    autoRef.current?.(end);
  };

  return {
    get signal() {
      return signal;
    },
    layout,
    set: (patch) => watched(set(patch)),
    put,
    wait: (ms) => watched(pauseFor(ms)),
    rect,
    move: (to, opts) => watched(move(to, opts)),
    click: (to, opts) => watched(click(to, opts)),
    snap: (patch, scope) => watched(snap(patch, scope)),
    key: (combo) => watched(key(combo)),
    stagger: (items, fn, gap) => watched(stagger(items, fn, gap)),
    mark,
    type: (field, text, opts) => watched(type(field, text, opts)),
    drag: (to, onMove, opts) => watched(drag(to, onMove, opts)),
    place,
  };
}

// A loop that doesn't end where it began jumps on every repeat.
export function checkSeam<S extends object>(end: S, initial: S, at: Point, rest: Point | null) {
  const ends = new Map(Object.entries(end));
  const changed = Object.entries(initial)
    .filter(([field, value]) => JSON.stringify(ends.get(field)) !== JSON.stringify(value))
    .map(([field]) => field);
  if (changed.length)
    warn(
      `loop seam: state still differs from initial at the end of the script (${changed.join(", ")})`,
    );
  if (rest && Math.hypot(at.x - rest.x, at.y - rest.y) > 1)
    warn("loop seam: cursor does not end where it starts");
}
