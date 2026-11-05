/**
 * Every inline cell's trigger: a box with 8px of room on each side, pulled back by the same amount
 * so its text still starts on the column's edge. The cell's own padding keeps the box inside the
 * cell, so nothing clips it.
 */
export const CELL_TRIGGER_CLASS_NAME = "-mx-2 w-[calc(100%+1rem)] rounded-lg px-2";

/**
 * The editor takes the trigger's exact box, so clicking in moves nothing: the text stays where it
 * was and the field spans the same width. Its ring is drawn inside, so the cell never clips it.
 */
export const CELL_EDITOR_CLASS_NAME = `${CELL_TRIGGER_CLASS_NAME} h-8 border-0 bg-muted text-sm text-foreground shadow-none ring-1 ring-ring ring-inset focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset md:text-sm dark:bg-muted [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`;

/** In a table row the select reads as plain text; its chrome appears on hover and focus. */
export const QUIET_SELECT_TRIGGER_CLASS_NAME = `${CELL_TRIGGER_CLASS_NAME} border-transparent bg-transparent dark:bg-transparent hover:border-input dark:hover:bg-input/30 focus-visible:border-ring data-popup-open:border-input dark:data-popup-open:bg-input/30 [&>svg]:opacity-0 hover:[&>svg]:opacity-100 focus-visible:[&>svg]:opacity-100 data-popup-open:[&>svg]:opacity-100`;
