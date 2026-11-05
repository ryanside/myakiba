import { useRef, useState } from "react";
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
  const [draft, setDraft] = useState({ search, hasText: false });

  if (draft.search !== search) {
    setDraft({ search, hasText: false });
  }

  const onSearchInput = (event: FormEvent<HTMLInputElement>): void => {
    setDraft({ search, hasText: event.currentTarget.value !== "" });
  };

  const resetSearch = async (): Promise<void> => {
    setSearchResetKey((key) => key + 1);
    setDraft({ search, hasText: false });
    await resetFilters();
    // Wait for the cleared value before focusing, because focused inputs defer outside changes.
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  return { inputRef, searchResetKey, hasSearchDraft: draft.hasText, onSearchInput, resetSearch };
}
