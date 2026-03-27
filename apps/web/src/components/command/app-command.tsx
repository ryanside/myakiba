import {
  ArrowRight01Icon,
  LibraryIcon,
  Loading03Icon,
  PackageIcon,
  SearchIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ImageThumbnail } from "@/components/ui/image-thumbnail";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import {
  APP_COMMAND_NAVIGATION_ITEMS,
  type AppNavigationItem,
  type AppNavigationTarget,
} from "@/lib/app-navigation";
import { searchCommandResults, type CommandSearchResults } from "@/queries/search";
import {
  LAUNCHABLE_SYNC_OPTIONS,
  SyncActionSheet,
  type LaunchableSyncType,
  type SyncLauncherOption,
} from "@/components/sync/sync-launcher";

const SYNC_TYPE_LABELS: Record<LaunchableSyncType, string> = {
  csv: "CSV",
  order: "Order",
  collection: "Collection",
};
const COMMAND_TOKEN_SPLIT_PATTERN = /[^a-z0-9]+/i;
const COMMAND_SEARCH_DEBOUNCE_MS = 250;
const EMPTY_COMMAND_SEARCH_RESULTS: CommandSearchResults = {
  orderMatches: [],
  itemMatches: [],
};

function getCommandTerms(value: string): readonly string[] {
  return value
    .toLowerCase()
    .split(COMMAND_TOKEN_SPLIT_PATTERN)
    .filter((term) => term.length > 0);
}

function matchesCommandQuery(label: string, keywords: readonly string[], query: string): boolean {
  if (query.length === 0) {
    return true;
  }

  const queryTerms = getCommandTerms(query);
  const haystackTerms = [label, ...keywords].flatMap((value) => getCommandTerms(value));

  return queryTerms.every((queryTerm) =>
    haystackTerms.some((haystackTerm) => haystackTerm.startsWith(queryTerm)),
  );
}

function useDebouncedValue(value: string, delayMs: number): string {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    if (value.length === 0) {
      setDebouncedValue(value);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [delayMs, value]);

  return debouncedValue;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  return (
    target.closest(
      "input, textarea, select, [contenteditable='true'], [role='textbox'], [role='combobox']",
    ) !== null
  );
}

function CommandLeadIcon({ icon }: { readonly icon: IconSvgElement }): React.JSX.Element {
  return (
    <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted ring-1 ring-foreground/10 shadow-sm">
      <HugeiconsIcon icon={icon} className="size-4 text-muted-foreground" />
    </div>
  );
}

function ActionCommandItem({
  value,
  title,
  subtitle,
  shortcut,
  leading,
  onSelect,
}: {
  readonly value: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly shortcut?: string;
  readonly leading: React.ReactNode;
  readonly onSelect: () => void;
}): React.JSX.Element {
  return (
    <CommandItem value={value} onSelect={onSelect} className="gap-3 py-2">
      {leading}
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{title}</div>
        {subtitle ? <div className="truncate text-xs text-muted-foreground">{subtitle}</div> : null}
      </div>
      {shortcut ? <CommandShortcut>{shortcut}</CommandShortcut> : null}
    </CommandItem>
  );
}

function LoadingCommandItem({ label }: { readonly label: string }): React.JSX.Element {
  return (
    <CommandItem value={label} disabled className="gap-3 py-2">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
        <HugeiconsIcon icon={Loading03Icon} className="size-4 animate-spin text-muted-foreground" />
      </div>
      <div className="text-sm text-muted-foreground">{label}</div>
    </CommandItem>
  );
}

function StatusCommandItem({
  title,
  subtitle,
}: {
  readonly title: string;
  readonly subtitle?: string;
}): React.JSX.Element {
  return (
    <CommandItem value={title} disabled className="gap-3 py-2">
      <CommandLeadIcon icon={SearchIcon} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-muted-foreground">{title}</div>
        {subtitle ? <div className="truncate text-xs text-muted-foreground">{subtitle}</div> : null}
      </div>
    </CommandItem>
  );
}

export function AppCommand(): React.JSX.Element {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [syncType, setSyncType] = useState<LaunchableSyncType | null>(null);
  const [inputValue, setInputValue] = useState("");
  const trimmedInputQuery = inputValue.trim();
  const debouncedInputQuery = useDebouncedValue(trimmedInputQuery, COMMAND_SEARCH_DEBOUNCE_MS);
  const normalizedInputQuery = trimmedInputQuery.toLowerCase();
  const normalizedDebouncedQuery = debouncedInputQuery.toLowerCase();
  const shouldShowSearchGroups = normalizedInputQuery.length > 0;
  const isSearchPending = shouldShowSearchGroups && trimmedInputQuery !== debouncedInputQuery;

  const visibleNavigationItems = useMemo<readonly AppNavigationItem[]>(() => {
    return APP_COMMAND_NAVIGATION_ITEMS.filter((item) =>
      matchesCommandQuery(item.title, item.keywords, normalizedInputQuery),
    );
  }, [normalizedInputQuery]);

  const visibleSyncItems = useMemo<readonly SyncLauncherOption[]>(() => {
    return LAUNCHABLE_SYNC_OPTIONS.filter((item) =>
      matchesCommandQuery(
        `${item.type} ${item.description}`,
        [...item.keywords, item.type],
        normalizedInputQuery,
      ),
    );
  }, [normalizedInputQuery]);

  const {
    data: { orderMatches, itemMatches } = EMPTY_COMMAND_SEARCH_RESULTS,
    isLoading: isSearchLoading,
    error: searchError,
  } = useQuery({
    queryKey: ["app-command", "search", normalizedDebouncedQuery],
    queryFn: () => searchCommandResults(debouncedInputQuery),
    enabled: normalizedDebouncedQuery.length > 0,
    staleTime: 30_000,
  });

  const closeCommand = (): void => {
    setOpen(false);
    setInputValue("");
  };

  const handleDialogChange = (nextOpen: boolean): void => {
    if (nextOpen) {
      setOpen(true);
    } else {
      closeCommand();
    }
  };

  const handleNavigate = (to: AppNavigationTarget): void => {
    closeCommand();
    void navigate({ to });
  };

  const handleSyncAction = (nextSyncType: LaunchableSyncType): void => {
    closeCommand();
    setSyncType(nextSyncType);
  };

  const handleOrderOpen = (orderId: string): void => {
    closeCommand();
    void navigate({
      to: "/orders/$id",
      params: { id: orderId },
    });
  };

  const handleItemOpen = (itemId: string): void => {
    closeCommand();
    void navigate({
      to: "/items/$id",
      params: { id: itemId },
    });
  };

  const handleViewAllOrders = (): void => {
    closeCommand();
    void navigate({
      to: "/orders",
      search: {
        search: trimmedInputQuery,
        offset: 0,
      },
    });
  };

  const handleViewAllItems = (): void => {
    closeCommand();
    void navigate({
      to: "/collection",
      search: {
        search: trimmedInputQuery,
        offset: 0,
      },
    });
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "k" || (!event.metaKey && !event.ctrlKey) || event.shiftKey) {
        return;
      }

      if (!open && isTypingTarget(event.target)) {
        return;
      }

      event.preventDefault();
      setOpen((currentOpen) => !currentOpen);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const showNavigationGroup = visibleNavigationItems.length > 0;
  const showSyncGroup = visibleSyncItems.length > 0;
  const showSearchGroups = shouldShowSearchGroups;
  const hasVisibleResults = showNavigationGroup || showSyncGroup || showSearchGroups;

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="min-w-0 justify-between gap-2 text-muted-foreground sm:min-w-48"
        onClick={() => setOpen(true)}
      >
        <span className="flex min-w-0 items-center gap-2">
          <HugeiconsIcon icon={SearchIcon} className="size-4 shrink-0" />
          <span className="truncate">Search</span>
        </span>
        <CommandShortcut>⌘K</CommandShortcut>
      </Button>

      <CommandDialog
        open={open}
        onOpenChange={handleDialogChange}
        title="Global Command Palette"
        description="Navigate pages, launch sync actions, and search orders or items."
        className="sm:max-w-2xl"
      >
        <Command shouldFilter={false} className="**:data-[selected=true]:bg-muted/80">
          <CommandInput
            value={inputValue}
            onValueChange={setInputValue}
            placeholder="Search pages, actions, orders, or items..."
          />
          <CommandList className="max-h-104">
            {!hasVisibleResults ? <CommandEmpty>No results found.</CommandEmpty> : null}

            {showNavigationGroup ? (
              <CommandGroup heading="Navigate">
                {visibleNavigationItems.map((item) => (
                  <ActionCommandItem
                    key={item.to}
                    value={`navigate-${item.to}`}
                    title={item.title}
                    subtitle={`Open ${item.title}`}
                    shortcut="Page"
                    leading={<CommandLeadIcon icon={item.icon} />}
                    onSelect={() => handleNavigate(item.to)}
                  />
                ))}
              </CommandGroup>
            ) : null}

            {showNavigationGroup && (showSyncGroup || showSearchGroups) ? (
              <CommandSeparator />
            ) : null}

            {showSyncGroup ? (
              <CommandGroup heading="Actions">
                {visibleSyncItems.map((item) => (
                  <ActionCommandItem
                    key={item.type}
                    value={`sync-${item.type}`}
                    title={`Sync ${SYNC_TYPE_LABELS[item.type]}`}
                    subtitle={item.description}
                    shortcut="Action"
                    leading={<CommandLeadIcon icon={item.icon} />}
                    onSelect={() => handleSyncAction(item.type)}
                  />
                ))}
              </CommandGroup>
            ) : null}

            {showSyncGroup && showSearchGroups ? <CommandSeparator /> : null}

            {showSearchGroups ? (
              <CommandGroup heading="Orders">
                {isSearchPending || isSearchLoading ? (
                  <LoadingCommandItem label="Searching orders..." />
                ) : null}
                {!isSearchPending && searchError ? (
                  <StatusCommandItem
                    title="Could not search orders"
                    subtitle={searchError instanceof Error ? searchError.message : undefined}
                  />
                ) : null}
                {!isSearchPending &&
                !isSearchLoading &&
                !searchError &&
                orderMatches.length === 0 ? (
                  <StatusCommandItem title={`No orders matched "${trimmedInputQuery}"`} />
                ) : null}
                {!isSearchPending
                  ? orderMatches.map((order) => (
                      <ActionCommandItem
                        key={order.id}
                        value={`order-${order.id}`}
                        title={order.title}
                        subtitle={`Open order ${order.id}`}
                        shortcut="Order"
                        leading={
                          <ImageThumbnail
                            images={order.itemImages}
                            title={order.title}
                            fallbackIcon={<HugeiconsIcon icon={PackageIcon} className="size-4" />}
                            className="size-8 rounded-md"
                          />
                        }
                        onSelect={() => handleOrderOpen(order.id)}
                      />
                    ))
                  : null}
                <ActionCommandItem
                  value={`orders-all-${trimmedInputQuery}`}
                  title={`View all orders for "${trimmedInputQuery}"`}
                  subtitle="Open the full orders page with this query"
                  shortcut="/orders"
                  leading={<CommandLeadIcon icon={ArrowRight01Icon} />}
                  onSelect={handleViewAllOrders}
                />
              </CommandGroup>
            ) : null}

            {showSearchGroups ? <CommandSeparator /> : null}

            {showSearchGroups ? (
              <CommandGroup heading="Items">
                {isSearchPending || isSearchLoading ? (
                  <LoadingCommandItem label="Searching items..." />
                ) : null}
                {!isSearchPending && searchError ? (
                  <StatusCommandItem
                    title="Could not search items"
                    subtitle={searchError instanceof Error ? searchError.message : undefined}
                  />
                ) : null}
                {!isSearchPending &&
                !isSearchLoading &&
                !searchError &&
                itemMatches.length === 0 ? (
                  <StatusCommandItem title={`No items matched "${trimmedInputQuery}"`} />
                ) : null}
                {!isSearchPending
                  ? itemMatches.map((item) => (
                      <ActionCommandItem
                        key={item.itemId}
                        value={`item-${item.itemId}`}
                        title={item.itemTitle}
                        subtitle={
                          item.itemExternalId
                            ? `MFC #${item.itemExternalId}${item.itemCategory ? ` • ${item.itemCategory}` : ""}`
                            : (item.itemCategory ?? "Open item details")
                        }
                        shortcut="Item"
                        leading={
                          <ImageThumbnail
                            images={item.itemImage ? [item.itemImage] : []}
                            title={item.itemTitle}
                            fallbackIcon={<HugeiconsIcon icon={LibraryIcon} className="size-4" />}
                            className="size-8 rounded-md"
                          />
                        }
                        onSelect={() => handleItemOpen(item.itemId)}
                      />
                    ))
                  : null}
                <ActionCommandItem
                  value={`items-all-${trimmedInputQuery}`}
                  title={`View all items for "${trimmedInputQuery}"`}
                  subtitle="Open the collection page with this query"
                  shortcut="/collection"
                  leading={<CommandLeadIcon icon={ArrowRight01Icon} />}
                  onSelect={handleViewAllItems}
                />
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </CommandDialog>

      <SyncActionSheet syncType={syncType} onSyncTypeChange={setSyncType} side="right" />
    </>
  );
}
