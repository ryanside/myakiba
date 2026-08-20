import { cn } from "@/lib/utils";

type FeatureSplitProps = {
  readonly appImage: string;
  readonly appImageAlt: string;
  readonly backgroundCrop: {
    readonly scale: number;
    readonly x: number;
    readonly y: number;
  };
  readonly bracketSide: "left" | "right";
  readonly description: string;
  readonly isDark: boolean;
  readonly mediaSide: "left" | "right";
  readonly title: string;
};

export function FeatureSplit({
  appImage,
  appImageAlt,
  backgroundCrop,
  bracketSide,
  description,
  isDark,
  mediaSide,
  title,
}: FeatureSplitProps) {
  const theme = isDark ? "dark" : "light";

  return (
    <article className="grid min-h-[28rem] grid-cols-1 min-[901px]:grid-cols-2">
      <div
        className={cn(
          "flex min-w-0 items-center py-10 max-[901px]:pt-0 max-[901px]:pb-10",
          mediaSide === "right"
            ? "min-[901px]:pr-[clamp(2.5rem,5vw,4rem)]"
            : "min-[901px]:col-start-2 min-[901px]:row-start-1 min-[901px]:pl-[clamp(2.5rem,5vw,4rem)]",
        )}
      >
        <div className="w-full max-w-md">
          <h2 className="max-w-[20ch] sm:max-w-[21ch] text-balance text-2xl leading-[1.15] font-medium tracking-tight">
            {title}
          </h2>
          <p className="mt-3 max-w-lg text-balance text-[15px] leading-normal text-muted-foreground">
            {description}
          </p>
        </div>
      </div>

      <div
        className={cn(
          "relative isolate min-w-0 overflow-hidden rounded-lg bg-muted ring-1 ring-foreground/10 max-[901px]:aspect-907/627",
          mediaSide === "left" && "min-[901px]:col-start-1 min-[901px]:row-start-1",
        )}
      >
        <div
          aria-hidden="true"
          className="absolute bottom-0 overflow-hidden"
          style={{
            left: `${backgroundCrop.x}%`,
            top: `${backgroundCrop.y}%`,
            width: `${backgroundCrop.scale}%`,
          }}
        >
          <img
            alt=""
            className="block size-full max-w-none object-cover select-none"
            draggable={false}
            loading="lazy"
            src={`/hero-bg-${theme}.webp`}
          />
        </div>
        <div
          className="absolute top-[7%] bottom-[7%] left-[5%] z-10 w-[90%] overflow-hidden rounded-lg bg-card shadow-[0_12px_28px_oklch(0_0_0/0.45)] ring-1 ring-foreground/10 max-[901px]:top-1/2 max-[901px]:bottom-auto max-[901px]:aspect-2992/1788 max-[901px]:h-auto max-[901px]:-translate-y-1/2 min-[901px]:data-[bracket-side=left]:right-0 min-[901px]:data-[bracket-side=left]:left-auto min-[901px]:data-[bracket-side=left]:rounded-r-none min-[901px]:data-[bracket-side=right]:left-0 min-[901px]:data-[bracket-side=right]:rounded-l-none"
          data-bracket-side={bracketSide}
        >
          <img
            alt={appImageAlt}
            className={cn(
              "absolute top-0 block size-full max-w-none select-none object-cover object-center max-[901px]:object-contain",
              bracketSide === "left"
                ? "min-[901px]:object-left-top"
                : "min-[901px]:object-right-top",
            )}
            draggable={false}
            height={1788}
            loading="lazy"
            src={`/${appImage}-${theme}.webp`}
            width={2992}
          />
        </div>
      </div>
    </article>
  );
}
