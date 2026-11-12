// Components import their own CSS, so no separate style import is required.

// The stage: the canvas, the script, the cursor, measuring and playback
export { Stage } from "./stage";
export type { Act } from "./act";
export type { Point, Rect } from "./measure";
export type { Theme, Layout } from "./looks";

// Frames: windows and placeholders, from real geometry
export { Window, Bar, Text } from "./window";

// Motion: behaviors that have to hold up frame by frame (motion/, one file per part)
export { Count, Roll, Collapse, Popover } from "./motion";

// Small parts: starting points with quiet defaults; restyle them as the product does (parts/)
export { Menu, Row } from "./parts";
