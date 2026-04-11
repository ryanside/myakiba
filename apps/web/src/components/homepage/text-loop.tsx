import { useEffect, useState } from "react";

interface TextLoopProps {
  readonly preText: string;
  readonly texts: readonly string[];
  interval?: number;
}

export function TextLoop({ preText, texts, interval = 3000 }: TextLoopProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFading, setIsFading] = useState(false);

  useEffect(() => {
    if (texts.length <= 1) return;

    const fadeDurationMs = 200;
    let switchTimer: number | undefined;

    const timer = window.setInterval(() => {
      setIsFading(true);
      switchTimer = window.setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % texts.length);
        setIsFading(false);
      }, fadeDurationMs);
    }, interval);

    return () => {
      window.clearInterval(timer);
      if (switchTimer !== undefined) window.clearTimeout(switchTimer);
    };
  }, [texts.length, interval]);

  return (
    <span className="inline-flex items-center gap-1">
      <span className="font-medium text-muted-foreground">{preText}</span>
      <span className="relative inline-block">
        {/* Invisible texts that size the container - all overlaid to determine max width */}
        {texts.map((text, i) => (
          <span
            key={i}
            className="absolute invisible whitespace-nowrap font-medium"
            aria-hidden="true"
          >
            {text}
          </span>
        ))}
        <span
          className={`inline-block whitespace-nowrap font-medium text-black transition-opacity duration-200 dark:text-white/85 ${
            isFading ? "opacity-0" : "opacity-100"
          }`}
        >
          {texts[currentIndex]}
        </span>
      </span>
    </span>
  );
}
