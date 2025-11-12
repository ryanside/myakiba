import {
  ChartNoAxesCombined,
  ChartNoAxesGantt,
  Home,
  Images,
  Search,
  Settings,
  Package,
  User,
} from "lucide-react";

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
import { useEffect, useState } from "react";
import { client } from "@/lib/hono-client";
import { useQuery } from "@tanstack/react-query";
import { DebouncedInput } from "../debounced-input";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "../ui/button";
import { Link } from "@tanstack/react-router";
import { getRecentItems } from "@/lib/recent-items";

export function SearchCommand() {
  const [search, setSearch] = useState<string>("");
  const [open, setOpen] = useState(false);
  const [recentItems, setRecentItems] = useState(getRecentItems());

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  // Refresh recent items when dialog opens
  useEffect(() => {
    if (open) {
      setRecentItems(getRecentItems());
    }
  }, [open]);

  async function getSearchResults({ search }: { search: string }) {
    const response = await client.api.search.$get({
      query: { search },
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || `HTTP ${response.status}`);
    }
    return response.json();
  }

  const { data } = useQuery({
    queryKey: ["search", search],
    queryFn: () => getSearchResults({ search }),
    enabled: search.length > 0,
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="size-7"
        onClick={() => setOpen(true)}
      >
        <Search className="h-4 w-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className={"overflow-hidden p-0 shadow-lg"}>
          <DialogTitle className="hidden" />
          <Command
            shouldFilter={false}
            className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5"
          >
            <DebouncedInput
              value={search}
              onChange={(value) => setSearch(value.toString())}
              placeholder="Search by title..."
              debounce={200}
              isCommandInput
            />
            {search.length > 0 && data && (
              <CommandList>
                <CommandGroup heading="Orders">
                  <CommandEmpty>No orders found.</CommandEmpty>
                  {data.searchData.orderResults.map((order) => (
                    <Link to={`/orders/$id`} params={{ id: order.orderId }}>
                      <CommandItem
                        key={order.orderId}
                        value={order.orderId}
                        onSelect={() => setOpen(false)}
                      >
                        <Package />
                        <span>{order.orderTitle}</span>
                      </CommandItem>
                    </Link>
                  ))}
                </CommandGroup>
                <CommandGroup heading="Collection">
                  <CommandEmpty>No items found.</CommandEmpty>
                  {data.searchData.collectionResults.map((collection) => (
                    <Link
                      to={`/items/$id`}
                      params={{ id: collection.itemId.toString() }}
                    >
                      <CommandItem
                        key={collection.collectionId}
                        value={collection.collectionId}
                        onSelect={() => setOpen(false)}
                      >
                        <Images />
                        <span>{collection.itemTitle}</span>
                      </CommandItem>
                    </Link>
                  ))}
                </CommandGroup>
              </CommandList>
            )}
            {search.length === 0 && recentItems.length > 0 && (
              <CommandList>
                <CommandGroup heading="Recent">
                  {recentItems.map((item) => (
                    <Link
                      key={`${item.type}-${item.id}`}
                      to={item.type === "order" ? `/orders/$id` : `/items/$id`}
                      params={{ id: item.id }}
                    >
                      <CommandItem
                        value={item.id}
                        onSelect={() => setOpen(false)}
                      >
                        {item.type === "order" ? <Package /> : <Images />}
                        <span>{item.title}</span>
                      </CommandItem>
                    </Link>
                  ))}
                </CommandGroup>
              </CommandList>
            )}
            {search.length === 0 && recentItems.length === 0 && (
              <CommandList>
                <CommandGroup heading="Recent">
                  <CommandEmpty>No recent orders or items found.</CommandEmpty>
                </CommandGroup>
              </CommandList>
            )}
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
