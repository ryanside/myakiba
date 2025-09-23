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
import type { CascadeOptions } from "@/lib/types";
import { useCascadeOptions } from "@/hooks/use-cascade-options";
import { useState } from "react";
import { getOrderIdsAndTitles } from "@/queries/orders";
import { DebouncedInput } from "@/components/debounced-input";
import { Label } from "@/components/ui/label";

type ItemMoveFormProps = {
  selectedItemData: {
    orderIds: Set<string>;
    collectionIds: Set<string>;
  };
  //   callbackFn: (
  //     targetOrderId: string,
  //     cascadeOptions: CascadeOptions,
  //     collectionIds: Set<string>,
  //     orderIds: Set<string>
  //   ) => Promise<void>;
  clearSelections: () => void;
};

export default function ItemMoveForm(props: ItemMoveFormProps) {
  const { selectedItemData, clearSelections } = props;

  const {
    cascadeOptions,
    handleSelectAll,
    handleSelectNone,
    handleCascadeOptionChange,
    cascadeDisplayText,
    cascadeOptionsList,
  } = useCascadeOptions();

  const [offset, setOffset] = useState(0);
  const [title, setTitle] = useState("");

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["orderIdsAndTitles", offset, title],
    queryFn: () => getOrderIdsAndTitles(offset, title),
    staleTime: 1000 * 60 * 5,
    retry: false,
    enabled: false,
  });

  const form = useForm({
    defaultValues: {
      targetOrderId: "",
    },
    onSubmit: async ({ value }) => {
      //   await callbackFn(
      //     value.targetOrderId,
      //     cascadeOptions,
      //     collectionIds,
      //     orderIds
      //   );
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
          <DialogTitle>Move Item</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <DebouncedInput
            value={title}
            onChange={(value) => setTitle(value.toString())}
            placeholder="Search by title"
            className="w-full"
          />
        </div>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-2 gap-4">
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
                      {data?.orderIdsAndTitles?.map((order) => (
                        <SelectItem key={order.id} value={order.id}>
                          {order.title}
                        </SelectItem>
                      ))}
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
      </form>
    </DialogContent>
  );
}
