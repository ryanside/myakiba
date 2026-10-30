import {
  COLLECTION_STATUSES,
  CONDITIONS,
  SHIPPING_METHODS,
} from "@myakiba/contracts/shared/constants";
import { useId } from "react";
import { Input } from "@/components/ui/input";
import { DateField, EnumSelect, LabeledField } from "./add-fields";
import { STATUS_DATE_LABEL } from "./commit-input";
import type { SharedFields as Shared } from "./commit-input";

/** What every new Collection Item in this commit starts with. A row's details can override it. */
export function SharedFields({
  shared,
  onChange,
}: {
  readonly shared: Shared;
  readonly onChange: (shared: Shared) => void;
}) {
  const id = useId();
  const set = (patch: Partial<Shared>) => onChange({ ...shared, ...patch });
  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-3 @2xl/bar:grid-cols-3 @4xl/bar:grid-cols-6">
        <LabeledField id={`${id}-status`} label="Status">
          <EnumSelect
            id={`${id}-status`}
            value={shared.status}
            options={COLLECTION_STATUSES}
            onChange={(status) => set({ status })}
          />
        </LabeledField>
        <DateField
          id={`${id}-date`}
          label={STATUS_DATE_LABEL[shared.status]}
          value={shared.date}
          onChange={(date) => set({ date })}
        />
        <LabeledField id={`${id}-shop`} label="Shop">
          <Input
            id={`${id}-shop`}
            value={shared.shop}
            maxLength={200}
            placeholder="e.g., AmiAmi"
            onChange={(event) => set({ shop: event.target.value })}
          />
        </LabeledField>
        <LabeledField id={`${id}-shipping`} label="Shipping Method">
          <EnumSelect
            id={`${id}-shipping`}
            value={shared.shippingMethod}
            options={SHIPPING_METHODS}
            onChange={(shippingMethod) => set({ shippingMethod })}
          />
        </LabeledField>
        <LabeledField id={`${id}-condition`} label="Condition">
          <EnumSelect
            id={`${id}-condition`}
            value={shared.condition}
            options={CONDITIONS}
            onChange={(condition) => set({ condition })}
          />
        </LabeledField>
        <LabeledField id={`${id}-count`} label="Count">
          <Input
            id={`${id}-count`}
            type="number"
            inputMode="numeric"
            min={1}
            max={999}
            className="tabular-nums"
            value={shared.count}
            onChange={(event) => {
              const count = Number.parseInt(event.target.value, 10);
              set({ count: Number.isNaN(count) ? 1 : Math.min(Math.max(count, 1), 999) });
            }}
          />
        </LabeledField>
      </div>
      {shared.status === "Owned" ? null : (
        <p className="text-xs text-pretty text-muted-foreground">
          Your Collection lists Owned items. Until these are Owned, they show on each Item&apos;s
          page. Choose Order to keep them together.
        </p>
      )}
    </div>
  );
}
