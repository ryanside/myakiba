import type { OrderItem } from "@/lib/orders/types";
import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { getItemReleases } from "@/queries/orders";

type ItemFormProps = {
  orderId: string;
  itemData: OrderItem;
  callbackFn: (
    orderId: string,
    collectionId: string,
    value: OrderItem
  ) => Promise<void>;
};

export default function ItemForm(props: ItemFormProps) {
  const { orderId, itemData, callbackFn } = props;

  const form = useForm({
    defaultValues: itemData,
    onSubmit: async ({ value }) => {
      await callbackFn(orderId, itemData.collectionId, value);
    },
  });

  const {
    data: releasesData,
    isLoading: releasesLoading,
    error: releasesError,
    refetch: refetchReleases,
  } = useQuery({
    queryKey: ["itemReleases", itemData.itemId],
    queryFn: () => getItemReleases(itemData.itemId),
    staleTime: 1000 * 60 * 5,
    retry: false,
    enabled: false,
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
          <DialogTitle>Edit Item</DialogTitle>
          <DialogDescription>{itemData.title}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <form.Field
              name="price"
              validators={{
                onChange: z.string().nonempty("Price is required"),
              }}
              children={(field) => (
                <div className="grid gap-2">
                  <Label htmlFor={field.name}>Price</Label>
                  <Input
                    id={field.name}
                    name={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    type="number"
                    step="0.01"
                    min="0.00"
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder="0.00"
                  />
                  {!field.state.meta.isValid && (
                    <em role="alert">{field.state.meta.errors.join(", ")}</em>
                  )}
                </div>
              )}
            />

            <form.Field
              name="count"
              validators={{
                onChange: z.number().min(1, "Count must be at least 1"),
              }}
              children={(field) => (
                <div className="grid gap-2">
                  <Label htmlFor={field.name}>Count</Label>
                  <Input
                    id={field.name}
                    name={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    type="number"
                    min="1"
                    onChange={(e) =>
                      field.handleChange(parseInt(e.target.value) || 1)
                    }
                    placeholder="1"
                  />
                  {!field.state.meta.isValid && (
                    <em role="alert">{field.state.meta.errors.join(", ")}</em>
                  )}
                </div>
              )}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <form.Field
              name="condition"
              children={(field) => (
                <div className="grid gap-2">
                  <Label htmlFor={field.name}>Condition</Label>
                  <Select
                    value={field.state.value ?? ""}
                    onValueChange={(value) =>
                      field.handleChange(value as typeof field.state.value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select condition" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="New">New</SelectItem>
                      <SelectItem value="Pre-Owned">Pre-Owned</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            />

            <form.Field
              name="status"
              validators={{
                onChange: z.enum(
                  ["Owned", "Ordered", "Paid", "Shipped", "Sold"],
                  "Status is required"
                ),
              }}
              children={(field) => (
                <div className="grid gap-2">
                  <Label htmlFor={field.name}>Status</Label>
                  <Select
                    value={field.state.value ?? ""}
                    onValueChange={(value) =>
                      field.handleChange(value as typeof field.state.value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Owned">Owned</SelectItem>
                      <SelectItem value="Ordered">Ordered</SelectItem>
                      <SelectItem value="Paid">Paid</SelectItem>
                      <SelectItem value="Shipped">Shipped</SelectItem>
                      <SelectItem value="Sold">Sold</SelectItem>
                    </SelectContent>
                  </Select>
                  {!field.state.meta.isValid && (
                    <em role="alert">{field.state.meta.errors.join(", ")}</em>
                  )}
                </div>
              )}
            />
          </div>

          <form.Field
            name="orderDate"
            children={(field) => (
              <div className="grid gap-2">
                <Label htmlFor={field.name}>Order Date</Label>
                <DatePicker
                  id={field.name}
                  name={field.name}
                  value={field.state.value ?? null}
                  onBlur={field.handleBlur}
                  onChange={(value) => field.handleChange(value)}
                  placeholder="Select order date"
                />
              </div>
            )}
          />

          <form.Field
            name="releaseId"
            children={(field) => (
              <div className="grid gap-2">
                <Label htmlFor={field.name}>Release Date</Label>
                <Select
                  value={field.state.value ?? ""}
                  onValueChange={(value) =>
                    field.handleChange(value as typeof field.state.value)
                  }
                  onOpenChange={(open) => {
                    if (open) {
                      refetchReleases();
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select release">
                      {field.state.value && (() => {
                        const selectedRelease = releasesData?.releases.find(
                          (r) => r.id === field.state.value
                        );
                        const displayData = selectedRelease || {
                          date: itemData.releaseDate,
                          type: itemData.releaseType,
                          price: itemData.releasePrice,
                          priceCurrency: itemData.releasePriceCurrency,
                          barcode: itemData.releaseBarcode,
                        };
                        
                        return (
                          <div className="flex items-center truncate text-xs gap-2 justify-between">
                            <div className="font-medium">
                              {displayData.date}
                            </div>
                            <div className="text-muted-foreground">
                              {displayData.type && (
                                <span>{displayData.type}</span>
                              )}
                              {displayData.price &&
                                displayData.priceCurrency && (
                                  <span>
                                    {displayData.priceCurrency}{" "}
                                    {displayData.price}
                                  </span>
                                )}
                              {displayData.barcode && (
                                <span>#{displayData.barcode}</span>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {releasesLoading && (
                      <div className="flex items-center justify-center py-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-900"></div>
                        <span className="ml-2 text-sm text-muted-foreground">
                          Loading releases...
                        </span>
                      </div>
                    )}
                    {releasesError && (
                      <div className="py-2 px-3 text-sm text-red-500">
                        {releasesError.message}
                      </div>
                    )}
                    {releasesData?.releases.map((release) => (
                      <SelectItem key={release.id} value={release.id}>
                        <div className="flex items-center truncate text-xs gap-2 justify-between">
                          <div className="font-medium">{release.date}</div>
                          <div className="text-muted-foreground">
                            {release.type && <span>{release.type}</span>}
                            {release.price && release.priceCurrency && (
                              <span>
                                {release.priceCurrency} {release.price}
                              </span>
                            )}
                            {release.barcode && <span>#{release.barcode}</span>}
                          </div>
                        </div>
                      </SelectItem>
                    ))}
                    {releasesData?.releases.length === 0 &&
                      !releasesLoading && (
                        <div className="py-2 px-3 text-sm text-muted-foreground">
                          No releases found
                        </div>
                      )}
                  </SelectContent>
                </Select>
              </div>
            )}
          />

          <div className="grid grid-cols-2 gap-4">
            <form.Field
              name="paymentDate"
              children={(field) => (
                <div className="grid gap-2">
                  <Label htmlFor={field.name}>Payment Date</Label>
                  <DatePicker
                    id={field.name}
                    name={field.name}
                    value={field.state.value ?? null}
                    onBlur={field.handleBlur}
                    onChange={(value) => field.handleChange(value)}
                    placeholder="Select payment date"
                  />
                </div>
              )}
            />

            <form.Field
              name="shippingDate"
              children={(field) => (
                <div className="grid gap-2">
                  <Label htmlFor={field.name}>Shipping Date</Label>
                  <DatePicker
                    id={field.name}
                    name={field.name}
                    value={field.state.value ?? null}
                    onBlur={field.handleBlur}
                    onChange={(value) => field.handleChange(value)}
                    placeholder="Select shipping date"
                  />
                </div>
              )}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <form.Field
              name="collectionDate"
              children={(field) => (
                <div className="grid gap-2">
                  <Label htmlFor={field.name}>Collection Date</Label>
                  <DatePicker
                    id={field.name}
                    name={field.name}
                    value={field.state.value ?? null}
                    onBlur={field.handleBlur}
                    onChange={(value) => field.handleChange(value)}
                    placeholder="Select collection date"
                  />
                </div>
              )}
            />

            <form.Field
              name="shippingMethod"
              validators={{
                onChange: z.enum(
                  [
                    "n/a",
                    "EMS",
                    "SAL",
                    "AIRMAIL",
                    "SURFACE",
                    "FEDEX",
                    "DHL",
                    "Colissimo",
                    "UPS",
                    "Domestic",
                  ],
                  "Shipping method is required"
                ),
              }}
              children={(field) => (
                <div className="grid gap-2">
                  <Label htmlFor={field.name}>Shipping Method</Label>
                  <Select
                    value={field.state.value ?? ""}
                    onValueChange={(value) =>
                      field.handleChange(value as typeof field.state.value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select shipping method" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="n/a">n/a</SelectItem>
                      <SelectItem value="EMS">EMS</SelectItem>
                      <SelectItem value="SAL">SAL</SelectItem>
                      <SelectItem value="AIRMAIL">AIRMAIL</SelectItem>
                      <SelectItem value="SURFACE">SURFACE</SelectItem>
                      <SelectItem value="FEDEX">FEDEX</SelectItem>
                      <SelectItem value="DHL">DHL</SelectItem>
                      <SelectItem value="Colissimo">Colissimo</SelectItem>
                      <SelectItem value="UPS">UPS</SelectItem>
                      <SelectItem value="Domestic">Domestic</SelectItem>
                    </SelectContent>
                  </Select>
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
                  {isSubmitting ? "Updating..." : "Update Item"}
                </Button>
              </DialogClose>
            )}
          />
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
