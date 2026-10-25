import { useLocation } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { SETTINGS, settingAnchor } from "./settings-registry";
import type { SettingId } from "./settings-registry";
import "./settings.css";

const ANCHOR_CLASS_NAME =
  "settings-anchor focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring";

/**
 * Props for the element a search result jumps to. When the URL hash names the setting,
 * the element takes focus and flashes.
 */
export function useSettingAnchor<T extends HTMLElement>(setting: SettingId | undefined) {
  const isTarget = useLocation({
    select: (location) => setting !== undefined && location.hash === settingAnchor(setting),
  });
  const ref = useRef<T>(null);

  useEffect(() => {
    if (isTarget) ref.current?.focus({ preventScroll: true });
  }, [isTarget]);

  return setting === undefined
    ? {}
    : {
        ref,
        id: settingAnchor(setting),
        tabIndex: -1,
        "data-target": isTarget || undefined,
        className: ANCHOR_CLASS_NAME,
      };
}

type SettingsRowProps = {
  readonly htmlFor?: string;
  readonly status?: ReactNode;
  /** Keeps a small control, like a switch, beside the text on a phone too. */
  readonly inline?: boolean;
  readonly children: ReactNode;
} & (
  | { readonly setting: SettingId; readonly title?: never; readonly description?: never }
  | { readonly setting?: never; readonly title: string; readonly description?: string }
);

export function SettingsRow({
  setting,
  htmlFor,
  status,
  inline = false,
  children,
  ...text
}: SettingsRowProps) {
  const entry = setting === undefined ? undefined : SETTINGS[setting];
  const title = entry?.title ?? text.title;
  const description = entry?.description ?? text.description;
  const { className: anchorClassName, ...anchor } = useSettingAnchor<HTMLDivElement>(setting);

  return (
    <div
      {...anchor}
      className={cn(
        "flex gap-3 px-4 py-3.5 sm:items-center sm:justify-between sm:gap-8",
        inline ? "items-center justify-between gap-6" : "flex-col sm:flex-row",
        anchorClassName,
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
          {htmlFor ? (
            <label className="text-sm font-medium" htmlFor={htmlFor}>
              {title}
            </label>
          ) : (
            <div className="text-sm font-medium">{title}</div>
          )}
          {status}
        </div>
        {description ? (
          <p className="text-pretty text-[13px] leading-snug text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      <div
        className={cn(
          "flex shrink-0 flex-col gap-2 sm:w-auto sm:max-w-lg sm:items-end",
          inline ? "items-end" : "w-full items-stretch",
        )}
      >
        {children}
      </div>
    </div>
  );
}
