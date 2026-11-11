import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useMotionPreference } from "@/hooks/use-appearance";
import { cn } from "@/lib/utils";

const SENTENCE =
  "flex flex-col items-start gap-y-[0.18em] text-3xl leading-[1.2] font-medium tracking-tight sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-[0.28em] md:text-4xl xl:text-5xl";

const LINE = "flex flex-wrap items-center gap-x-[0.28em] gap-y-[0.18em] sm:flex-nowrap";

const FIGURE_PILL =
  "inline-flex h-[1.3em] items-center rounded-full py-[0.125em] pr-[0.5em] pl-[0.125em] ring-1 ring-foreground/10";

const PLACE_PILL =
  "inline-flex h-[1.3em] items-center rounded-full bg-primary px-[0.5em] text-primary-foreground";

type Pick = {
  readonly figures: readonly string[];
  readonly label: string;
  readonly destination: string;
};

const PICKS: readonly Pick[] = [
  { figures: ["/example-item1.webp"], label: "an artbook", destination: "your collection" },
  {
    figures: ["/example-item2.webp", "/example-item4.webp", "/example-item5.webp"],
    label: "3 figures",
    destination: "one order",
  },
  { figures: ["/example-item3.webp"], label: "a plushie", destination: "your wishlist" },
  {
    figures: ["/example-item6.webp", "/example-item7.webp"],
    label: "2 scales",
    destination: "a List",
  },
];

const BEAT_MS = 2800;

const FIRST_MS = 1800;

const MOTION = "ease-out motion-reduce:transition-none";

const SHOWN = "translate-y-0 opacity-100 duration-200";
const LEAVING = "-translate-y-[0.15em] opacity-0 duration-100 delay-0";
const WAITING = "translate-y-[0.2em] opacity-0 duration-0 delay-0";

type Widths = { readonly figure: number; readonly place: number };

type Measured = {
  readonly widths: readonly Widths[];
  readonly height: number;
};

export function AddSentence({ className }: { readonly className?: string }) {
  const { reduce } = useMotionPreference();
  const [turn, setTurn] = useState(0);
  const rootRef = useRef<HTMLParagraphElement>(null);
  const copiesRef = useRef<HTMLSpanElement>(null);
  const [measured, setMeasured] = useState<Measured | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (reduce || !root) return;
    let timer: number | undefined;
    let onScreen = false;
    let first = true;
    const stop = () => {
      window.clearTimeout(timer);
      timer = undefined;
    };
    const schedule = () => {
      stop();
      if (!onScreen || document.hidden) return;
      timer = window.setTimeout(
        () => {
          first = false;
          setTurn((value) => value + 1);
          schedule();
        },
        first ? FIRST_MS : BEAT_MS,
      );
    };
    const observer = new IntersectionObserver(([entry]) => {
      onScreen = entry?.isIntersecting ?? false;
      schedule();
    });
    observer.observe(root);
    document.addEventListener("visibilitychange", schedule);
    return () => {
      stop();
      observer.disconnect();
      document.removeEventListener("visibilitychange", schedule);
    };
  }, [reduce]);

  useLayoutEffect(() => {
    const measure = () => {
      const root = copiesRef.current;
      if (!root) return;
      const copies = [...root.querySelectorAll<HTMLElement>("[data-copy]")];
      const width = (copy: HTMLElement, part: string) =>
        copy.querySelector(part)?.getBoundingClientRect().width ?? 0;
      setMeasured({
        widths: copies.map((copy) => ({
          figure: width(copy, "[data-figure]"),
          place: width(copy, "[data-place]"),
        })),
        height: Math.max(
          0,
          ...copies.map((copy) => Math.ceil(copy.getBoundingClientRect().height)),
        ),
      });
    };
    measure();
    const afterFonts = async () => {
      await document.fonts.ready;
      measure();
    };
    void afterFonts();
    const observer = new ResizeObserver(measure);
    if (copiesRef.current) observer.observe(copiesRef.current);
    return () => observer.disconnect();
  }, []);

  const index = reduce ? 0 : turn % PICKS.length;
  const glides = !reduce && turn > 0;
  const previous = (index + PICKS.length - 1) % PICKS.length;
  const current = measured?.widths[index];
  const before = measured?.widths[previous];
  const style: CSSProperties | undefined = measured ? { minHeight: measured.height } : undefined;

  const glide = (part: keyof Widths): CSSProperties | undefined => {
    const to = current?.[part];
    if (to === undefined) return undefined;
    const from = before?.[part] ?? to;
    return { width: to, transitionDelay: glides && to < from ? "60ms" : "0ms" };
  };
  const box = cn("grid overflow-x-clip", glides && "transition-[width] duration-[240ms]", MOTION);
  const place = (i: number, enter: string) => {
    if (i === index) return cn(SHOWN, enter);
    return glides && i === previous ? LEAVING : WAITING;
  };
  const swap = (i: number, enter: string) =>
    cn(
      "col-start-1 row-start-1 w-max justify-self-start transition-[opacity,translate]",
      MOTION,
      place(i, enter),
    );

  return (
    <p ref={rootRef} aria-hidden className={cn(SENTENCE, "relative", className)} style={style}>
      <Words
        figure={
          <span className={box} style={glide("figure")}>
            {PICKS.map((pick, i) => (
              <PickFigure key={pick.label} pick={pick} className={swap(i, "delay-[70ms]")} />
            ))}
          </span>
        }
        place={
          <span className={box} style={glide("place")}>
            {PICKS.map((pick, i) => (
              <PickPlace key={pick.destination} pick={pick} className={swap(i, "delay-[120ms]")} />
            ))}
          </span>
        }
      />

      <span ref={copiesRef} className="pointer-events-none invisible absolute inset-x-0 top-0">
        {PICKS.map((pick) => (
          <span key={pick.label} data-copy className={cn(SENTENCE, "absolute inset-x-0 top-0")}>
            <Words
              figure={<PickFigure pick={pick} className="w-max" />}
              place={<PickPlace pick={pick} className="w-max" />}
            />
          </span>
        ))}
      </span>
    </p>
  );
}

function Words({ figure, place }: { readonly figure: ReactNode; readonly place: ReactNode }) {
  return (
    <>
      <span className={LINE}>
        <span>Add</span>
        <span className={FIGURE_PILL}>{figure}</span>
      </span>
      <span className={LINE}>
        <span>to</span>
        <span className={PLACE_PILL}>{place}</span>
      </span>
    </>
  );
}

function PickPlace({ pick, className }: { readonly pick: Pick; readonly className: string }) {
  return (
    <span data-place className={cn(className, "whitespace-nowrap")}>
      {pick.destination}
    </span>
  );
}

function PickFigure({ pick, className }: { readonly pick: Pick; readonly className: string }) {
  return (
    <span
      data-figure=""
      className={cn("flex items-center gap-[0.25em] whitespace-nowrap", className)}
    >
      <span className="flex">
        {pick.figures.map((src, i) => (
          <img
            key={src}
            src={src}
            alt=""
            width={64}
            height={64}
            decoding="async"
            draggable={false}
            className={cn(
              "size-[1.05em] shrink-0 rounded-full object-cover outline outline-1 -outline-offset-1 outline-black/10 select-none dark:outline-white/10",
              i > 0 && "-ml-[0.42em] ring-[0.06em] ring-background",
            )}
          />
        ))}
      </span>
      {pick.label}
    </span>
  );
}
