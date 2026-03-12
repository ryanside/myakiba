import { HugeiconsIcon } from "@hugeicons/react";
import { Image02Icon, Loading03Icon, PackageIcon, Search01Icon } from "@hugeicons/core-free-icons";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import * as React from "react";
import { useEffect, useState } from "react";
import { app } from "@/lib/treaty-client";
import { useQuery } from "@tanstack/react-query";
import { DebouncedInput } from "../debounced-input";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "../ui/button";
import { ImageThumbnail } from "../ui/image-thumbnail";
import { useNavigate } from "@tanstack/react-router";
import { getRecentItems } from "@/lib/recent-items";

export function SearchCommand() {
  const navigate = useNavigate();
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
    const { data, error } = await app.api.search.get({
      query: { search },
    });

    if (error) {
      if (error.status === 422) {
        throw new Error(error.value?.message || "Invalid search query");
      }

      throw new Error(error.value || "Failed to search");
    }

    return data;
  }

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["search", search],
    queryFn: () => getSearchResults({ search }),
    enabled: search.length > 0,
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  return (
    <>
      <Button variant="ghost" size="icon" className="size-7" onClick={() => setOpen(true)}>
        <HugeiconsIcon icon={Search01Icon} />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className={"p-0 shadow-lg max-w-3xl h-[75vh]"}>
          <DialogTitle className="hidden" />
          <Command
            shouldFilter={false}
            className="**:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 **:[[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 **:[[cmdk-input]]:h-12 **:[[cmdk-item]]:px-2 **:[[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5"
          >
            <DebouncedInput
              value={search}
              onChange={(value) => setSearch(value.toString())}
              placeholder="Search by title..."
              debounce={200}
              isCommandInput
            />
            {search.length > 0 && isLoading && (
              <div className="flex items-center justify-center py-6">
                <HugeiconsIcon
                  icon={Loading03Icon}
                  className="h-6 w-6 animate-spin text-muted-foreground"
                />
              </div>
            )}
            {search.length > 0 && isError && (
              <p className="px-2 py-4 text-destructive">Failed to search: {error?.message}</p>
            )}
            {search.length > 0 && !isLoading && !isError && data && (
              <CommandList>
                <CommandGroup heading="Orders">
                  <CommandEmpty>No orders found.</CommandEmpty>
                  {data.searchData.orderResults.map((order) => (
                    <CommandItem
                      key={order.orderId}
                      value={order.orderId}
                      onSelect={() => {
                        navigate({
                          to: "/orders/$id",
                          params: { id: order.orderId },
                        });
                        setOpen(false);
                      }}
                    >
                      <ImageThumbnail
                        images={order.itemImages}
                        title={order.orderTitle}
                        fallbackIcon={
                          <HugeiconsIcon
                            icon={PackageIcon}
                            className="h-5 w-5 text-muted-foreground"
                          />
                        }
                      />
                      <span>{order.orderTitle}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
                <CommandGroup heading="Collection">
                  <CommandEmpty>No items found.</CommandEmpty>
                  {data.searchData.collectionResults.map((collection) => (
                    <CommandItem
                      key={collection.collectionId}
                      value={collection.collectionId}
                      onSelect={() => {
                        navigate({
                          to: "/items/$id",
                          params: { id: collection.itemId },
                        });
                        setOpen(false);
                      }}
                    >
                      <ImageThumbnail
                        images={collection.itemImage ? [collection.itemImage] : []}
                        title={collection.itemTitle}
                        fallbackIcon={
                          <HugeiconsIcon
                            icon={Image02Icon}
                            className="h-5 w-5 text-muted-foreground"
                          />
                        }
                      />
                      <span>{collection.itemTitle}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            )}
            {search.length === 0 && recentItems.length > 0 && (
              <CommandList>
                <CommandGroup heading="Recent">
                  {recentItems.map((item) => (
                    <CommandItem
                      key={`${item.type}-${item.id}`}
                      value={item.id}
                      onSelect={() => {
                        navigate({
                          to: item.type === "order" ? "/orders/$id" : "/items/$id",
                          params: { id: item.id },
                        });
                        setOpen(false);
                      }}
                    >
                      <ImageThumbnail
                        images={item.images || []}
                        title={item.title}
                        fallbackIcon={
                          item.type === "order" ? (
                            <HugeiconsIcon
                              icon={PackageIcon}
                              className="h-5 w-5 text-muted-foreground"
                            />
                          ) : (
                            <HugeiconsIcon
                              icon={Image02Icon}
                              className="h-5 w-5 text-muted-foreground"
                            />
                          )
                        }
                      />{" "}
                      <span>{item.title}</span>
                    </CommandItem>
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
