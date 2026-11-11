export async function loadFont(font: string): Promise<void> {
  try {
    await document.fonts.load(font);
  } catch {
    // The text falls back to the next face in its stack.
  }
}
