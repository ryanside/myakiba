import { createId, isCuid } from "@paralleldrive/cuid2";

const PREFIX = "user";
const ID_LENGTH = 24;

/** The username an account gets when it signs up without choosing one, as a Google sign-up does. */
export function generateUsername(): string {
  return `${PREFIX}${createId()}`;
}

export function isGeneratedUsername(username: string): boolean {
  if (!username.startsWith(PREFIX)) return false;
  const id = username.slice(PREFIX.length);
  return isCuid(id, { minLength: ID_LENGTH, maxLength: ID_LENGTH });
}
