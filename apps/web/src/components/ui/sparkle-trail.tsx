import { useEffect, useState } from "react";

const SPARKLE_CHARS = [
  "\u22C6",
  "\u02D9",
  "\u27E1",
  "\u22C6",
  "\u02DA",
  "\u22B9",
  "\u208A",
  "\u27E1",
] as const;
const SPARKLE_STEP_MS = 100;
const SPARKLE_PAUSE_MS = 1000;

export function SparkleTrail() {
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    const allVisible = visibleCount > SPARKLE_CHARS.length;
    const delay = allVisible ? SPARKLE_PAUSE_MS : SPARKLE_STEP_MS;

    const id = setTimeout(() => {
      setVisibleCount((prev) => (prev > SPARKLE_CHARS.length ? 0 : prev + 1));
    }, delay);

    return () => clearTimeout(id);
  }, [visibleCount]);

  return (
    <span
      className="ml-auto inline-flex gap-px text-[0.5625rem] text-foreground/70"
      aria-hidden="true"
    >
      {SPARKLE_CHARS.map((char, i) => (
        <span
          key={i}
          className={`transition-all duration-300 ${
            i < visibleCount ? "scale-100 opacity-100" : "scale-0 opacity-0"
          }`}
        >
          {char}
        </span>
      ))}
    </span>
  );
}
