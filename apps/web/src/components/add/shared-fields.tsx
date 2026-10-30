import { CONDITIONS, SHIPPING_METHODS } from "@myakiba/contracts/shared/constants";
import { useId } from "react";
import { Input } from "@/components/ui/input";
import { DateField, EnumSelect, LabeledField } from "./add-fields";
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
    <div className="grid grid-cols-2 gap-3 @2xl/bar:grid-cols-3 @4xl/bar:grid-cols-5">
      <LabeledField id={`${id}-shop`} label="Shop" className="col-span-2 @4xl/bar:col-span-1">
        <Input
          id={`${id}-shop`}
          value={shared.shop}
          maxLength={200}
          placeholder="e.g., AmiAmi"
          onChange={(event) => set({ shop: event.target.value })}
        />
      </LabeledField>
      <DateField
        id={`${id}-date`}
        label="Collection Date"
        value={shared.collectionDate}
        onChange={(collectionDate) => set({ collectionDate })}
      />
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
  );
}
