import { useRef, useState } from "react";

export function useToolbarSearch(resetFilters: () => Promise<void>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [searchResetKey, setSearchResetKey] = useState(0);
  const [hasSearchDraft, setHasSearchDraft] = useState(false);

  const onSearchTextChange = (text: string): void => {
    setHasSearchDraft(text !== "");
  };

  const resetSearch = async (): Promise<void> => {
    setSearchResetKey((key) => key + 1);
    setHasSearchDraft(false);
    await resetFilters();
    // Wait for the cleared value before focusing, because focused inputs defer outside changes.
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  return { inputRef, searchResetKey, hasSearchDraft, onSearchTextChange, resetSearch };
}
