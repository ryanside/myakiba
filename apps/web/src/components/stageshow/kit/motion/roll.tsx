import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useReducedMotion } from "../reduced-motion";
import "./roll.css";

type RollProps = {
  children: string;
  stagger?: number;
  /** The side the text is pinned to. Found from the layout when left out: a
   * right-aligned value (text-align right, or last in a space-between or
   * flex-end row) changes against its right edge, so it never drifts. */
  align?: "start" | "end";
  /** 'roll' slides text up through the line, for numbers and inline text. 'fade'
   * crossfades in place with a small lift, for labels on buttons and other
   * controls, where a full roll shows two lines at once. */
  variant?: "roll" | "fade";
  className?: string;
  style?: CSSProperties;
};

/**
 * Text that rolls when it changes. Only the part that differs moves: in
 * "$0.01 per 1,000" to "$0.0098 per 1,000", "$0.0" and " per 1,000" hold still
 * while the old digits slide up and out and the new ones rise in one by one.
 * Words move whole: "Checking calendars" to "Everyone can make it" rolls word
 * by word, and a change never splits a word.
 * The changing part eases to its new width, so the text after it moves with it.
 * For prices, counts in words, statuses and labels.
 */
export function Roll({
  delay = 0,
  children,
  ...rest
}: RollProps & {
  /** Hold the old text this many ms before rolling: a total that changes
   * after the row that caused it has landed, not on the same frame. */
  delay?: number;
}) {
  const reduced = useReducedMotion();
  const [held, setHeld] = useState(children);
  const holds = delay > 0 && !reduced;
  // With nothing to hold, the held text follows the live text at once
  if (!holds && held !== children) setHeld(children);
  useEffect(() => {
    if (!holds) return;
    const id = setTimeout(() => setHeld(children), delay);
    return () => clearTimeout(id);
  }, [children, delay, holds]);
  return <RollNow {...rest}>{holds ? held : children}</RollNow>;
}

// Inline text has no computed width. Use the line box's scale to convert
// its painted width back to local CSS pixels, including inside a Phone or
// Camera. offsetWidth rounds away the fractions that keep a suffix still.
const rootWidthOf = (root: HTMLElement | null, mid: HTMLElement | null) => {
  if (!root || !mid) return 0;
  const height = Number.parseFloat(getComputedStyle(mid).height);
  const scale = height > 0 ? mid.getBoundingClientRect().height / height : 1;
  return root.getBoundingClientRect().width / (scale || 1);
};

const widthOf = (node: HTMLElement) => Number.parseFloat(getComputedStyle(node).width) || 0;

type View = {
  text: string;
  head: number;
  tail: number;
  old: string;
  key: number;
  numeric: boolean;
  /** The rendered width before this partition, measured as the change began. */
  from: number | null;
};

const settled = (text: string): View => ({
  text,
  head: 0,
  tail: 0,
  old: "",
  key: 0,
  numeric: true,
  from: null,
});

function RollNow({ children, stagger = 45, variant = "roll", align, className, style }: RollProps) {
  const reduced = useReducedMotion();
  const [view, setView] = useState(() => settled(children));
  const mid = useRef<HTMLSpanElement>(null);
  const root = useRef<HTMLSpanElement>(null);
  const [measuredSide, setMeasuredSide] = useState<"start" | "end">("start");
  const side = align ?? measuredSide;
  useLayoutEffect(() => {
    if (align) return;
    const el = root.current;
    if (!el?.parentElement) return;
    // Look through wrappers that only hold the roll (a <b>, a value span):
    // they size to it, so where the wrapper sits is where the text pins
    let box: HTMLElement = el;
    while (
      box.parentElement &&
      box.parentElement.childElementCount === 1 &&
      Math.abs(
        box.parentElement.getBoundingClientRect().width - box.getBoundingClientRect().width,
      ) < 1
    )
      box = box.parentElement;
    const parent = box.parentElement;
    if (!parent) return;
    const p = getComputedStyle(parent);
    const flex = /flex/.test(p.display) && p.flexDirection.startsWith("row");
    // Pushed to the right edge by an auto margin (or anything else) reads the
    // same from the layout: flush with the row's end, slack before it
    const pushed = () => {
      const prev = box.previousElementSibling;
      const r = box.getBoundingClientRect();
      const pr = parent.getBoundingClientRect();
      const flush =
        Math.abs(
          pr.right -
            Number.parseFloat(p.paddingRight) -
            Number.parseFloat(p.borderRightWidth) -
            r.right,
        ) < 1;
      const slack = prev
        ? r.left - prev.getBoundingClientRect().right - (Number.parseFloat(p.columnGap) || 0)
        : 0;
      return flush && slack > 1;
    };
    const end =
      /right|end/.test(getComputedStyle(el).textAlign) ||
      (flex &&
        box === parent.lastElementChild &&
        (/space-between|flex-end|^end/.test(p.justifyContent) || pushed()));
    setMeasuredSide(end ? "end" : "start");
  }, [align]);
  // Under reduced motion the text is settled at once, and a later roll starts from it
  if (reduced && (view.key !== 0 || view.text !== children)) setView(settled(children));
  // Partition the change against what is showing now
  useEffect(() => {
    if (reduced || view.text === children) return;
    const a = view.text;
    const b = children;
    let head = 0;
    while (head < a.length && head < b.length && a[head] === b[head]) head++;
    let tail = 0;
    while (
      tail < a.length - head &&
      tail < b.length - head &&
      a[a.length - 1 - tail] === b[b.length - 1 - tail]
    )
      tail++;
    // Digits can change one at a time; words can't. Snap a wordy change out to
    // whole words.
    const numeric = /^[\d.,$€£%+\-−\s]*$/.test(
      a.slice(head, a.length - tail) + b.slice(head, b.length - tail),
    );
    if (!numeric) {
      const space = (c: string | undefined) => c === undefined || /\s/.test(c);
      while (head > 0 && !space(b[head - 1]) && !space(b[head])) head--;
      while (tail > 0 && !space(b[b.length - tail - 1]) && !space(b[b.length - tail])) tail--;
    }
    setView({
      text: b,
      head,
      tail,
      old: a.slice(head, a.length - tail),
      key: view.key + 1,
      numeric,
      // Capture the rendered width before repartitioning head/middle/tail.
      // During interruption this is between endpoints, not the old target.
      from: rootWidthOf(root.current, mid.current),
    });
  }, [children, reduced, view.text, view.key]);
  // The old text goes once it has rolled out
  useEffect(() => {
    if (!view.old) return;
    const key = view.key;
    const id = setTimeout(() => setView((v) => (v.key === key ? { ...v, old: "" } : v)), 700);
    return () => clearTimeout(id);
  }, [view.key, view.old]);
  // While the old and new text swap, the box starts at the old text's width,
  // opens to the wider of the two so neither runs into what follows, then
  // settles to the new width. Set on the element directly so the starting
  // width never animates from a stale value. Settled, the box sizes to its
  // text on its own.
  useLayoutEffect(() => {
    const el = mid.current;
    const live = el?.querySelector<HTMLElement>("[data-live]");
    const out = el?.querySelector<HTMLElement>("[data-out]");
    if (!el || !live) return;
    if (reduced || view.key === 0) {
      el.style.transition = "none";
      el.style.width = "";
      return;
    }
    const next = widthOf(live);
    // Repartitioning moves unchanged text out of the grid. Subtract its new
    // width from the old rendered total so that move itself changes no room.
    const affixes = rootWidthOf(root.current, el) - widthOf(el);
    const previous = view.from;
    let start = out ? widthOf(out) : 0;
    if (previous !== null) start = Math.max(0, previous - affixes);
    el.style.transition = "none";
    el.style.width = `${start}px`;
    void el.offsetWidth;
    el.style.transition = "";
    // A control's label: the box and the crossfade are one move, straight to
    // the new width, and the box clips the old label as it goes
    if (variant === "fade") {
      el.style.width = `${next}px`;
      return;
    }
    const widest = Math.max(next, start, out ? widthOf(out) : 0);
    el.style.width = `${widest}px`;
    if (widest === next) return;
    const id = setTimeout(() => {
      el.style.width = `${next}px`;
    }, 360);
    return () => clearTimeout(id);
  }, [view.key, view.from, reduced, variant]);
  // The settled render must not wait for an effect: a Stage poster can
  // arrive in the same commit that disables its CSS animations.
  const { text, head, tail, old, key, numeric } = reduced ? settled(children) : view;
  const now = text.slice(head, text.length - tail);
  // Characters for numbers, whole words (with their spaces) for text
  const units = numeric ? [...now] : now.split(/(?<=\s)/);
  let live: ReactNode = now;
  if (key > 0 && variant === "fade") live = <span className="ss-roll__char">{now}</span>;
  else if (key > 0)
    live = units.map((c, i) => (
      <span key={i} className="ss-roll__char" style={{ animationDelay: `${110 + i * stagger}ms` }}>
        {c}
      </span>
    ));
  return (
    <span
      ref={root}
      className={`ss-roll${className ? ` ${className}` : ""}`}
      data-variant={variant}
      data-align={side}
      style={style}
    >
      {text.slice(0, head)}
      <span ref={mid} className="ss-roll__mid">
        {old && (
          <span key={`o${key}`} className="ss-roll__item" data-out>
            {old}
          </span>
        )}
        <span key={`n${key}`} className="ss-roll__item" data-live>
          {live}
        </span>
      </span>
      {text.slice(text.length - tail)}
    </span>
  );
}
