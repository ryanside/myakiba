import { useState, useMemo } from "react";
import type { CascadeOptions } from "@/lib/types";

const cascadeOptionsList = [
  "status",
  "shop",
  "orderDate",
  "paymentDate",
  "shippingDate",
  "collectionDate",
  "shippingMethod",
] as const;

export function useCascadeOptions() {
  const [cascadeOptions, setCascadeOptions] = useState<CascadeOptions>([
    "status",
    "shop",
    "orderDate",
    "paymentDate",
    "shippingDate",
    "collectionDate",
    "shippingMethod",
  ]);

  const handleSelectAll = () => {
    setCascadeOptions([
      "status",
      "shop",
      "orderDate",
      "paymentDate",
      "shippingDate",
      "collectionDate",
      "shippingMethod",
    ]);
  };

  const handleSelectNone = () => {
    setCascadeOptions([]);
  };

  const handleCascadeOptionChange = (
    option: CascadeOptions[number],
    checked: boolean
  ) => {
    setCascadeOptions((prev) =>
      checked ? [...prev, option] : prev.filter((item) => item !== option)
    );
  };

  const cascadeDisplayText = useMemo(() => {
    if (cascadeOptions.length === 0) {
      return "Cascade None";
    }
    if (cascadeOptions.length === cascadeOptionsList.length) {
      return "Cascade All (Default)";
    }
    return cascadeOptions.join(", ");
  }, [cascadeOptions]);

  return {
    cascadeOptions,
    setCascadeOptions,
    handleSelectAll,
    handleSelectNone,
    handleCascadeOptionChange,
    cascadeDisplayText,
    cascadeOptionsList,
  };
}
