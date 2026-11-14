// The trigger reaches the cell's clipping edge, so its focus ring is drawn inside it.
export const CELL_TRIGGER_CLASS_NAME =
  "-mx-2 w-[calc(100%+1rem)] rounded-lg px-2 press-none focus-visible:ring-inset";

export const CELL_EDITOR_CLASS_NAME = `${CELL_TRIGGER_CLASS_NAME} h-8 border-0 bg-muted text-base text-foreground shadow-none ring-1 ring-ring ring-inset focus-visible:ring-1 focus-visible:ring-ring md:text-sm dark:bg-muted [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`;

export const QUIET_SELECT_TRIGGER_CLASS_NAME = `${CELL_TRIGGER_CLASS_NAME} border-transparent bg-transparent dark:bg-transparent hover:border-input dark:hover:bg-input/30 focus-visible:border-ring data-popup-open:border-input dark:data-popup-open:bg-input/30 [&>svg]:opacity-0 hover:[&>svg]:opacity-100 focus-visible:[&>svg]:opacity-100 data-popup-open:[&>svg]:opacity-100`;
