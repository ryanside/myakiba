import { useEffect, useRef } from "react";

import { useMotionPreference } from "@/hooks/use-appearance";
import "@/lib/typer/typer.css";
import { Typer } from "@/lib/typer/typer";
import type { TyperOptions } from "@/lib/typer/typer";
import { cn } from "@/lib/utils";

export interface TyperHeadlineProps extends TyperOptions {
  readonly text: string;
  readonly className?: string;
  readonly delayMs?: number;
  readonly "aria-hidden"?: boolean;
}

export function TyperHeadline({
  text,
  className,
  delayMs = 150,
  fps = 30,
  cycles = 4,
  cycleLength,
  variations,
  initVisible,
  "aria-hidden": ariaHidden,
}: TyperHeadlineProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduceMotion = useMotionPreference().reduce;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.textContent = text;

    const typer = new Typer(el, {
      fps,
      cycles,
      cycleLength,
      variations,
      initVisible: initVisible ?? reduceMotion,
    });

    if (reduceMotion) return () => typer.destroy();

    const timer = window.setTimeout(() => typer.in(), delayMs);

    return () => {
      window.clearTimeout(timer);
      typer.destroy();
    };
  }, [text, fps, cycles, cycleLength, variations, initVisible, delayMs, reduceMotion]);

  return (
    <span ref={ref} data-typer className={cn(className)} aria-hidden={ariaHidden}>
      {text}
    </span>
  );
}
