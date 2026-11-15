import { PaintBucketIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Result } from "better-result";
import { FillMenu } from "@/components/fill/fill-menu";
import type { FillDraft, FillGroup } from "@/components/fill/fill-menu";
import { Button } from "@/components/ui/button";
import { MAX_TAGS } from "@/components/vocabulary-fields";
import { readCount } from "@/lib/count-input";
import { FILL_FIELD } from "@/lib/fill-fields";
import type { AddController } from "./add-controller";
import type { RowOverrides } from "./add-draft";
import type { SharedFields } from "./commit-input";
import { hasOwnValue } from "./row-fields";
import type { Field, FieldId } from "./row-fields";

/** The value every selected row already shares, or the shared fallback. */
function initialDraft(c: AddController, field: FieldId): FillDraft {
  const form = c.resolvedForm;
  const shared = form.shared;
  const same = <Value,>(read: (overrides: RowOverrides) => Value): Value | undefined => {
    const [first, ...rest] = c.commitRows.map(({ row }) => read(row.overrides));
    return first !== undefined && rest.every((value) => value === first) ? first : undefined;
  };
  const isCollection = form.kind === "collection";
  const text = (): string => {
    switch (field) {
      case "price":
        return same((overrides) => overrides.price) ?? "";
      case "count": {
        const count = same((overrides) => overrides.count);
        if (count !== undefined) return String(count);
        return isCollection ? String(shared.count) : "";
      }
      case "shop":
        return same((overrides) => overrides.shop) ?? (isCollection ? shared.shop : "");
      case "notes":
        return same((overrides) => overrides.notes) ?? "";
      default:
        return "";
    }
  };
  const date = (): string | null => {
    if (field === "orderDate" || field === "paymentDate" || field === "shippingDate") {
      return same((overrides) => overrides[field]) ?? null;
    }
    if (field === "collectionDate") {
      return (
        same((overrides) => overrides.collectionDate) ??
        (isCollection ? shared.collectionDate : null)
      );
    }
    return null;
  };
  return {
    text: text(),
    condition: same((overrides) => overrides.condition) ?? shared.condition,
    shipping: same((overrides) => overrides.shippingMethod) ?? shared.shippingMethod,
    date: date(),
    score: same((overrides) => overrides.score) ?? 0,
    tags: [],
  };
}

function writeFill(c: AddController, field: FieldId, draft: FillDraft) {
  const form = c.resolvedForm;
  const ids = c.commitRows.map(({ row }) => row.itemId);
  // Only a fill of every row may become the shared value, which rows without their own value read.
  const setShared = (patch: Partial<SharedFields>) => {
    if (form.kind === "collection" && ids.length === c.rows.length) {
      c.setForm({ ...form, shared: { ...form.shared, ...patch } });
    }
  };
  switch (field) {
    case "price":
      c.bulkEdit(ids, { price: draft.text });
      return;
    case "count": {
      const count = readCount(draft.text);
      c.bulkEdit(ids, { count });
      setShared({ count: count ?? 1 });
      return;
    }
    case "condition":
      c.bulkEdit(ids, { condition: draft.condition });
      setShared({ condition: draft.condition });
      return;
    case "shop":
      c.bulkEdit(ids, { shop: draft.text });
      setShared({ shop: draft.text });
      return;
    case "orderDate":
    case "paymentDate":
    case "shippingDate":
      c.bulkEdit(ids, { [field]: draft.date });
      return;
    case "collectionDate":
      c.bulkEdit(ids, { collectionDate: draft.date });
      setShared({ collectionDate: draft.date });
      return;
    case "score":
      c.bulkEdit(ids, { score: draft.score });
      return;
    case "tags":
      for (const { row } of c.commitRows) {
        const merged = [...new Set([...(row.overrides.tags ?? []), ...draft.tags])];
        c.edit(row.itemId, { tags: merged });
      }
      return;
    case "notes":
      c.bulkEdit(ids, { notes: draft.text });
      return;
    case "shipping":
      c.bulkEdit(ids, { shippingMethod: draft.shipping });
  }
}

const rowCount = (count: number) => (count === 1 ? "1 row" : `${count} rows`);

export function AddFillMenu({
  fields,
  c,
  onFilled,
}: {
  readonly fields: readonly Field[];
  readonly c: AddController;
  readonly onFilled: (message: string) => void;
}) {
  const count = c.commitRows.length;
  const rows: FillGroup<FieldId> = {
    key: "rows",
    count,
    fields: fields.map(({ id }) => id),
    seed: (field) => initialDraft(c, field),
    hint: (field) => {
      if (field === "tags") return "Adds to the tags each row already has.";
      const own = c.commitRows.filter(({ row }) => hasOwnValue(row, field)).length;
      return own === 0 ? null : `Replaces the value in ${rowCount(own)}.`;
    },
    prepare: (field, draft) => {
      const overfull =
        field === "tags"
          ? c.commitRows.filter(
              ({ row }) => new Set([...(row.overrides.tags ?? []), ...draft.tags]).size > MAX_TAGS,
            ).length
          : 0;
      if (overfull > 0) {
        return Result.err(`${rowCount(overfull)} would have more than ${MAX_TAGS} tags.`);
      }
      return Result.ok({
        run: async () => {
          writeFill(c, field, draft);
          onFilled(`Filled ${FILL_FIELD[field].label} on ${count} selected`);
          return Result.ok();
        },
      });
    },
    pricePlaceholder: "Blank uses the release price",
  };
  return (
    <FillMenu
      groups={[rows]}
      currency={c.currency}
      trigger={
        <Button type="button" variant="ghost" size="xs" disabled={c.rows.length === 0}>
          <HugeiconsIcon icon={PaintBucketIcon} data-icon="inline-start" aria-hidden="true" />
          Fill all
        </Button>
      }
    />
  );
}
