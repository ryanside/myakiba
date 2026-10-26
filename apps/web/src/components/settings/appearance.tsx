import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { useTheme } from "next-themes";
import { useId } from "react";
import * as z from "zod";
import {
  CARD_IMAGE_CLASS_NAME,
  MediaImage,
  TILE_HOVER_CLASS_NAME,
  TILE_SURFACE_CLASS_NAME,
} from "@/components/media-tile";
import { Switch } from "@/components/ui/switch";
import { useMotionPreference, usePageBackgrounds } from "@/hooks/use-appearance";
import { cn } from "@/lib/utils";
import { SettingsGroup } from "./settings-group";
import { SettingsRow, useSettingAnchor } from "./settings-row";
import { ThemePreview } from "./theme-preview";
import type { Scheme } from "./theme-preview";

type PreviewLayer = { readonly scheme: Scheme; readonly half?: "start" | "end" };

const THEMES = [
  { value: "light", label: "Light", previews: [{ scheme: "light" }] },
  { value: "dark", label: "Dark", previews: [{ scheme: "dark" }] },
  {
    value: "system",
    label: "System",
    previews: [
      { scheme: "light", half: "start" },
      { scheme: "dark", half: "end" },
    ],
  },
] as const satisfies readonly {
  readonly value: string;
  readonly label: string;
  readonly previews: readonly PreviewLayer[];
}[];

const themeChoice = z.enum(["light", "dark", "system"]);

/** System draws the light app on the left and the dark app on the right, split on a slant. */
const HALF_CLIP = {
  start: "[clip-path:polygon(0_0,62%_0,38%_100%,0_100%)]",
  end: "[clip-path:polygon(62%_0,100%_0,100%_100%,38%_100%)]",
} as const;

export function Appearance() {
  return (
    <>
      <ThemeChoices />
      <SettingsGroup title="Effects">
        <PageBackgroundsRow />
        <ReduceMotionRow />
      </SettingsGroup>
    </>
  );
}

function ThemeChoices() {
  const { theme, setTheme } = useTheme();
  const { className: anchorClassName, ...anchor } = useSettingAnchor<HTMLDivElement>("theme");
  const value = themeChoice.safeParse(theme).data ?? "system";

  return (
    <SettingsGroup title="Theme" variant="cards">
      <div {...anchor} className={cn("rounded-[calc(var(--frame-radius)-5px)]", anchorClassName)}>
        <RadioGroup
          aria-label="Theme"
          value={value}
          onValueChange={(next) => {
            const parsed = themeChoice.safeParse(next);
            if (parsed.success) setTheme(parsed.data);
          }}
          className="grid grid-cols-3 gap-1"
        >
          {THEMES.map(({ value: choice, label, previews }) => (
            <Radio.Root
              key={choice}
              value={choice}
              className={cn(
                "group/theme flex flex-col rounded-2xl p-1.5 text-left",
                TILE_SURFACE_CLASS_NAME,
                TILE_HOVER_CLASS_NAME,
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring data-checked:ring-2 data-checked:ring-primary",
              )}
            >
              <MediaImage className={cn(CARD_IMAGE_CLASS_NAME, "aspect-[16/10] bg-sidebar")}>
                {previews.map((layer: PreviewLayer) => (
                  <ThemePreview
                    key={layer.scheme}
                    scheme={layer.scheme}
                    className={cn("absolute inset-0", layer.half && HALF_CLIP[layer.half])}
                  />
                ))}
              </MediaImage>
              <span className="flex items-center gap-2 px-1.5 pt-2.5 pb-1">
                <span className="flex size-4 shrink-0 items-center justify-center rounded-full border border-control-edge bg-control group-data-checked/theme:border-primary group-data-checked/theme:bg-primary">
                  <span className="size-1.5 rounded-full bg-primary-foreground opacity-0 group-data-checked/theme:opacity-100" />
                </span>
                <span className="text-sm font-medium">{label}</span>
              </span>
            </Radio.Root>
          ))}
        </RadioGroup>
      </div>
    </SettingsGroup>
  );
}

function PageBackgroundsRow() {
  const id = useId();
  const [showBackgrounds, setShowBackgrounds] = usePageBackgrounds();

  return (
    <SettingsRow setting="page-backgrounds" htmlFor={id} inline>
      <Switch id={id} checked={showBackgrounds} onCheckedChange={setShowBackgrounds} />
    </SettingsRow>
  );
}

function ReduceMotionRow() {
  const id = useId();
  const { device, reduce, setApp } = useMotionPreference();

  return (
    <SettingsRow
      setting="reduce-motion"
      htmlFor={id}
      inline
      status={
        device ? (
          <span className="text-xs text-muted-foreground">On in your device settings</span>
        ) : null
      }
    >
      <Switch id={id} checked={reduce} disabled={device} onCheckedChange={setApp} />
    </SettingsRow>
  );
}
