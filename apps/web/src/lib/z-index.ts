// Layers portaled to <body> that must stack above the z-50 dialogs, sheets and popovers.
// A toast raised mid-drag, such as a failed status write, has to draw over the dragged card.
export const Z_INDEX = {
  dragOverlay: 55,
  toast: 60,
} as const;
