import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useMotionPreference } from "@/hooks/use-appearance";
import { cn } from "@/lib/utils";
import "./add-sentence.css";

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

type Flyer = {
  readonly src: string;
  readonly left: number;
  readonly top: number;
  readonly size: number;
  readonly dx: number;
  readonly dy: number;
  readonly peak: number;
  readonly delay: number;
};

type Beat =
  | { readonly phase: "shown"; readonly turn: number }
  | {
      readonly phase: "thrown" | "caught";
      readonly turn: number;
      readonly flyers: readonly Flyer[];
    };

const HOLD_MS = { shown: 1100, thrown: 590, caught: 1500 } as const;

const FIRST_MS = 1300;

const THROW_STAGGER = [0, 55, 95] as const;

const POP_STAGGER = [0, 45, 80] as const;

const START: Beat = { phase: "shown", turn: 0 };

function advance(beat: Beat, measure: () => readonly Flyer[]): Beat {
  switch (beat.phase) {
    case "shown":
      return { phase: "thrown", turn: beat.turn, flyers: measure() };
    case "thrown":
      return { phase: "caught", turn: beat.turn, flyers: beat.flyers };
    case "caught":
      return { phase: "shown", turn: beat.turn + 1 };
  }
}

function holdOf(beat: Beat): number {
  return beat.phase === "shown" && beat.turn === 0 ? FIRST_MS : HOLD_MS[beat.phase];
}

function measureFlyers(root: HTMLElement): readonly Flyer[] {
  const pill = root.querySelector("[data-destination]");
  if (!pill) return [];
  const host = root.getBoundingClientRect();
  const target = pill.getBoundingClientRect();
  const fontSize = Number.parseFloat(getComputedStyle(root).fontSize);
  const x = target.left + target.height * 0.62;
  const y = target.top + target.height / 2;
  const images = root.querySelectorAll<HTMLImageElement>("[data-figure][data-current] img");
  return [...images].map((image, i) => {
    const rect = image.getBoundingClientRect();
    const dy = y - (rect.top + rect.height / 2);
    return {
      src: image.getAttribute("src") ?? "",
      left: rect.left - host.left,
      top: rect.top - host.top,
      size: rect.width,
      dx: x - (rect.left + rect.width / 2),
      dy,
      peak: Math.min(0, dy) - 1.3 * fontSize,
      delay: THROW_STAGGER[i] ?? 0,
    };
  });
}

type Widths = { readonly figure: number; readonly place: number };

type Measured = {
  readonly widths: readonly Widths[];
  readonly height: number;
};

type Motion = {
  readonly current: boolean;
  readonly entering: boolean;
  readonly dimmed: boolean;
};

export function AddSentence({ className }: { readonly className?: string }) {
  const { reduce } = useMotionPreference();
  const [beat, setBeat] = useState<Beat>(START);
  const beatRef = useRef<Beat>(START);
  const rootRef = useRef<HTMLParagraphElement>(null);
  const copiesRef = useRef<HTMLSpanElement>(null);
  const [measured, setMeasured] = useState<Measured | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (reduce || !root) return;
    let timer: number | undefined;
    let onScreen = false;
    const stop = () => {
      window.clearTimeout(timer);
      timer = undefined;
    };
    const flying = () => beatRef.current.phase === "thrown" && timer !== undefined;
    const schedule = () => {
      if (flying()) return;
      stop();
      if (!onScreen || document.hidden) return;
      timer = window.setTimeout(() => {
        timer = undefined;
        const next = advance(beatRef.current, () => measureFlyers(root));
        beatRef.current = next;
        setBeat(next);
        schedule();
      }, holdOf(beatRef.current));
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

  const shown = reduce ? START : beat;
  const index = shown.turn % PICKS.length;
  const glides = shown.turn > 0;
  const swapping = glides && shown.phase === "shown";
  const caught = shown.phase === "caught";
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
  const box = cn(
    "relative grid overflow-x-clip",
    glides && "transition-[width] duration-[240ms]",
    "ease-out motion-reduce:transition-none",
  );
  const motion = (i: number): Motion => {
    const leaving = swapping && i === previous;
    return {
      current: i === index,
      entering: swapping && i === index,
      dimmed: (i === index && shown.phase !== "shown") || leaving,
    };
  };
  const cell = (i: number) =>
    cn(
      "col-start-1 row-start-1 w-max justify-self-start",
      i !== index && (swapping && i === previous ? "mk-add-sentence-leave" : "opacity-0"),
    );

  return (
    <p
      ref={rootRef}
      aria-hidden
      data-phase={shown.phase}
      className={cn(SENTENCE, "relative", className)}
      style={style}
    >
      <Words
        figure={
          <span className={box} style={glide("figure")}>
            {PICKS.map((pick, i) => (
              <PickFigure key={pick.label} pick={pick} className={cell(i)} motion={motion(i)} />
            ))}
          </span>
        }
        place={
          <span
            data-destination=""
            data-caught={caught ? "" : undefined}
            className={cn(PLACE_PILL, "mk-add-sentence-place relative")}
          >
            <span
              className={cn(
                "absolute inset-0 rounded-[inherit] bg-emerald-600 ease-out dark:bg-emerald-400",
                caught
                  ? "opacity-100 transition-opacity duration-[160ms]"
                  : "opacity-0 transition-opacity duration-[220ms]",
              )}
            />
            <span className="mk-add-sentence-ring pointer-events-none absolute inset-0 rounded-[inherit]" />
            <Check open={caught} />
            <span className={box} style={glide("place")}>
              {PICKS.map((pick, i) => (
                <PickPlace
                  key={pick.destination}
                  pick={pick}
                  className={cell(i)}
                  entering={swapping && i === index}
                />
              ))}
            </span>
          </span>
        }
      />

      {shown.phase !== "shown" &&
        shown.flyers.map((flyer, i) => <ThrownFigure key={`${shown.turn}-${i}`} flyer={flyer} />)}

      <span ref={copiesRef} className="pointer-events-none invisible absolute inset-x-0 top-0">
        {PICKS.map((pick) => (
          <span key={pick.label} data-copy className={cn(SENTENCE, "absolute inset-x-0 top-0")}>
            <Words
              figure={<PickFigure pick={pick} className="w-max" />}
              place={
                <span className={PLACE_PILL}>
                  <Check open />
                  <PickPlace pick={pick} className="w-max" />
                </span>
              }
            />
          </span>
        ))}
      </span>
    </p>
  );
}

function Check({ open }: { readonly open: boolean }) {
  return (
    <span
      data-open={open ? "" : undefined}
      className="mk-add-sentence-check relative inline-flex items-center overflow-hidden"
    >
      <svg viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          pathLength="1"
          d="M5 12.6l4.6 4.6L19.2 7.6"
          stroke="currentColor"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
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
        {place}
      </span>
    </>
  );
}

function PickPlace({
  pick,
  className,
  entering = false,
}: {
  readonly pick: Pick;
  readonly className: string;
  readonly entering?: boolean;
}) {
  return (
    <span
      data-place
      className={cn(className, "whitespace-nowrap", entering && "mk-add-sentence-rise")}
      style={entering ? { animationDelay: "90ms" } : undefined}
    >
      {pick.destination}
    </span>
  );
}

const AVATAR =
  "shrink-0 rounded-full object-cover outline outline-1 -outline-offset-1 outline-black/10 select-none dark:outline-white/10";

const STILL: Motion = { current: false, entering: false, dimmed: false };

function PickFigure({
  pick,
  className,
  motion = STILL,
}: {
  readonly pick: Pick;
  readonly className: string;
  readonly motion?: Motion;
}) {
  return (
    <span
      data-figure=""
      data-current={motion.current ? "" : undefined}
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
              AVATAR,
              "size-[1.05em] transition-opacity duration-[120ms] ease-out",
              i > 0 && "-ml-[0.42em] ring-[0.06em] ring-background",
              motion.entering && "mk-add-sentence-pop",
              motion.dimmed && "opacity-20",
            )}
            style={{
              animationDelay: `${POP_STAGGER[i] ?? 0}ms`,
              transitionDelay: `${THROW_STAGGER[i] ?? 0}ms`,
            }}
          />
        ))}
      </span>
      <span
        className={cn(motion.entering && "mk-add-sentence-rise")}
        style={{ animationDelay: "40ms" }}
      >
        {pick.label}
      </span>
    </span>
  );
}

function ThrownFigure({ flyer }: { readonly flyer: Flyer }) {
  const style = {
    left: flyer.left,
    top: flyer.top,
    width: flyer.size,
    height: flyer.size,
    "--dx": `${flyer.dx}px`,
    "--dy": `${flyer.dy}px`,
    "--peak": `${flyer.peak}px`,
    "--delay": `${flyer.delay}ms`,
  } as CSSProperties;
  return (
    <span data-flyer="" className="mk-add-sentence-flyer" style={style}>
      <span className="mk-add-sentence-fly">
        <img
          src={flyer.src}
          alt=""
          draggable={false}
          className={cn(AVATAR, "size-full ring-[0.06em] ring-background")}
        />
      </span>
    </span>
  );
}
