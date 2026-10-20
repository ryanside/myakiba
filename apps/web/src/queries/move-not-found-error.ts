/** The target Order or the moved Collection Items no longer exist. Its message is safe to show. */
export class MoveNotFoundError extends Error {
  override readonly name = "MoveNotFoundError";
}
