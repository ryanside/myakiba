import { useState, useMemo } from "react";
import type { CascadeOptions } from "@myakiba/types";
import { ORDER_CASCADE_OPTIONS } from "@myakiba/constants/orders";

const cascadeOptionsList: readonly CascadeOptions[number][] = ORDER_CASCADE_OPTIONS;

export function useCascadeOptions() {
  const [cascadeOptions, setCascadeOptions] = useState<CascadeOptions>([...ORDER_CASCADE_OPTIONS]);

  const handleSelectAll = () => {
    setCascadeOptions([...ORDER_CASCADE_OPTIONS]);
  };

  const handleSelectNone = () => {
    setCascadeOptions([]);
  };

  const handleCascadeOptionChange = (option: CascadeOptions[number], checked: boolean) => {
    setCascadeOptions((prev) =>
      checked ? [...prev, option] : prev.filter((item) => item !== option),
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
