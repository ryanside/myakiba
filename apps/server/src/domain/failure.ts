import type { AnyTaggedError, TaggedErrorInstance } from "better-result";
import { tagged } from "./tagged";

/** What a client may be told about an expected failure. The kernel maps each to its status. */
export type Category =
  | "bad_request"
  | "forbidden"
  | "conflict"
  | "payload_too_large"
  | "not_found"
  | "too_many_requests";

/** The factory fixes `message` and `category`, so a prop of either name is refused at `new`. */
type Fixed = { readonly message?: never; readonly category?: never };
type ArgsOf<P> = keyof P extends never ? [props?: Fixed] : [props: P & Fixed];

/**
 * Any error a client may see: a tagged error that carries its category and its
 * literal message. `serve` answers the category's status with `message`.
 */
export type AnyFailure = AnyTaggedError & { readonly category: Category };

export type FailureInstance<
  Tag extends string,
  C extends Category,
  M extends string,
  P extends object,
> = TaggedErrorInstance<Tag, P & { readonly message: M }> & { readonly category: C };

type FailureClass<
  Tag extends string,
  C extends Category,
  M extends string,
  A extends object,
> = new (...args: ArgsOf<A>) => FailureInstance<Tag, C, M, A>;

const isMessageOf = <A>(
  message: string | ((props: A) => string),
): message is (props: A) => string => typeof message === "function";

/**
 * Declares one public failure. The class is the single source of its answer:
 *
 *   export class OrderNotFound extends Failure("OrderNotFound", "not_found", "Order not found") {}
 *   return Result.err(new OrderNotFound());
 *
 * A message that depends on the failure's own props is a function of them, and Eden
 * sees the union of its literal returns. Developer context that stays on the server is
 * a prop the message function takes, even when the message does not read it.
 */
export function Failure<
  const Tag extends string,
  const C extends Category,
  const M extends string,
  A extends object = Record<never, never>,
>(tag: Tag, category: C, message: M | ((props: A) => M)): FailureClass<Tag, C, M, A> {
  const Declared: abstract new (...args: ArgsOf<A>) => AnyFailure = class extends tagged(tag)<{
    readonly message: string;
  }> {
    readonly category = category;

    constructor(...[props]: ArgsOf<A>) {
      // ArgsOf demands the props whenever A has a field, so a message function always gets them.
      const fields = (props ?? {}) as A;
      super({ ...fields, message: isMessageOf(message) ? message(fields) : message });
    }
  };
  // The class carries `category` and builds `message` from `message`, so its instances are
  // these literal types; TS cannot follow the literals through the class expression.
  return Declared as FailureClass<Tag, C, M, A>;
}
