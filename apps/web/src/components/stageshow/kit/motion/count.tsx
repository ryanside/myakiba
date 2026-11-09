import { useLayoutEffect, useEffect, useEffectEvent, useRef, useState } from "react";
import type { HTMLAttributes } from "react";
import { useReducedMotion } from "../reduced-motion";
import "./count.css";

export interface CountProps extends HTMLAttributes<HTMLSpanElement> {
  value: number;
  /** How a number is written, e.g. n => `$${n.toFixed(2)}` */
  format?: (n: number) => string;
  /** ms for a digit to roll from the old figure to the new one. */
  duration?: number;
  /** ms between one digit starting and the next, from the right. */
  stagger?: number;
}

// Three decades of figures, so a digit can roll on past 9 into 0 (or back
// past 0 into 9) without ever running off the end of the strip
const STRIP = [..."012345678901234567890123456789"];
const MIDDLE = 10;

// A unit after the figure ("21°", "240ms", "40%", "12 min"): the run of
// letters or signs that ends the text, after its last digit. It gets a box of
// its own, a hair from the digits (a word space when the format writes one),
// so the pair reads as one figure without the unit sitting on the last digit
const unitOf = (text: string) => {
  const m = /^(.*\d)(\s*)([^\d\s.,]+)$/.exec(text);
  if (!m) return { head: text, space: false, unit: "" };
  const [, head = text, gap = "", unit = ""] = m;
  return { head, space: gap.length > 0, unit };
};

const digitsFromRight = (text: string) => {
  const out: number[] = [];
  for (let i = text.length - 1; i >= 0; i--) {
    const c = text[i];
    if (c !== undefined && c >= "0" && c <= "9") out.push(Number(c));
  }
  return out;
};

/**
 * A number whose digits roll to each new value, the way a counter does:
 * each changed digit turns from the old figure to the new one, the last digit
 * first, so a total settles from the right. A rise rolls the figures up, a
 * fall rolls them down, and a digit passing 9 carries on into 0 rather than
 * spinning back. Unchanged digits and the punctuation hold still. Tabular
 * figures keep every column the same width. A unit the format writes after
 * the figure ("21°", "240ms", "40%") sits in a box of its own
 * (`.ss-count__unit`), a hair from the last digit, or a word space when the
 * format has one ("12 min"); restyle it there for a smaller or lighter unit,
 * and set `--ss-count-unit-gap` to widen the hair. Inside an `act.snap` or an
 * offscreen reset it jumps to the value, so unseen resets stay unseen.
 */
const wholeNumber = (n: number) => Math.round(n).toLocaleString("en-US");

// Where each column's strip sits, by column from the right, and whether this
// is the snap back to the middle decade after a roll
type Strips = { idx: number[]; homing: boolean };

export function Count({
  value,
  format = wholeNumber,
  duration = 700,
  stagger = 45,
  className,
  style,
  ...rest
}: CountProps) {
  const reduced = useReducedMotion();
  const el = useRef<HTMLSpanElement>(null);
  const text = format(value);
  const { head, space, unit } = unitOf(text);
  const chars = [...head];
  const digits = digitsFromRight(text);
  // Starts in the middle decade; a change moves each strip by the shortest
  // turn in the value's direction, and it is put back in the middle once the
  // roll has settled
  const [strips, setStrips] = useState<Strips>(() => ({
    idx: digits.map((d) => MIDDLE + d),
    homing: false,
  }));
  const shown = useRef({ text, value, idx: strips.idx });

  useLayoutEffect(() => {
    const node = el.current;
    if (!node) return;
    const prev = shown.current;
    if (prev.text === text) return;
    const instant = reduced || duration <= 0 || !!node.closest("[data-instant], [data-offscreen]");
    const before = digitsFromRight(prev.text);
    const up = value >= prev.value;
    const next = digitsFromRight(text).map((d, c) => {
      const was = before[c];
      const at = prev.idx[c];
      if (was === undefined || at === undefined || instant) return MIDDLE + d;
      if (was === d) return at;
      return up ? at + ((d - was + 10) % 10) : at - ((was - d + 10) % 10);
    });
    if (instant) node.dataset.snap = "";
    else delete node.dataset.snap;
    if (!instant) {
      // Settle the old transforms in the browser first, so the new ones transition
      for (const strip of node.querySelectorAll<HTMLElement>(".ss-count__strip"))
        void getComputedStyle(strip).transform;
      node.dataset.rolling = "";
    }
    shown.current = { text, value, idx: next };
    setStrips({ idx: shown.current.idx, homing: false });
  }, [text, value, reduced, duration]);

  // Once every digit has landed, put the strips back in the middle decade
  // without a transition, and drop the rolling mark a still waits on
  const landed = useEffectEvent(() => duration + stagger * digits.length + 60);
  const goHome = useEffectEvent((node: HTMLSpanElement) => {
    node.dataset.snap = "";
    const home = digits.map((d) => MIDDLE + d);
    shown.current.idx = home;
    setStrips({ idx: home, homing: true });
    delete node.dataset.rolling;
  });
  useEffect(() => {
    const node = el.current;
    if (!node || strips.homing || !("rolling" in node.dataset)) return;
    const id = window.setTimeout(() => goHome(node), landed());
    return () => window.clearTimeout(id);
  }, [strips]);

  // The snap comes off only after the home transforms are in the DOM (a
  // frame callback could run before React commits them, and the strips
  // would then roll a whole decade back to the middle)
  useLayoutEffect(() => {
    const node = el.current;
    if (!node || !strips.homing) return;
    for (const strip of node.querySelectorAll<HTMLElement>(".ss-count__strip"))
      void getComputedStyle(strip).transform;
    delete node.dataset.snap;
  }, [strips]);

  // Columns are keyed from the right, so a total that gains a digit keeps the
  // digits it already had rolling in place and only the new leading one appears
  let fromRight = digits.length;
  return (
    <span
      {...rest}
      ref={el}
      className={`ss-count${className ? ` ${className}` : ""}`}
      style={style}
      aria-label={text}
    >
      {chars.map((c, i) => {
        if (c < "0" || c > "9")
          return (
            <span key={`s${i}-${c}`} className="ss-count__char" aria-hidden>
              {c}
            </span>
          );
        const column = --fromRight;
        const at = strips.idx[column] ?? MIDDLE + Number(c);
        return (
          <span key={`d${column}`} className="ss-count__digit" data-crop aria-hidden>
            <span
              className="ss-count__strip"
              style={{
                transform: `translateY(${-at}em)`,
                transitionDuration: `${duration}ms`,
                transitionDelay: `${column * stagger}ms`,
              }}
            >
              {STRIP.map((n, k) => (
                <span key={k}>{n}</span>
              ))}
            </span>
          </span>
        );
      })}
      {unit && (
        <span className="ss-count__unit" data-space={space || undefined} aria-hidden>
          {unit}
        </span>
      )}
    </span>
  );
}
