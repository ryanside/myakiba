import { Result } from "better-result";
import * as z from "zod";
import { ApiInvalid } from "@/lib/errors/api-invalid";
import { ApiNotFound } from "@/lib/errors/api-not-found";
import { ApiRejected } from "@/lib/errors/api-rejected";
import { ApiServerError } from "@/lib/errors/api-server-error";
import { ApiUnreachable } from "@/lib/errors/api-unreachable";
import { ApiUnreadable } from "@/lib/errors/api-unreadable";

/**
 * What an Eden call resolves with. Eden answers a fetch that threw with a synthetic 503 and no
 * `response`, so a 503 without one means nothing answered.
 */
export type EdenAnswer<Data = unknown> =
  | { readonly data: Data; readonly error: null; readonly response?: Response }
  | {
      readonly data: null;
      readonly error: { readonly status: number; readonly value: unknown };
      readonly response?: Response;
    };

type OkData<Answer extends EdenAnswer> = Extract<Answer, { error: null }>["data"];

export type ApiFailure =
  | ApiUnreachable
  | ApiNotFound
  | ApiRejected
  | ApiInvalid
  | ApiServerError
  | ApiUnreadable;

/** The answers a wording policy words. An unreadable answer always shows what broke. */
type Answered = Exclude<ApiFailure, ApiUnreadable>;

/**
 * How one call words its failures. `fallback` is the call's own text. The rest exists only where
 * a call already differs:
 * - `empty`: the text for a 2xx without data, for a call that requires data;
 * - `invalid`: the text for a 422, in place of `fallback`;
 * - `policy`: a wording other than the safe one, from `FAILURE_TEXT`.
 */
export type Wording = {
  readonly fallback: string;
  readonly empty?: string;
  readonly invalid?: string;
  readonly policy?: "legacy" | "fixed" | "bodyMessage";
};

type Policy = NonNullable<Wording["policy"]> | "safe";

/** What an answer says, without its text. */
type Facts<Failure extends Answered> = Pick<
  Failure,
  Extract<keyof Failure, "status" | "body" | "cause">
>;

/** One policy: the user's text for each answer. A new tag fails every row until it is worded. */
type FailureText = {
  readonly [Tag in Answered["_tag"]]: (
    facts: Facts<Extract<Answered, { _tag: Tag }>>,
    wording: Wording,
  ) => string;
};

/** A visible character: not whitespace and not an invisible format character such as U+200B. */
const serverMessage = z.string().regex(/[^\s\p{Cf}]/u);

/** A JSON body or an error that carries a `message`. */
const withMessage = z.looseObject({ message: z.unknown() });

/** Only a 4xx text body with visible text is a message the server wrote for the user. */
const SAFE_TEXT: FailureText = {
  ApiUnreachable: (_facts, { fallback }) => fallback,
  ApiNotFound: ({ body }, { fallback }) => serverMessage.safeParse(body).data ?? fallback,
  ApiRejected: ({ status, body }, { fallback }) =>
    (status >= 400 && serverMessage.safeParse(body).data) || fallback,
  ApiInvalid: ({ body }, { fallback, invalid }) =>
    serverMessage.safeParse(body).data ?? invalid ?? fallback,
  ApiServerError: (_facts, { fallback }) => fallback,
};

/** One text for every failure. */
const FIXED_TEXT: FailureText = {
  ApiUnreachable: (_facts, { fallback }) => fallback,
  ApiNotFound: (_facts, { fallback }) => fallback,
  ApiRejected: (_facts, { fallback }) => fallback,
  ApiInvalid: (_facts, { fallback }) => fallback,
  ApiServerError: (_facts, { fallback }) => fallback,
};

/** A JSON body's `message`, or the fetch error's. */
const BODY_MESSAGE_TEXT: FailureText = {
  ApiUnreachable: ({ cause }, { fallback }) =>
    String(withMessage.safeParse(cause).data?.message || fallback),
  ApiNotFound: ({ body }, { fallback }) =>
    String(withMessage.safeParse(body).data?.message || fallback),
  ApiRejected: ({ body }, { fallback }) =>
    String(withMessage.safeParse(body).data?.message || fallback),
  ApiInvalid: ({ body }, { fallback }) =>
    String(withMessage.safeParse(body).data?.message || fallback),
  ApiServerError: ({ body }, { fallback }) =>
    String(withMessage.safeParse(body).data?.message || fallback),
};

/** How each policy words a failure. Legacy callers use the same safe text. */
const FAILURE_TEXT = {
  safe: SAFE_TEXT,
  legacy: SAFE_TEXT,
  fixed: FIXED_TEXT,
  bodyMessage: BODY_MESSAGE_TEXT,
} as const satisfies Record<Policy, FailureText>;

function decode(
  { data, error, response }: EdenAnswer,
  wording: Wording,
): Result<unknown, ApiFailure> {
  if (!error) {
    if (wording.empty !== undefined && !data) {
      return Result.err(new ApiUnreadable({ cause: null, message: wording.empty }));
    }
    return Result.ok(data);
  }
  const text = FAILURE_TEXT[wording.policy ?? "safe"];
  const { status, value: body } = error;
  if (status === 503 && response === undefined) {
    return Result.err(
      new ApiUnreachable({ cause: body, message: text.ApiUnreachable({ cause: body }, wording) }),
    );
  }
  if (status === 404) {
    return Result.err(new ApiNotFound({ body, message: text.ApiNotFound({ body }, wording) }));
  }
  if (status === 422) {
    return Result.err(new ApiInvalid({ body, message: text.ApiInvalid({ body }, wording) }));
  }
  if (status >= 500) {
    // unicorn(throw-new-error) reads a call to a name ending in Error as a missing `new`.
    const { ApiServerError: serverErrorText } = text;
    const message = serverErrorText({ status, body }, wording);
    return Result.err(new ApiServerError({ status, body, message }));
  }
  return Result.err(
    new ApiRejected({ status, body, message: text.ApiRejected({ status, body }, wording) }),
  );
}

/**
 * The one reader of Eden's `{ data, error }`. It turns one call into a Result whose failure's
 * `message` is the text the call shows users. A body Eden could not read shows what broke.
 */
export function call<Answer extends EdenAnswer>(
  request: PromiseLike<Answer>,
  wording: Wording & { readonly empty: string },
): Promise<Result<NonNullable<OkData<Answer>>, ApiFailure>>;
export function call<Answer extends EdenAnswer>(
  request: PromiseLike<Answer>,
  wording: Wording,
): Promise<Result<OkData<Answer>, ApiFailure>>;
export async function call(
  request: PromiseLike<EdenAnswer>,
  wording: Wording,
): Promise<Result<unknown, ApiFailure>> {
  const answer = await Result.tryPromise({
    try: async () => request,
    catch: (cause) =>
      new ApiUnreadable({ cause, message: cause instanceof Error ? cause.message : String(cause) }),
  });
  return answer.andThen((answered) => decode(answered, wording));
}
