import type { ReactNode } from "react";

/** Hides a toolbar button's text below the width a labelled toolbar needs. */
export const TOOLBAR_LABEL_CLASS = "@max-[58rem]/toolbar:sr-only";

/** Lets the search give up width before the toolbar wraps. */
export const TOOLBAR_SEARCH_CLASS =
  "@min-[37.5rem]/toolbar:w-40 @min-[37.5rem]/toolbar:grow @min-[37.5rem]/toolbar:max-w-64";

/**
 * The Collection and Orders toolbar. It keeps one row as long as it can: from 58rem its buttons
 * carry text, from 37.5rem they show icons only, and below that the query controls take the first
 * row and the view controls the second. The view toggle and Add always move together.
 */
export function DataToolbar({
  query,
  columns,
  view,
  add,
}: {
  readonly query: ReactNode;
  readonly columns: ReactNode;
  readonly view: ReactNode;
  readonly add: ReactNode;
}): React.JSX.Element {
  return (
    <div className="@container/toolbar flex w-full flex-wrap items-center gap-2">
      <div className="contents @min-[37.5rem]/toolbar:flex @min-[37.5rem]/toolbar:flex-auto @min-[37.5rem]/toolbar:items-center @min-[37.5rem]/toolbar:gap-2">
        <div className="flex min-w-0 items-center gap-2 @max-[37.5rem]/toolbar:basis-full @min-[37.5rem]/toolbar:contents">
          {query}
        </div>
        {columns}
      </div>
      <div className="ml-auto flex items-center gap-2">
        {view}
        {add}
      </div>
    </div>
  );
}
