import { type CSSProperties, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type BannerVariant = "rainbow" | "normal";
type BannerProps = HTMLAttributes<HTMLDivElement> & {
  /**
   * @defaultValue 3rem
   */
  readonly height?: string;

  /**
   * @defaultValue 'normal'
   */
  readonly variant?: BannerVariant;

  /**
   * For rainbow variant only, customise the colors
   */
  readonly rainbowColors?: readonly string[];

  /**
   * Change Fumadocs layout styles
   *
   * @defaultValue true
   */
  readonly changeLayout?: boolean;
};

const DEFAULT_RAINBOW_COLORS = [
  "rgba(0,149,255,0.56)",
  "rgba(231,77,255,0.77)",
  "rgba(255,0,0,0.73)",
  "rgba(131,255,166,0.66)",
] as const;

export function Banner({
  variant = "normal",
  changeLayout = true,
  height = "3rem",
  rainbowColors = DEFAULT_RAINBOW_COLORS,
  className,
  children,
  style,
  ...props
}: BannerProps) {
  const bannerStyle: CSSProperties = {
    ...style,
    height,
  };

  return (
    <div
      {...props}
      className={cn(
        "sticky top-0 z-40 flex flex-row items-center justify-center px-4 text-center text-sm font-medium",
        variant === "normal" && "bg-fd-secondary",
        variant === "rainbow" && "bg-fd-background",
        className,
      )}
      style={bannerStyle}
    >
      {changeLayout ? <style>{`:root { --fd-banner-height: ${height}; }`}</style> : null}
      {variant === "rainbow"
        ? flow({
            colors: rainbowColors,
          })
        : null}
      {children}
    </div>
  );
}

const maskImage =
  "linear-gradient(to bottom,white,transparent), radial-gradient(circle at top center, white, transparent)";

function flow({ colors }: { readonly colors: readonly string[] }) {
  const backgroundStyle: CSSProperties = {
    maskImage,
    maskComposite: "intersect",
    animation: "fd-moving-banner 20s linear infinite",
    backgroundImage: `repeating-linear-gradient(70deg, ${[...colors, colors[0]].map((color, i) => `${color} ${(i * 50) / colors.length}%`).join(", ")})`,
    backgroundSize: "200% 100%",
    filter: "saturate(2)",
  };

  return (
    <>
      <div className="absolute inset-0 z-[-1]" style={backgroundStyle} />
      <style>
        {`@keyframes fd-moving-banner {
            from { background-position: 0% 0;  }
            to { background-position: 100% 0;  }
         }`}
      </style>
    </>
  );
}
