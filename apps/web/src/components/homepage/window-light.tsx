import { motion } from "motion/react";
import akihabara from "@/assets/backgrounds/11-akihabara-bright-bitgrain.webp";
import collectionRoom from "@/assets/backgrounds/02-collection-room-bitgrain.webp";
import nightCalendar from "@/assets/backgrounds/17-night-calendar-bitgrain.webp";
import blueGachapon from "@/assets/backgrounds/43-blue-gachapon-row-bitgrain.webp";
import blossomsAndWires from "@/assets/backgrounds/56-blossoms-and-wires-bitgrain.webp";
import { useMotionPreference } from "@/hooks/use-appearance";
import { cn } from "@/lib/utils";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

const SCENES = {
  dashboard: akihabara,
  collection: collectionRoom,
  orders: nightCalendar,
  analytics: blossomsAndWires,
  expenses: blueGachapon,
} as const;

const SPILL_TONE = "opacity-[.5] dark:opacity-[.22]";

const SPILL_MASK =
  "[mask-image:linear-gradient(to_bottom,transparent,#000_22%,#0008_60%,transparent),linear-gradient(to_right,transparent,#000_9%,#000_91%,transparent)] [mask-composite:intersect]";

const PLACE = cn(
  "pointer-events-none absolute -inset-x-24 -top-6 -z-10 aspect-[16/7] overflow-hidden",
  SPILL_MASK,
);

const PICTURE =
  "size-full object-cover object-[50%_43%] saturate-[.85] [image-rendering:pixelated]";

export function SceneSpill({
  page,
  hero = false,
}: {
  readonly page: keyof typeof SCENES;
  readonly hero?: boolean;
}) {
  const { reduce } = useMotionPreference();

  if (hero) {
    return (
      <div aria-hidden className={cn(PLACE, "sm:-top-8")}>
        <img
          src={SCENES[page]}
          alt=""
          width={467}
          height={311}
          fetchPriority="high"
          decoding="async"
          className={cn(PICTURE, "opacity-[.5] dark:opacity-[.28]")}
        />
      </div>
    );
  }
  return (
    <motion.div
      aria-hidden
      className={cn(PLACE, "md:-top-8")}
      initial={reduce ? false : { opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true, margin: "0px 0px -15% 0px" }}
      transition={{ duration: 0.28, ease: EASE_OUT }}
    >
      <img
        src={SCENES[page]}
        alt=""
        width={467}
        height={311}
        loading="lazy"
        decoding="async"
        className={cn(PICTURE, SPILL_TONE)}
      />
    </motion.div>
  );
}
