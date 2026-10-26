import { ArrowTurnBackwardIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { VIEW_OPTIONS } from "@/components/ui/view-toggle";
import type { ViewMode } from "@/components/ui/view-toggle";
import { removeLocalStorage, useHasLocalStorage, useLocalStorage } from "@/hooks/use-local-storage";
import { TABLE_LAYOUTS, VIEW_PREFERENCES } from "@/lib/layout-preferences";
import { SettingsGroup } from "./settings-group";
import { SETTINGS } from "./settings-registry";
import type { SettingId } from "./settings-registry";
import { SettingsRow } from "./settings-row";

const VIEW_ROWS = [
  { setting: "view-collection", page: "collection" },
  { setting: "view-orders", page: "orders" },
  { setting: "view-wishlist", page: "wishlist" },
  { setting: "view-lists", page: "lists" },
  { setting: "view-item-database", page: "itemDatabase" },
] as const satisfies readonly {
  readonly setting: SettingId;
  readonly page: keyof typeof VIEW_PREFERENCES;
}[];

const TABLE_ROWS = [
  { setting: "table-collection", keys: Object.values(TABLE_LAYOUTS.collection) },
  { setting: "table-orders", keys: Object.values(TABLE_LAYOUTS.orders) },
  { setting: "table-order-items", keys: Object.values(TABLE_LAYOUTS.orderItems) },
] as const satisfies readonly { readonly setting: SettingId; readonly keys: readonly string[] }[];

export function Layout() {
  return (
    <>
      <SettingsGroup title="Default views">
        {VIEW_ROWS.map((row) => (
          <ViewRow key={row.setting} {...row} />
        ))}
      </SettingsGroup>
      <SettingsGroup title="Tables">
        {TABLE_ROWS.map((row) => (
          <TableRow key={row.setting} {...row} />
        ))}
      </SettingsGroup>
    </>
  );
}

function ViewRow({ setting, page }: (typeof VIEW_ROWS)[number]) {
  const { key, modes, fallback, schema } = VIEW_PREFERENCES[page];
  const [view, setView] = useLocalStorage<ViewMode>(key, fallback, schema);

  return (
    <SettingsRow setting={setting}>
      <ToggleGroup
        aria-label={`${SETTINGS[setting].title} view`}
        variant="outline"
        value={[view]}
        onValueChange={(next) => {
          const mode = modes.find((candidate) => candidate === next[0]);
          if (mode) setView(mode);
        }}
        className="w-full sm:w-auto [&>*]:flex-1 sm:[&>*]:flex-none"
      >
        {modes.map((mode) => (
          <ToggleGroupItem key={mode} value={mode} className="gap-1.5 px-2.5">
            <HugeiconsIcon
              icon={VIEW_OPTIONS[mode].icon}
              strokeWidth={2}
              className="max-sm:hidden"
              aria-hidden="true"
            />
            {VIEW_OPTIONS[mode].name}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </SettingsRow>
  );
}

function TableRow({ setting, keys }: (typeof TABLE_ROWS)[number]) {
  const isCustomized = useHasLocalStorage(keys);
  const { title } = SETTINGS[setting];

  return (
    <SettingsRow
      setting={setting}
      inline
      status={
        isCustomized ? null : <span className="text-xs text-muted-foreground">Default layout</span>
      }
    >
      <Button
        variant="outline"
        size="sm"
        disabled={!isCustomized}
        onClick={() => {
          const restore = removeLocalStorage(keys);
          const toastId = toast.add({
            type: "success",
            title: `${title} reset`,
            description: "Its columns are back to how myakiba sets them up.",
            actionProps: {
              children: "Undo",
              onClick() {
                toast.close(toastId);
                restore();
              },
            },
          });
        }}
      >
        <HugeiconsIcon icon={ArrowTurnBackwardIcon} data-icon="inline-start" aria-hidden="true" />
        Reset
      </Button>
    </SettingsRow>
  );
}
