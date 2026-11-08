import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { useTheme } from "next-themes";
import { useId } from "react";
import * as z from "zod";
import { CARD_IMAGE_CLASS_NAME, MediaImage, IMAGE_HOVER_CLASS_NAME } from "@/components/media-tile";
import { Switch } from "@/components/ui/switch";
import { useMotionPreference, usePageBackgrounds } from "@/hooks/use-appearance";
import { THEME_OPTIONS } from "@/lib/theme-options";
import type { ThemeValue } from "@/lib/theme-options";
import { cn } from "@/lib/utils";
import { SettingsGroup } from "./settings-group";
import { SettingsRow, useSettingAnchor } from "./settings-row";
import { ThemePreview } from "./theme-preview";
import type { Scheme } from "./theme-preview";

type PreviewLayer = { readonly scheme: Scheme; readonly half?: "start" | "end" };

const THEME_PREVIEWS = {
  light: [{ scheme: "light" }],
  dark: [{ scheme: "dark" }],
  system: [
    { scheme: "light", half: "start" },
    { scheme: "dark", half: "end" },
  ],
} satisfies Record<ThemeValue, readonly PreviewLayer[]>;

const themeChoice = z.enum(THEME_OPTIONS.map(({ value }) => value));

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
          className="grid grid-cols-3 gap-3"
        >
          {THEME_OPTIONS.map(({ value: choice, label }) => (
            <Radio.Root
              key={choice}
              value={choice}
              className={cn(
                "group/item flex flex-col rounded-2xl text-left",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              )}
            >
              <MediaImage
                className={cn(
                  CARD_IMAGE_CLASS_NAME,
                  IMAGE_HOVER_CLASS_NAME,
                  "aspect-[16/10] bg-sidebar",
                )}
              >
                {THEME_PREVIEWS[choice].map((layer: PreviewLayer) => (
                  <ThemePreview
                    key={layer.scheme}
                    scheme={layer.scheme}
                    className={cn("absolute inset-0", layer.half && HALF_CLIP[layer.half])}
                  />
                ))}
              </MediaImage>
              <span className="flex items-center gap-2 pt-2.5">
                <span className="flex size-4 shrink-0 items-center justify-center rounded-full border border-input color-motion dark:bg-input/30 group-data-checked/item:border-primary group-data-checked/item:bg-primary dark:group-data-checked/item:bg-primary">
                  <span className="size-1.5 scale-(--tick-from) rounded-full bg-primary-foreground opacity-0 transition-[opacity,scale] duration-100 ease-out group-data-checked/item:scale-100 group-data-checked/item:opacity-100 group-data-checked/item:duration-150" />
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
