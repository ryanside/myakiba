import { ArrowDown01Icon, ArrowUp01Icon, ArrowUpDownIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ORDER_STATUSES, SHIPPING_METHODS } from "@myakiba/contracts/shared/constants";
import type { Currency } from "@myakiba/contracts/shared/types";
import { useId, useState } from "react";
import { DebouncedInput } from "@/components/debounced-input";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useRootedInfiniteRead } from "@/data/client";
import { searches } from "@/data/resources/search";
import { AmountInput, DateField, EnumSelect, LabeledField } from "./add-fields";
import { DEFAULT_ORDER_FIELDS, orderFieldId } from "./commit-input";
import type { CommitIssue, OrderChoice, OrderFields as Fields } from "./commit-input";

const FEES = [
  { field: "shippingFee", label: "Shipping Fee" },
  { field: "taxes", label: "Taxes" },
  { field: "duties", label: "Duties" },
  { field: "tariffs", label: "Tariffs" },
  { field: "miscFees", label: "Miscellaneous Fees" },
] as const;

/** A new Order's fields, or a picker for an existing Order. */
export function OrderFields({
  choice,
  defaultTitle,
  currency,
  issues,
  onChange,
}: {
  readonly choice: OrderChoice;
  readonly defaultTitle: string;
  readonly currency: Currency;
  readonly issues: readonly CommitIssue[];
  readonly onChange: (choice: OrderChoice) => void;
}) {
  return (
    <div className="grid gap-3">
      <ToggleGroup
        value={[choice.kind]}
        variant="outline"
        size="sm"
        aria-label="New or existing Order"
        className="w-fit"
      >
        <ToggleGroupItem
          value="new"
          onPressedChange={(pressed) => {
            if (pressed && choice.kind !== "new") {
              onChange({ kind: "new", fields: DEFAULT_ORDER_FIELDS });
            }
          }}
        >
          New Order
        </ToggleGroupItem>
        <ToggleGroupItem
          value="existing"
          onPressedChange={(pressed) => {
            if (pressed && choice.kind !== "existing") onChange({ kind: "existing", order: null });
          }}
        >
          Existing Order
        </ToggleGroupItem>
      </ToggleGroup>
      {choice.kind === "new" ? (
        <NewOrderFields
          fields={choice.fields}
          defaultTitle={defaultTitle}
          currency={currency}
          issues={issues}
          onChange={(fields) => onChange({ kind: "new", fields })}
        />
      ) : (
        <ExistingOrderPicker
          order={choice.order}
          issue={issues.find((issue) => issue.fieldId === orderFieldId("existing"))?.message}
          onChange={(order) => onChange({ kind: "existing", order })}
        />
      )}
    </div>
  );
}

function NewOrderFields({
  fields,
  defaultTitle,
  currency,
  issues,
  onChange,
}: {
  readonly fields: Fields;
  readonly defaultTitle: string;
  readonly currency: Currency;
  readonly issues: readonly CommitIssue[];
  readonly onChange: (fields: Fields) => void;
}) {
  const id = useId();
  const moreId = `${id}-more`;
  const feeIssue = issues.some((issue) =>
    FEES.some(({ field }) => issue.fieldId === orderFieldId(field)),
  );
  const [showMore, setShowMore] = useState(false);
  const moreOpen = showMore || feeIssue;
  const set = (patch: Partial<Fields>) => onChange({ ...fields, ...patch });

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-3 @2xl/bar:grid-cols-5">
        <LabeledField id={orderFieldId("title")} label="Title" className="col-span-2">
          <Input
            id={orderFieldId("title")}
            value={fields.title ?? defaultTitle}
            onChange={(event) => set({ title: event.target.value })}
          />
        </LabeledField>
        <LabeledField id={`${id}-status`} label="Status">
          <EnumSelect
            id={`${id}-status`}
            value={fields.status}
            options={ORDER_STATUSES}
            onChange={(status) => set({ status })}
          />
        </LabeledField>
        <DateField
          id={`${id}-order-date`}
          label="Order Date"
          value={fields.orderDate}
          onChange={(orderDate) => set({ orderDate })}
        />
        <LabeledField id={`${id}-shop`} label="Shop" className="col-span-2 @2xl/bar:col-span-1">
          <Input
            id={`${id}-shop`}
            value={fields.shop}
            maxLength={200}
            placeholder="e.g., AmiAmi"
            onChange={(event) => set({ shop: event.target.value })}
          />
        </LabeledField>
      </div>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-fit"
        aria-expanded={moreOpen}
        aria-controls={moreId}
        onClick={() => setShowMore(!moreOpen)}
      >
        <HugeiconsIcon
          icon={moreOpen ? ArrowUp01Icon : ArrowDown01Icon}
          data-icon="inline-start"
          aria-hidden="true"
        />
        More Order details
      </Button>

      <div id={moreId} hidden={!moreOpen} className="grid gap-3">
        <div className="grid grid-cols-2 gap-3 @2xl/bar:grid-cols-4">
          <DateField
            id={`${id}-release-date`}
            label="Release Date"
            value={fields.releaseDate}
            onChange={(releaseDate) => set({ releaseDate })}
          />
          <DateField
            id={`${id}-payment-date`}
            label="Payment Date"
            value={fields.paymentDate}
            onChange={(paymentDate) => set({ paymentDate })}
          />
          <DateField
            id={`${id}-shipping-date`}
            label="Shipping Date"
            value={fields.shippingDate}
            onChange={(shippingDate) => set({ shippingDate })}
          />
          <DateField
            id={`${id}-collection-date`}
            label="Collection Date"
            value={fields.collectionDate}
            onChange={(collectionDate) => set({ collectionDate })}
          />
          <LabeledField id={`${id}-shipping`} label="Shipping Method">
            <EnumSelect
              id={`${id}-shipping`}
              value={fields.shippingMethod}
              options={SHIPPING_METHODS}
              onChange={(shippingMethod) => set({ shippingMethod })}
            />
          </LabeledField>
          {FEES.map(({ field, label }) => {
            const fieldId = orderFieldId(field);
            const issue = issues.find((candidate) => candidate.fieldId === fieldId);
            return (
              <LabeledField key={field} id={fieldId} label={label} error={issue?.message}>
                <AmountInput
                  id={fieldId}
                  value={fields[field]}
                  currency={currency}
                  placeholder="0.00"
                  invalid={issue !== undefined}
                  onChange={(value) => set({ [field]: value })}
                />
              </LabeledField>
            );
          })}
        </div>
        <LabeledField id={`${id}-notes`} label="Notes">
          <Textarea
            id={`${id}-notes`}
            value={fields.notes}
            rows={2}
            onChange={(event) => set({ notes: event.target.value })}
          />
        </LabeledField>
      </div>
    </div>
  );
}

function ExistingOrderPicker({
  order,
  issue,
  onChange,
}: {
  readonly order: { readonly id: string; readonly title: string | null } | null;
  readonly issue: string | undefined;
  readonly onChange: (order: { readonly id: string; readonly title: string }) => void;
}) {
  const fieldId = orderFieldId("existing");
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const { data, isPending, error, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useRootedInfiniteRead(searches.orders, title, { enabled: open });
  const results = data?.pages.flatMap((page) => page.orderIdsAndTitles) ?? [];

  return (
    <LabeledField id={fieldId} label="Order" error={issue} className="max-w-md">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              id={fieldId}
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={open}
              aria-controls={listId}
              aria-invalid={issue === undefined ? undefined : true}
              className="w-full min-w-0 justify-between font-normal"
            >
              <span className="min-w-0 truncate" title={order?.title ?? undefined}>
                {order ? (order.title ?? "Loading the Order…") : "Choose an Order"}
              </span>
              <HugeiconsIcon
                icon={ArrowUpDownIcon}
                data-icon="inline-end"
                className="shrink-0 opacity-50"
                aria-hidden="true"
              />
            </Button>
          }
        />
        <PopoverContent className="w-(--anchor-width) min-w-64 p-0" align="start">
          <Command shouldFilter={false}>
            <DebouncedInput
              value={title}
              onChange={(value) => setTitle(value.toString())}
              placeholder="Search Orders by title"
              debounce={200}
              isCommandInput
            />
            <CommandList id={listId}>
              {results.map((result) => (
                <CommandItem
                  key={result.id}
                  value={result.id}
                  onSelect={() => {
                    onChange(result);
                    setOpen(false);
                  }}
                >
                  <span className="min-w-0 [overflow-wrap:anywhere]">{result.title}</span>
                </CommandItem>
              ))}
              {results.length === 0 && !isPending ? (
                <CommandEmpty className="px-3 text-muted-foreground">
                  {error ? "Couldn't load your Orders. Try again." : "No Orders match."}
                </CommandEmpty>
              ) : null}
              {hasNextPage ? (
                <CommandItem
                  value="more-orders"
                  disabled={isFetchingNextPage}
                  onSelect={() => fetchNextPage()}
                  className="justify-center text-muted-foreground"
                >
                  Show more Orders
                </CommandItem>
              ) : null}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </LabeledField>
  );
}
