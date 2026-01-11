import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

interface TextLoopProps {
  preText: string;
  texts: string[];
  interval?: number;
}

export function TextLoop({ preText, texts, interval = 3000 }: TextLoopProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (texts.length <= 1) return;

    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % texts.length);
    }, interval);

    return () => clearInterval(timer);
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
        {/* Visible animated text */}
        <AnimatePresence mode="wait">
          <motion.span
            key={currentIndex}
            className="inline-block font-medium text-black dark:text-white/85 whitespace-nowrap"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{
              duration: 0.3,
              ease: [0.4, 0, 0.2, 1],
            }}
          >
            {texts[currentIndex]}
          </motion.span>
        </AnimatePresence>
      </span>
    </span>
  );
}
