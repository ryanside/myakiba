/** Whether a write touched every id it was sent. An empty request finds nothing, so it answers 404. */
export function foundAll(ids: readonly string[], touched: number): boolean {
  return touched > 0 && touched === new Set(ids).size;
}
