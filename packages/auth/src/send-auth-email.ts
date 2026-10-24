import { Result } from "better-result";
import { APIError } from "better-auth/api";
import { createLogger } from "evlog";
import type { Resend } from "resend";
import { SendAuthEmailFailed } from "./errors/send-auth-email-failed";

export async function sendAuthEmail(
  resend: Resend,
  purpose: "verification" | "reset",
  input: Parameters<Resend["emails"]["send"]>[0],
): Promise<void> {
  const sent = await Result.tryPromise({
    try: () => resend.emails.send(input),
    catch: (cause) => new SendAuthEmailFailed({ purpose, cause }),
  });
  const checked = sent.andThen(({ error }) =>
    error ? Result.err(new SendAuthEmailFailed({ purpose, cause: error })) : Result.ok(),
  );
  if (checked.isOk()) return;
  const emailLog = createLogger({ action: "auth.sendEmail", outcome: "error", purpose });
  emailLog.error(checked.error);
  emailLog.emit();
  throw new APIError("INTERNAL_SERVER_ERROR", {
    code: "SEND_AUTH_EMAIL_FAILED",
    message: "We couldn't send the email. Please try again.",
  });
}
