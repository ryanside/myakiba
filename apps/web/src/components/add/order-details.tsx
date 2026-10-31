import { ArrowUpDownIcon, PackageIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ORDER_STATUSES, SHIPPING_METHODS } from "@myakiba/contracts/shared/constants";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import { useId, useState } from "react";
import type { ReactNode } from "react";
import { DebouncedInput } from "@/components/debounced-input";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandItem, CommandList } from "@/components/ui/command";
import { DatePicker } from "@/components/ui/date-picker";
import { ImageThumbnail } from "@/components/ui/image-thumbnail";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { useRead, useRootedInfiniteRead } from "@/data/client";
import { orders } from "@/data/resources/orders";
import { searches } from "@/data/resources/search";
import { formatDateOnlyForDisplay } from "@/lib/date-display";
import { getCurrencyLocale } from "@/lib/locale";
import { parseMoneyInputToMinorUnits } from "@/lib/money-input";
import { cn } from "@/lib/utils";
import type { AddController } from "./add-controller";
import { AmountInput, DateField, EnumSelect, LabeledField } from "./add-fields";
import { orderFieldId } from "./commit-input";
import type { OrderFields } from "./commit-input";
import { FieldGroup, THUMBNAIL } from "./row-fields";

const FEES = [
  { field: "shippingFee", label: "Shipping Fee" },
  { field: "taxes", label: "Taxes" },
  { field: "duties", label: "Duties" },
  { field: "tariffs", label: "Tariffs" },
  { field: "miscFees", label: "Miscellaneous Fees" },
] as const;

export function feeTotal(fields: OrderFields): number {
  return FEES.reduce((sum, { field }) => {
    const parsed = parseMoneyInputToMinorUnits(fields[field]);
    return parsed.isOk() ? sum + parsed.value : sum;
  }, 0);
}

/** The Order's picture and title, in the shape of a table row's picture and title. */
function SectionHeading({
  images,
  title,
  aside,
}: {
  readonly images: readonly string[];
  readonly title: ReactNode;
  readonly aside?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      <div className="flex min-w-0 flex-1 basis-64 items-center gap-3">
        <ImageThumbnail
          images={images}
          title="This Order"
          decorative
          showRemainingCount
          className={THUMBNAIL}
          fallbackIcon={<OrderIcon />}
        />
        {title}
      </div>
      {aside}
    </div>
  );
}

const OrderIcon = () => (
  <HugeiconsIcon icon={PackageIcon} className="size-5 text-muted-foreground" aria-hidden="true" />
);

// One line of it is the height of an Input, and more lines grow from there.
const TITLE_TEXT =
  "col-start-1 row-start-1 min-h-8 px-2 py-1 text-base font-medium [overflow-wrap:anywhere] md:py-1.5 md:text-sm";

/**
 * The Order's title, edited in place. It wraps, so it is a text area, and it stays one paragraph.
 * The hidden copy behind it sets the height, in every browser.
 */
function OrderTitle({
  value,
  onChange,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  return (
    <div className="-ms-2 grid min-w-0 flex-1">
      <span aria-hidden="true" className={cn(TITLE_TEXT, "invisible whitespace-pre-wrap")}>
        {`${value} `}
      </span>
      <textarea
        id={orderFieldId("title")}
        aria-label="Order title"
        rows={1}
        value={value}
        className={cn(
          TITLE_TEXT,
          "resize-none overflow-hidden rounded-lg bg-transparent outline-none placeholder:text-muted-foreground hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50",
        )}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.preventDefault();
        }}
        onChange={(event) => onChange(event.target.value.replaceAll(/\s*[\r\n]+\s*/gu, " "))}
      />
    </div>
  );
}

// The table's own surface, so the Order reads as a section beside it and apart from the sentence.
const SECTION = "flex flex-col gap-5 rounded-xl bg-card p-3 ring-1 ring-foreground/10";

/** The Order the sentence names: a new one's fields, or the existing one to join. */
export function OrderDetails({ controller: c }: { readonly controller: AddController }) {
  const { order } = c.resolvedForm;
  return order.kind === "new" ? (
    <NewOrderDetails controller={c} />
  ) : (
    <ExistingOrder controller={c} />
  );
}

function ExistingOrder({ controller: c }: { readonly controller: AddController }) {
  const id = useId();
  const form = c.resolvedForm;
  const chosen = form.order.kind === "existing" ? form.order.order : null;
  const { data: order } = useRead(orders.detail, chosen?.id ?? "", { enabled: chosen !== null });
  if (form.order.kind !== "existing") return null;
  return (
    <section aria-labelledby={id} className={SECTION}>
      <SectionHeading
        images={order?.images ?? []}
        title={
          <div className="flex min-w-0 flex-col gap-1">
            <h2 id={id} className="text-sm font-medium [overflow-wrap:anywhere]">
              {chosen?.title ?? "Existing Order"}
            </h2>
            <p className="text-xs text-pretty text-muted-foreground">
              These items take their Shop, dates and Shipping Method from the Order.
            </p>
          </div>
        }
        aside={
          <div className="w-full @2xl/add:w-80">
            <ExistingOrderPicker
              order={chosen}
              issue={c.issues.find((issue) => issue.fieldId === orderFieldId("existing"))?.message}
              onChange={(next) => c.setForm({ ...form, order: { kind: "existing", order: next } })}
            />
          </div>
        }
      />
    </section>
  );
}

/** A new Order's details, all on screen, so an issue the commit reports is on a visible field. */
function NewOrderDetails({ controller: c }: { readonly controller: AddController }) {
  const id = useId();
  const form = c.resolvedForm;
  if (form.order.kind !== "new") return null;
  const { fields } = form.order;
  const set = (patch: Partial<OrderFields>) =>
    c.setForm({ ...form, order: { kind: "new", fields: { ...fields, ...patch } } });
  const fees = feeTotal(fields);
  // The commit moves a blank Release Date to the latest of its rows' releases, so it says so first.
  const latestRelease = c.selectedRows
    .map(({ row, item }) => c.releaseOf(row, item)?.date ?? "")
    .reduce((latest, date) => (date > latest ? date : latest), "");

  return (
    <section aria-label="New Order" className={SECTION}>
      <SectionHeading
        images={c.selectedRows.flatMap(({ item }) => (item.image ? [item.image] : []))}
        title={
          <OrderTitle
            value={fields.title ?? c.newOrderTitle}
            onChange={(title) => set({ title })}
          />
        }
        aside={
          fees > 0 ? (
            <span className="text-sm text-muted-foreground tabular-nums">
              Fees {formatCurrencyFromMinorUnits(fees, c.currency, getCurrencyLocale(c.currency))}
            </span>
          ) : null
        }
      />
      <FieldGroup title="Basics" className="@4xl:grid-cols-3">
        <LabeledField id={`${id}-status`} label="Status">
          <EnumSelect
            id={`${id}-status`}
            value={fields.status}
            options={ORDER_STATUSES}
            onChange={(status) => set({ status })}
          />
        </LabeledField>
        <LabeledField id={`${id}-shop`} label="Shop">
          <Input
            id={`${id}-shop`}
            value={fields.shop}
            maxLength={200}
            placeholder="e.g., AmiAmi"
            title={fields.shop || undefined}
            onChange={(event) => set({ shop: event.target.value })}
          />
        </LabeledField>
        <LabeledField
          id={`${id}-shipping`}
          label="Shipping Method"
          className="col-span-2 @4xl:col-span-1"
        >
          <EnumSelect
            id={`${id}-shipping`}
            value={fields.shippingMethod}
            options={SHIPPING_METHODS}
            onChange={(shippingMethod) => set({ shippingMethod })}
          />
        </LabeledField>
      </FieldGroup>
      <FieldGroup title="Dates" className="@4xl:grid-cols-5">
        <DateField
          id={`${id}-order-date`}
          label="Order Date"
          value={fields.orderDate}
          onChange={(orderDate) => set({ orderDate })}
        />
        <LabeledField id={`${id}-release-date`} label="Release Date">
          <DatePicker
            id={`${id}-release-date`}
            value={fields.releaseDate}
            placeholder={
              latestRelease === ""
                ? "No date"
                : formatDateOnlyForDisplay(latestRelease, c.dateFormat)
            }
            onChange={(releaseDate) => set({ releaseDate })}
          />
        </LabeledField>
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
        <div className="col-span-2 @4xl:col-span-1">
          <DateField
            id={`${id}-collection-date`}
            label="Collection Date"
            value={fields.collectionDate}
            onChange={(collectionDate) => set({ collectionDate })}
          />
        </div>
      </FieldGroup>
      <FieldGroup title="Costs" className="@4xl:grid-cols-5">
        {FEES.map(({ field, label }) => {
          const fieldId = orderFieldId(field);
          const issue = c.issues.find((candidate) => candidate.fieldId === fieldId);
          return (
            <LabeledField
              key={field}
              id={fieldId}
              label={label}
              error={issue?.message}
              className="last:col-span-2 @4xl:last:col-span-1"
            >
              <AmountInput
                id={fieldId}
                value={fields[field]}
                currency={c.currency}
                placeholder="0.00"
                invalid={issue !== undefined}
                onChange={(value) => set({ [field]: value })}
              />
            </LabeledField>
          );
        })}
      </FieldGroup>
      <FieldGroup title="Notes" className="grid-cols-1">
        <Textarea
          aria-label="Notes"
          value={fields.notes}
          onChange={(event) => set({ notes: event.target.value })}
        />
      </FieldGroup>
    </section>
  );
}

/** Searches the viewer's Orders by title, and reads only while it is open. */
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
                  <ImageThumbnail
                    images={result.images}
                    title={result.title}
                    decorative
                    className="size-8 shrink-0 rounded-md outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
                    fallbackIcon={<OrderIcon />}
                  />
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
