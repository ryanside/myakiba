import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

interface TextLoopProps {
  preText: string;
  texts: string[];
  interval?: number;
}

export function TextLoop({ preText, texts, interval = 3000 }: TextLoopProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [displayWidth, setDisplayWidth] = useState<number | "auto">("auto");
  const [widths, setWidths] = useState<Map<number, number>>(new Map());
  const measureRef = useRef<HTMLSpanElement>(null);

  // Pre-measure all text widths on mount
  useEffect(() => {
    if (!measureRef.current) return;

    const newWidths = new Map<number, number>();
    const originalText = measureRef.current.textContent;

    texts.forEach((text, index) => {
      measureRef.current!.textContent = text;
      const width = measureRef.current!.offsetWidth;
      if (width > 0) {
        newWidths.set(index, width);
      }
    });

    // Restore original text if needed
    if (originalText) {
      measureRef.current.textContent = originalText;
    }

    setWidths(newWidths);
    // Set initial width
    const initialWidth = newWidths.get(0);
    if (initialWidth) {
      setDisplayWidth(initialWidth);
    }
  }, [texts]);

  useEffect(() => {
    if (texts.length <= 1) return;

    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % texts.length);
    }, interval);

    return () => clearInterval(timer);
  }, [texts.length, interval]);

  // Handle width changes: use max width during transition, then animate to exact width
  useEffect(() => {
    const newWidth = widths.get(currentIndex);
    if (newWidth === undefined) return;

    // Immediately expand to max of current and new width to prevent cut-off
    setDisplayWidth((current) => {
      if (current === "auto") return newWidth;
      if (typeof current === "number") {
        return Math.max(current, newWidth);
      }
      return newWidth;
    });

    // After exit animation completes, animate to exact new width
    const timeout = setTimeout(() => {
      setDisplayWidth(newWidth);
    }, 300); // Match exit animation duration

    return () => clearTimeout(timeout);
  }, [currentIndex, widths]);

  const currentText = texts[currentIndex] ?? texts[0] ?? "";

  return (
    <span className="relative inline-flex items-center gap-1">
      {/* Hidden element for measuring text widths */}
      <span
        ref={measureRef}
        className="absolute left-0 top-0 opacity-0 pointer-events-none font-medium text-black dark:text-white whitespace-nowrap"
        aria-hidden="true"
      >
        {texts[0]}
      </span>
      <span className="font-medium text-muted-foreground">
        {preText}
      </span>
      <motion.span
        className="inline-block overflow-hidden whitespace-nowrap"
        animate={{
          width: displayWidth === "auto" ? "auto" : `${displayWidth}px`,
        }}
        transition={{
          duration: 0.4,
          ease: [0.4, 0, 0.2, 1],
        }}
      >
        <AnimatePresence mode="wait">
          <motion.span
            key={currentIndex}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{
              duration: 0.3,
              ease: [0.4, 0, 0.2, 1],
            }}
            className="inline-block font-medium text-black dark:text-white/85 whitespace-nowrap"
          >
            {currentText}
          </motion.span>
        </AnimatePresence>
      </motion.span>
    </span>
  );
}
