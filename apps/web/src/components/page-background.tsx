import { useMatches } from "@tanstack/react-router";
import { getPageBackground } from "@/lib/page-background";
import "./page-background.css";

type BackgroundPreset = "panorama" | "canopy" | "vignette";

export function PageBackground({ preset = "panorama" }: { preset?: BackgroundPreset }) {
  const pathname = useMatches({
    select: (matches) => {
      const match = matches.at(-1);
      return match?.status === "success" ? match.pathname : "";
    },
  });
  const image = getPageBackground(pathname);
  if (!image) return null;

  return (
    <div className="page-background" data-preset={preset} aria-hidden="true">
      <img src={image} alt="" />
    </div>
  );
}
