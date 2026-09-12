import type { SyncResponse } from "@/queries/sync";
import { useForm } from "@tanstack/react-form";
import * as z from "zod";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, Cancel01Icon, Loading03Icon } from "@hugeicons/core-free-icons";
import { itemSyncSchema, mfcItemIdSchema } from "@myakiba/contracts/sync/schema";
import type { ItemSyncInput } from "@myakiba/contracts/sync/schema";
import { MAX_ITEM_SYNC_ITEMS } from "@myakiba/contracts/sync/constants";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/reui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { SyncNotice } from "@/components/sync/sync-notice";

export function SyncItemsForm({
  handleSyncItemsSubmit,
  initialItemExternalId = "",
}: {
  readonly handleSyncItemsSubmit: (values: ItemSyncInput) => Promise<SyncResponse>;
  readonly initialItemExternalId?: string;
}): React.JSX.Element {
  const form = useForm({
    defaultValues: {
      items: [{ formRowId: crypto.randomUUID(), itemExternalId: initialItemExternalId }],
    },
    onSubmit: async ({ value }) => {
      await handleSyncItemsSubmit(
        itemSyncSchema.parse({
          items: value.items.map((item) => item.itemExternalId),
        }),
      );
      form.reset();
    },
  });

  return (
    <form
      className="space-y-3 w-full"
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <SyncNotice />
      <form.Field
        name="items"
        mode="array"
        validators={{
          onSubmit: ({ value }) => {
            if (value.length === 0) {
              return "At least one item is required";
            }
          },
        }}
      >
        {(field) => (
          <div className="flex flex-col gap-4">
            <div className="flex flex-row gap-3 items-center">
              <Label className="text-lg text-foreground">Items</Label>
              <Badge size="sm" variant="secondary">
                {field.state.value.length} {field.state.value.length === 1 ? "item" : "items"}
              </Badge>
              <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
                {([canSubmit, isSubmitting]) => (
                  <Button
                    type="submit"
                    disabled={!canSubmit}
                    aria-busy={isSubmitting}
                    className="ml-auto"
                  >
                    {isSubmitting ? (
                      <>
                        <HugeiconsIcon icon={Loading03Icon} className="size-4 animate-spin" />
                        <span className="sr-only">Adding to item database</span>
                      </>
                    ) : (
                      "Add"
                    )}
                  </Button>
                )}
              </form.Subscribe>
            </div>
            {field.state.value.map((item, index) => (
              <form.Field
                key={item.formRowId}
                name={`items[${index}].itemExternalId`}
                validators={{
                  onChange: mfcItemIdSchema.pipe(z.number().max(2_147_483_647)),
                }}
              >
                {(subField) => (
                  <div className="w-full">
                    <div className="flex flex-row gap-2">
                      <Input
                        name={subField.name}
                        value={subField.state.value}
                        onChange={(event) => subField.handleChange(event.target.value)}
                        onBlur={subField.handleBlur}
                        onPaste={(event) => {
                          const lines = event.clipboardData
                            .getData("text/plain")
                            .split(/\r?\n/)
                            .map((line) => line.trim())
                            .filter(Boolean);
                          if (lines.length > 1) {
                            event.preventDefault();
                            subField.handleChange(lines[0] ?? "");
                            const remainingSlots = MAX_ITEM_SYNC_ITEMS - field.state.value.length;
                            const toAdd = Math.min(lines.length - 1, remainingSlots);
                            for (let lineIndex = 1; lineIndex <= toAdd; lineIndex++) {
                              field.pushValue({
                                formRowId: crypto.randomUUID(),
                                itemExternalId: lines[lineIndex] ?? "",
                              });
                            }
                          }
                        }}
                        type="text"
                        placeholder="MyFigureCollection item link or ID"
                        aria-label={`Item ${index + 1} link or ID`}
                        aria-invalid={!subField.state.meta.isValid}
                        aria-describedby={
                          subField.state.meta.isValid
                            ? undefined
                            : `sync-item-error-${item.formRowId}`
                        }
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => field.removeValue(index)}
                        disabled={field.state.value.length === 1}
                        aria-label={`Remove Item ${index + 1}`}
                      >
                        <HugeiconsIcon icon={Cancel01Icon} className="text-destructive" />
                      </Button>
                    </div>
                    {subField.state.meta.isValid ? null : (
                      <p
                        id={`sync-item-error-${item.formRowId}`}
                        role="alert"
                        className="text-xs text-destructive mt-1"
                      >
                        {subField.state.meta.errors[0]?.message}
                      </p>
                    )}
                  </div>
                )}
              </form.Field>
            ))}
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={field.state.value.length >= MAX_ITEM_SYNC_ITEMS}
              onClick={() =>
                field.pushValue({ formRowId: crypto.randomUUID(), itemExternalId: "" })
              }
            >
              <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" /> Add More Items
            </Button>
            {field.state.meta.isValid ? null : (
              <p role="alert" className="text-xs text-destructive">
                {field.state.meta.errors.join(". ")}
              </p>
            )}
          </div>
        )}
      </form.Field>
    </form>
  );
}
