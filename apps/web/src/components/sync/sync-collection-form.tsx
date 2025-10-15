import { useForm } from "@tanstack/react-form";
import { Button } from "../ui/button";
import { type SyncFormCollectionItem } from "@/lib/sync/types";
import { ArrowLeft, Edit, Loader2, Plus, X } from "lucide-react";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { MaskInput } from "../ui/mask-input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import { DialogFooter, DialogClose } from "../ui/dialog";
import { Badge } from "../ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { DatePicker } from "../ui/date-picker";
import * as z from "zod";
import { Rating } from "../ui/rating";
import { Textarea } from "../ui/textarea";
import { authClient } from "@/lib/auth-client";
import { getCurrencyLocale } from "@/lib/utils";

export default function SyncCollectionForm({
  setCurrentStep,
  handleSyncCollectionSubmit,
}: {
  setCurrentStep: (step: number) => void;
  handleSyncCollectionSubmit: (values: SyncFormCollectionItem[]) => void;
}) {
  const { data: session } = authClient.useSession();
  const userCurrency = session?.user?.currency || "USD";
  const userLocale = getCurrencyLocale(userCurrency);

  const collectionForm = useForm({
    defaultValues: {
      items: [
        {
          itemId: "",
          price: "0.00",
          count: 1,
          score: 0,
          shop: "",
          orderDate: "",
          paymentDate: "",
          shippingDate: "",
          collectionDate: "",
          shippingMethod: "n/a",
          tags: [],
          condition: "New",
          notes: "",
        },
      ] as SyncFormCollectionItem[],
    },
    onSubmit: async ({ value }) => {
      await handleSyncCollectionSubmit(value.items);
      collectionForm.reset();
    },
  });
  return (
    <div className="w-full">
      <div className="p-4 pt-0 pl-0 w-full flex flex-row items-center justify-start gap-2">
        <Button
          variant="ghost"
          onClick={() => setCurrentStep(1)}
          className="text-foreground"
          aria-label="Back to Sync Options"
          size="icon"
        >
          <ArrowLeft />
        </Button>
        <h1 className="text-lg text-black dark:text-white">
          Add Collection Items
        </h1>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void collectionForm.handleSubmit();
        }}
        className="rounded-lg border p-4 space-y-4 w-full"
      >
        <collectionForm.Field
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
          {(field) => {
            return (
              <div className="flex flex-col gap-4">
                <div className="flex flex-row gap-3 items-center">
                  <Label className="text-lg text-black dark:text-white">
                    Collection Items
                  </Label>
                  <Badge size="sm">
                    {field.state.value.length}{" "}
                    {field.state.value.length === 1 ? "item" : "items"}
                  </Badge>
                  <collectionForm.Subscribe
                    selector={(state) => [state.canSubmit, state.isSubmitting]}
                    children={([canSubmit, isSubmitting]) => (
                      <Button
                        type="submit"
                        disabled={!canSubmit}
                        variant="primary"
                        className="ml-auto"
                        size="md"
                      >
                        {isSubmitting ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          "Submit Items"
                        )}
                      </Button>
                    )}
                  />
                </div>

                {field.state.value.map((_, i) => {
                  return (
                    <collectionForm.Field
                      key={i}
                      name={`items[${i}].itemId`}
                      validators={{
                        onChange: z.string().nonempty("Item ID is required"),
                      }}
                    >
                      {(subField) => {
                        return (
                          <div className="max-w-md rounded-lg">
                            <div className="flex flex-row gap-2">
                              <Input
                                value={subField.state.value}
                                onChange={(e) =>
                                  subField.handleChange(e.target.value)
                                }
                                type="text"
                                placeholder="MyFigureCollection Item ID (e.g. 98665)"
                                className="max-w-sm"
                              />

                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    type="button"
                                  >
                                    <Edit />
                                  </Button>
                                </DialogTrigger>
                                <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
                                  <DialogHeader>
                                    <DialogTitle>
                                      Edit Collection Item
                                    </DialogTitle>
                                    <DialogDescription>
                                      MFC Item ID:{" "}
                                      {subField.state.value || "Not set"}
                                    </DialogDescription>
                                  </DialogHeader>
                                  <div className="grid gap-4 py-4">
                                    <div className="grid grid-cols-2 gap-4">
                                      <collectionForm.Field
                                        name={`items[${i}].price`}
                                        validators={{
                                          onChange: z
                                            .string()
                                            .nonempty("Price is required"),
                                        }}
                                        children={(priceField) => (
                                          <div className="grid gap-2">
                                            <Label htmlFor={`price-${i}`}>
                                              Price
                                            </Label>
                                            <MaskInput
                                              id={`price-${i}`}
                                              name={priceField.name}
                                              mask="currency"
                                              currency={userCurrency}
                                              locale={userLocale}
                                              value={priceField.state.value}
                                              onBlur={priceField.handleBlur}
                                              onValueChange={(
                                                maskedValue,
                                                unmaskedValue
                                              ) =>
                                                priceField.handleChange(
                                                  unmaskedValue
                                                )
                                              }
                                              placeholder="0.00"
                                            />
                                            {!priceField.state.meta.isValid && (
                                              <em
                                                role="alert"
                                                className="text-red-500 text-xs"
                                              >
                                                {priceField.state.meta.errors.join(
                                                  ", "
                                                )}
                                              </em>
                                            )}
                                          </div>
                                        )}
                                      />
                                      <collectionForm.Field
                                        name={`items[${i}].count`}
                                        validators={{
                                          onChange: z
                                            .number()
                                            .min(1, "Count must be at least 1"),
                                        }}
                                        children={(countField) => (
                                          <div className="grid gap-2">
                                            <Label htmlFor={`count-${i}`}>
                                              Count
                                            </Label>
                                            <Input
                                              id={`count-${i}`}
                                              name={countField.name}
                                              value={countField.state.value}
                                              onBlur={countField.handleBlur}
                                              type="number"
                                              min="1"
                                              onChange={(e) =>
                                                countField.handleChange(
                                                  parseInt(e.target.value) || 1
                                                )
                                              }
                                              placeholder="1"
                                            />
                                            {!countField.state.meta.isValid && (
                                              <em
                                                role="alert"
                                                className="text-red-500 text-xs"
                                              >
                                                {countField.state.meta.errors.join(
                                                  ", "
                                                )}
                                              </em>
                                            )}
                                          </div>
                                        )}
                                      />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                      <collectionForm.Field
                                        name={`items[${i}].condition`}
                                        children={(conditionField) => (
                                          <div className="grid gap-2">
                                            <Label htmlFor={`condition-${i}`}>
                                              Condition
                                            </Label>
                                            <Select
                                              value={
                                                conditionField.state.value ?? ""
                                              }
                                              onValueChange={(value) =>
                                                conditionField.handleChange(
                                                  value as typeof conditionField.state.value
                                                )
                                              }
                                            >
                                              <SelectTrigger>
                                                <SelectValue placeholder="Select condition" />
                                              </SelectTrigger>
                                              <SelectContent>
                                                <SelectItem value="New">
                                                  New
                                                </SelectItem>
                                                <SelectItem value="Pre-Owned">
                                                  Pre-Owned
                                                </SelectItem>
                                              </SelectContent>
                                            </Select>
                                          </div>
                                        )}
                                      />
                                      <collectionForm.Field
                                        name={`items[${i}].score`}
                                        children={(scoreField) => (
                                          <div className="grid gap-2">
                                            <Label htmlFor={`score-${i}`}>
                                              Score
                                            </Label>
                                            <div className="my-auto">
                                              <Rating
                                                rating={
                                                  scoreField.state.value ?? 0
                                                }
                                                editable={true}
                                                onRatingChange={
                                                  scoreField.handleChange
                                                }
                                                showValue={true}
                                                maxRating={10}
                                              />
                                            </div>
                                          </div>
                                        )}
                                      />
                                    </div>

                                    <collectionForm.Field
                                      name={`items[${i}].shop`}
                                      children={(shopField) => (
                                        <div className="grid gap-2">
                                          <Label htmlFor={`shop-${i}`}>
                                            Shop
                                          </Label>
                                          <Input
                                            id={`shop-${i}`}
                                            name={shopField.name}
                                            value={shopField.state.value ?? ""}
                                            onBlur={shopField.handleBlur}
                                            type="text"
                                            onChange={(e) =>
                                              shopField.handleChange(
                                                e.target.value
                                              )
                                            }
                                            placeholder="e.g., AmiAmi"
                                          />
                                        </div>
                                      )}
                                    />

                                    <collectionForm.Field
                                      name={`items[${i}].shippingMethod`}
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
                                      children={(shippingField) => (
                                        <div className="grid gap-2">
                                          <Label htmlFor={`shipping-${i}`}>
                                            Shipping Method
                                          </Label>
                                          <Select
                                            value={
                                              shippingField.state.value ?? ""
                                            }
                                            onValueChange={(value) =>
                                              shippingField.handleChange(
                                                value as typeof shippingField.state.value
                                              )
                                            }
                                          >
                                            <SelectTrigger>
                                              <SelectValue placeholder="Select shipping method" />
                                            </SelectTrigger>
                                            <SelectContent>
                                              <SelectItem value="n/a">
                                                n/a
                                              </SelectItem>
                                              <SelectItem value="EMS">
                                                EMS
                                              </SelectItem>
                                              <SelectItem value="SAL">
                                                SAL
                                              </SelectItem>
                                              <SelectItem value="AIRMAIL">
                                                AIRMAIL
                                              </SelectItem>
                                              <SelectItem value="SURFACE">
                                                SURFACE
                                              </SelectItem>
                                              <SelectItem value="FEDEX">
                                                FEDEX
                                              </SelectItem>
                                              <SelectItem value="DHL">
                                                DHL
                                              </SelectItem>
                                              <SelectItem value="Colissimo">
                                                Colissimo
                                              </SelectItem>
                                              <SelectItem value="UPS">
                                                UPS
                                              </SelectItem>
                                              <SelectItem value="Domestic">
                                                Domestic
                                              </SelectItem>
                                            </SelectContent>
                                          </Select>
                                        </div>
                                      )}
                                    />

                                    <div className="grid grid-cols-2 gap-4">
                                      <collectionForm.Field
                                        name={`items[${i}].orderDate`}
                                        children={(orderDateField) => (
                                          <div className="grid gap-2">
                                            <Label htmlFor={`orderDate-${i}`}>
                                              Order Date
                                            </Label>
                                            <DatePicker
                                              id={`orderDate-${i}`}
                                              name={orderDateField.name}
                                              value={
                                                orderDateField.state.value ??
                                                null
                                              }
                                              onBlur={orderDateField.handleBlur}
                                              onChange={(value) =>
                                                orderDateField.handleChange(
                                                  value ?? ""
                                                )
                                              }
                                              placeholder="Select order date"
                                            />
                                          </div>
                                        )}
                                      />
                                      <collectionForm.Field
                                        name={`items[${i}].paymentDate`}
                                        children={(paymentDateField) => (
                                          <div className="grid gap-2">
                                            <Label htmlFor={`paymentDate-${i}`}>
                                              Payment Date
                                            </Label>
                                            <DatePicker
                                              id={`paymentDate-${i}`}
                                              name={paymentDateField.name}
                                              value={
                                                paymentDateField.state.value ??
                                                null
                                              }
                                              onBlur={
                                                paymentDateField.handleBlur
                                              }
                                              onChange={(value) =>
                                                paymentDateField.handleChange(
                                                  value ?? ""
                                                )
                                              }
                                              placeholder="Select payment date"
                                            />
                                          </div>
                                        )}
                                      />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                      <collectionForm.Field
                                        name={`items[${i}].shippingDate`}
                                        children={(shippingDateField) => (
                                          <div className="grid gap-2">
                                            <Label
                                              htmlFor={`shippingDate-${i}`}
                                            >
                                              Shipping Date
                                            </Label>
                                            <DatePicker
                                              id={`shippingDate-${i}`}
                                              name={shippingDateField.name}
                                              value={
                                                shippingDateField.state.value ??
                                                null
                                              }
                                              onBlur={
                                                shippingDateField.handleBlur
                                              }
                                              onChange={(value) =>
                                                shippingDateField.handleChange(
                                                  value ?? ""
                                                )
                                              }
                                              placeholder="Select shipping date"
                                            />
                                          </div>
                                        )}
                                      />
                                      <collectionForm.Field
                                        name={`items[${i}].collectionDate`}
                                        children={(collectionDateField) => (
                                          <div className="grid gap-2">
                                            <Label
                                              htmlFor={`collectionDate-${i}`}
                                            >
                                              Collection Date
                                            </Label>
                                            <DatePicker
                                              id={`collectionDate-${i}`}
                                              name={collectionDateField.name}
                                              value={
                                                collectionDateField.state
                                                  .value ?? null
                                              }
                                              onBlur={
                                                collectionDateField.handleBlur
                                              }
                                              onChange={(value) =>
                                                collectionDateField.handleChange(
                                                  value ?? ""
                                                )
                                              }
                                              placeholder="Select collection date"
                                            />
                                          </div>
                                        )}
                                      />
                                    </div>

                                    <collectionForm.Field
                                      name={`items[${i}].tags`}
                                      mode="array"
                                      children={(tagsField) => (
                                        <div className="grid gap-2">
                                          <Label>Tags</Label>
                                          <div className="flex flex-wrap gap-2">
                                            {tagsField.state.value.map(
                                              (tag, tagIndex) => (
                                                <Badge
                                                  key={tagIndex}
                                                  variant="outline"
                                                  className="flex items-center gap-1 text-foreground"
                                                >
                                                  {tag}
                                                  <button
                                                    type="button"
                                                    onClick={() =>
                                                      tagsField.removeValue(
                                                        tagIndex
                                                      )
                                                    }
                                                    className="ml-1 hover:text-red-500"
                                                  >
                                                    <X className="w-3 h-3" />
                                                  </button>
                                                </Badge>
                                              )
                                            )}
                                          </div>
                                          <div className="flex gap-2">
                                            <Input
                                              id={`tag-input-${i}`}
                                              type="text"
                                              placeholder="Add a tag"
                                              onKeyDown={(e) => {
                                                if (e.key === "Enter") {
                                                  e.preventDefault();
                                                  const input = e.currentTarget;
                                                  const value =
                                                    input.value.trim();
                                                  if (value) {
                                                    tagsField.pushValue(value);
                                                    input.value = "";
                                                  }
                                                }
                                              }}
                                            />
                                            <Button
                                              type="button"
                                              variant="outline"
                                              onClick={() => {
                                                const input =
                                                  document.getElementById(
                                                    `tag-input-${i}`
                                                  ) as HTMLInputElement;
                                                const value =
                                                  input.value.trim();
                                                if (value) {
                                                  tagsField.pushValue(value);
                                                  input.value = "";
                                                }
                                              }}
                                            >
                                              Add
                                            </Button>
                                          </div>
                                        </div>
                                      )}
                                    />

                                    <collectionForm.Field
                                      name={`items[${i}].notes`}
                                      children={(notesField) => (
                                        <div className="grid gap-2">
                                          <Label htmlFor={`notes-${i}`}>
                                            Notes
                                          </Label>
                                          <Textarea
                                            id={`notes-${i}`}
                                            name={notesField.name}
                                            value={notesField.state.value ?? ""}
                                            onBlur={notesField.handleBlur}
                                            onChange={(e) =>
                                              notesField.handleChange(
                                                e.target.value
                                              )
                                            }
                                            placeholder="Additional notes..."
                                            className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                            rows={3}
                                          />
                                        </div>
                                      )}
                                    />
                                  </div>
                                  <DialogFooter>
                                    <DialogClose asChild>
                                      <Button variant="outline" type="button">
                                        Close
                                      </Button>
                                    </DialogClose>
                                  </DialogFooter>
                                </DialogContent>
                              </Dialog>
                              <Button
                                variant="outline"
                                size="icon"
                                onClick={() => field.removeValue(i)}
                                disabled={field.state.value.length === 1}
                              >
                                <X className="text-red-500" />
                              </Button>
                            </div>
                            {!subField.state.meta.isValid && (
                              <em role="alert" className="text-red-500 text-xs">
                                {subField.state.meta.errors[0]?.message}
                              </em>
                            )}
                          </div>
                        );
                      }}
                    </collectionForm.Field>
                  );
                })}
                <Button
                  variant="outline"
                  className="max-w-md"
                  disabled={field.state.value.length === 10}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    field.pushValue({
                      itemId: "",
                      price: "0.00",
                      count: 1,
                      score: 0,
                      shop: "",
                      tags: [],
                      notes: "",
                      condition: "New",
                      shippingMethod: "n/a",
                      orderDate: "",
                      paymentDate: "",
                      shippingDate: "",
                      collectionDate: "",
                    });
                  }}
                >
                  <Plus /> Add Item
                </Button>
              </div>
            );
          }}
        </collectionForm.Field>
      </form>
    </div>
  );
}
