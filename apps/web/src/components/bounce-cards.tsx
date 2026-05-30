import { useState, useRef, useMemo } from "react";
import { motion } from "motion/react";

const DEFAULT_IMAGES: readonly string[] = [];
const DEFAULT_TRANSFORM_STYLES = [
  "rotate(10deg) translate(-170px)",
  "rotate(5deg) translate(-85px)",
  "rotate(-3deg)",
  "rotate(-10deg) translate(85px)",
  "rotate(2deg) translate(170px)",
] as const;

interface BounceCardsProps {
  readonly className?: string;
  readonly images?: readonly string[];
  readonly containerWidth?: number;
  readonly containerHeight?: number;
  readonly animationDelay?: number;
  readonly animationStagger?: number;
  readonly transformStyles?: readonly string[];
  readonly enableHover?: boolean;
  readonly cardSize?: number;
}

interface DecomposedTransform {
  readonly rotate: number;
  readonly x: number;
  readonly y: number;
}

function decomposeTransform(transformStr: string): DecomposedTransform {
  const rotateMatch = transformStr.match(/rotate\(([-\d.]+)deg\)/);
  const translateMatch = transformStr.match(/translate\(([-\d.]+)px\)/);
  const rotateDeg = rotateMatch ? Number.parseFloat(rotateMatch[1]) : 0;
  const translatePx = translateMatch ? Number.parseFloat(translateMatch[1]) : 0;
  const rad = (rotateDeg * Math.PI) / 180;
  return {
    rotate: rotateDeg,
    x: translatePx * Math.cos(rad),
    y: translatePx * Math.sin(rad),
  };
}

function decomposeWithOverrides(
  transformStr: string,
  overrides: { readonly rotateDeg?: number; readonly translateOffset?: number },
): DecomposedTransform {
  const rotateMatch = transformStr.match(/rotate\(([-\d.]+)deg\)/);
  const translateMatch = transformStr.match(/translate\(([-\d.]+)px\)/);
  const baseRotate = rotateMatch ? Number.parseFloat(rotateMatch[1]) : 0;
  const baseTranslate = translateMatch ? Number.parseFloat(translateMatch[1]) : 0;
  const rotateDeg = overrides.rotateDeg ?? baseRotate;
  const translatePx = baseTranslate + (overrides.translateOffset ?? 0);
  const rad = (rotateDeg * Math.PI) / 180;
  return {
    rotate: rotateDeg,
    x: translatePx * Math.cos(rad),
    y: translatePx * Math.sin(rad),
  };
}

const HOVER_PUSH_PX = 160;

function elasticOut(t: number): number {
  if (t === 0) return 0;
  if (t === 1) return 1;
  const period = 0.8;
  const s = period / 4;
  return 2 ** (-10 * t) * Math.sin(((t - s) * (2 * Math.PI)) / period) + 1;
}

function backOut(t: number): number {
  const s = 1.4;
  const c = t - 1;
  return c * c * ((s + 1) * c + s) + 1;
}

export default function BounceCards({
  className = "",
  images = DEFAULT_IMAGES,
  containerWidth = 400,
  containerHeight = 400,
  animationDelay = 0.5,
  animationStagger = 0.06,
  transformStyles = DEFAULT_TRANSFORM_STYLES,
  enableHover = false,
  cardSize = 200,
}: BounceCardsProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const entryDone = useRef(false);

  const baseTransforms = useMemo(
    () => transformStyles.map((t) => decomposeTransform(t ?? "none")),
    [transformStyles],
  );

  return (
    <div
      className={`relative flex items-center justify-center ${className}`}
      style={{ width: containerWidth, height: containerHeight }}
    >
      {images.map((src, idx) => {
        const base = baseTransforms[idx] ?? { rotate: 0, x: 0, y: 0 };
        const transformStr = transformStyles[idx] ?? "none";

        let target: DecomposedTransform;
        if (enableHover && hoveredIndex !== null) {
          if (idx === hoveredIndex) {
            target = decomposeWithOverrides(transformStr, { rotateDeg: 0 });
          } else {
            const offset = idx < hoveredIndex ? -HOVER_PUSH_PX : HOVER_PUSH_PX;
            target = decomposeWithOverrides(transformStr, { translateOffset: offset });
          }
        } else {
          target = base;
        }

        const isEntry = !entryDone.current;
        const distance = hoveredIndex !== null ? Math.abs(hoveredIndex - idx) : 0;

        const transition = isEntry
          ? {
              duration: 0.5,
              ease: elasticOut,
              delay: animationDelay + idx * animationStagger,
            }
          : {
              duration: 0.4,
              ease: backOut,
              delay: hoveredIndex !== null ? distance * 0.05 : 0,
            };

        return (
          <motion.div
            key={src}
            className="absolute aspect-square overflow-hidden"
            style={{
              width: cardSize,
              borderWidth: Math.round(cardSize * 0.04),
              borderColor: "white",
              borderStyle: "solid",
              borderRadius: Math.round(cardSize * 0.15),
              boxShadow: "0 4px 10px rgba(0, 0, 0, 0.2)",
            }}
            initial={{ scale: 0, rotate: base.rotate, x: base.x, y: base.y }}
            animate={{ scale: 1, rotate: target.rotate, x: target.x, y: target.y }}
            transition={transition}
            onAnimationComplete={
              idx === images.length - 1 && !entryDone.current
                ? () => {
                    entryDone.current = true;
                  }
                : undefined
            }
            onMouseEnter={enableHover ? () => setHoveredIndex(idx) : undefined}
            onMouseLeave={enableHover ? () => setHoveredIndex(null) : undefined}
          >
            <img className="w-full h-full object-cover object-top" src={src} alt={`card-${idx}`} />
          </motion.div>
        );
      })}
    </div>
  );
}
