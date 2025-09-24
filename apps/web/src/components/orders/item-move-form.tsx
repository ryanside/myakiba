import { useForm } from "@tanstack/react-form";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState } from "react";
import { getOrderIdsAndTitles } from "@/queries/orders";
import { DebouncedInput } from "@/components/debounced-input";
import { Label } from "@/components/ui/label";
import { Button } from "../ui/button";

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

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["orderIdsAndTitles", filters],
    queryFn: () => getOrderIdsAndTitles(filters),
    staleTime: 1000 * 60 * 5,
    retry: false,
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
    <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
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
        <div className="grid gap-4 py-4">
          <div className="gap-4 w-full overflow-auto">
            <form.Field
              name="targetOrderId"
              validators={{
                onChange: z.string().nonempty("Target order id is required"),
              }}
              children={(field) => (
                <div className="grid gap-2">
                  <Label htmlFor={field.name}>Move to Order:</Label>
                  <Select
                    value={field.state.value}
                    onValueChange={field.handleChange}
                    onOpenChange={(open) => {
                      if (open) {
                        refetch();
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select target order" />
                    </SelectTrigger>
                    <SelectContent>
                      <div className="overflow-auto space-y-2">
                        <DebouncedInput
                          value={filters.title}
                          onChange={(value) =>
                            setFilters({ title: value.toString() })
                          }
                          placeholder="Search by title"
                          className="w-full text-foreground"
                          autoFocus
                          onKeyDown={(e) => {
                            e.stopPropagation();
                          }}
                        />
                        <div className="max-h-[500px] overflow-auto">
                          {isLoading && (
                            <div className="px-2 py-1 text-sm text-muted-foreground">
                              Searching...
                            </div>
                          )}
                          {error && (
                            <div className="px-2 py-1 text-sm text-red-500">
                              {error.message}
                            </div>
                          )}
                          {data?.orderIdsAndTitles?.map((order) => (
                            <SelectItem key={order.id} value={order.id}>
                              {order.title}
                            </SelectItem>
                          ))}
                          {data?.orderIdsAndTitles?.length === 0 &&
                            !isLoading && (
                              <div className="px-2 py-1 text-sm text-muted-foreground">
                                No orders found
                              </div>
                            )}
                        </div>
                      </div>
                    </SelectContent>
                  </Select>
                  {!field.state.meta.isValid && (
                    <em role="alert">{field.state.meta.errors.join(", ")}</em>
                  )}
                </div>
              )}
            />
          </div>
        </div>
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
