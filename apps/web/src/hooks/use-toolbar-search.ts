import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

export function useToolbarSearch({
  search,
  resetFilters,
}: {
  search: string | undefined;
  resetFilters: () => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [searchResetKey, setSearchResetKey] = useState(0);
  const [hasSearchDraft, setHasSearchDraft] = useState(false);

  useEffect(() => {
    setHasSearchDraft((inputRef.current?.value ?? search ?? "") !== "");
  }, [search]);

  const onSearchInput = (event: FormEvent<HTMLInputElement>): void => {
    setHasSearchDraft(event.currentTarget.value !== "");
  };

  const resetSearch = async (): Promise<void> => {
    setSearchResetKey((key) => key + 1);
    setHasSearchDraft(false);
    await resetFilters();
    // Wait for the cleared value before focusing, because focused inputs defer outside changes.
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  return { inputRef, searchResetKey, hasSearchDraft, onSearchInput, resetSearch };
}
