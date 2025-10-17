import { useForm } from "@tanstack/react-form";
import * as z from "zod";
import { useQuery } from "@tanstack/react-query";
import {
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useState } from "react";
import { getOrderIdsAndTitles } from "@/queries/orders";
import { DebouncedInput } from "@/components/debounced-input";
import { Label } from "@/components/ui/label";
import { Button } from "../ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "../ui/scroll-area";

type ItemMoveFormProps = {
  selectedItemData: {
    orderIds: Set<string>;
    collectionIds: Set<string>;
  };
  callbackFn: (
    targetOrderId: string,
    collectionIds: Set<string>,
    orderIds: Set<string>
  ) => Promise<void>;
  clearSelections: () => void;
};

export default function ItemMoveForm(props: ItemMoveFormProps) {
  const { selectedItemData, callbackFn, clearSelections } = props;

  const [filters, setFilters] = useState({
    title: "",
  });

  const [open, setOpen] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["orderIdsAndTitles", filters],
    queryFn: () => getOrderIdsAndTitles(filters),
    staleTime: 1000 * 60 * 5,
    retry: false,
    enabled: filters.title.length > 0,
  });

  const form = useForm({
    defaultValues: {
      targetOrderId: "",
    },
    onSubmit: async ({ value }) => {
      await callbackFn(
        value.targetOrderId,
        selectedItemData.collectionIds,
        selectedItemData.orderIds
      );
      clearSelections();
    },
  });
  return (
    <DialogContent className="max-w-2xl  overflow-y-auto">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
      >
        <DialogHeader>
          <DialogTitle>Move Items</DialogTitle>
        </DialogHeader>
        <ScrollArea className="gap-4 py-4 w-full overflow-auto max-h-[70vh]">
          <form.Field
            name="targetOrderId"
            validators={{
              onChange: z.string().nonempty("Target order id is required"),
            }}
            children={(field) => (
              <div className="grid gap-2">
                <Label htmlFor={field.name}>Move to Order:</Label>
                <Popover open={open} onOpenChange={setOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={open}
                      className="w-full justify-between"
                      type="button"
                    >
                      {field.state.value
                        ? data?.orderIdsAndTitles?.find(
                            (order) => order.id === field.state.value
                          )?.title || "Select target order"
                        : "Select target order"}
                      <ChevronsUpDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                    <Command>
                      <DebouncedInput
                        value={filters.title}
                        onChange={(value) =>
                          setFilters({ title: value.toString() })
                        }
                        placeholder="Search by title..."
                        debounce={200}
                        className="rounded-none shadow-none border-none focus-visible:ring-0 focus-visible:ring-offset-0 bg-background"
                      />
                      {data?.orderIdsAndTitles &&
                        data.orderIdsAndTitles.length > 0 && (
                          <CommandList className="space-y-2 p-1">
                            {error && (
                              <CommandEmpty>
                                Error searching orders: {error.message}
                              </CommandEmpty>
                            )}
                            {data.orderIdsAndTitles.length === 0 &&
                              !isLoading &&
                              !error && (
                                <CommandEmpty>No orders found.</CommandEmpty>
                              )}
                            <CommandGroup>
                              {data.orderIdsAndTitles.map((order) => (
                                <CommandItem
                                  key={order.id}
                                  value={order.id}
                                  onSelect={() => {
                                    field.handleChange(order.id);
                                    setOpen(false);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      field.handleChange(order.id);
                                      setOpen(false);
                                    }
                                  }}
                                >
                                  <CheckIcon
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      field.state.value === order.id
                                        ? "opacity-100"
                                        : "opacity-0"
                                    )}
                                  />
                                  {order.title}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        )}
                    </Command>
                  </PopoverContent>
                </Popover>
                {!field.state.meta.isValid && (
                  <em role="alert">{field.state.meta.errors.join(", ")}</em>
                )}
              </div>
            )}
          />
        </ScrollArea>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" type="button">
              Cancel
            </Button>
          </DialogClose>
          <form.Subscribe
            selector={(state) => [state.canSubmit, state.isSubmitting]}
            children={([canSubmit, isSubmitting]) => (
              <DialogClose asChild>
                <Button type="submit" disabled={!canSubmit} variant="primary">
                  {isSubmitting ? "Moving..." : "Move Items"}
                </Button>
              </DialogClose>
            )}
          />
        </DialogFooter>
      </form>{" "}
    </DialogContent>
  );
}
