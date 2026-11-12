const defaultRedirectPath = "/dashboard";

/**
 * A path on this site. A browser reads a backslash as a slash and drops tabs and newlines, so
 * `/\\evil.com` and `/\t/evil.com` would leave it.
 */
export function isInternalPath(path: string): boolean {
  return path.startsWith("/") && !path.startsWith("//") && !/[\\\p{Cc}]/u.test(path);
}

export function resolvePostAuthRedirect(redirectTo: string | undefined): string {
  if (redirectTo === undefined || !isInternalPath(redirectTo)) {
    return defaultRedirectPath;
  }

  return redirectTo;
}

export function getAuthRedirectUrl(path: string): string {
  const url = new URL(path, window.location.origin);

  if (url.origin !== window.location.origin) {
    return new URL(defaultRedirectPath, window.location.origin).toString();
  }

  return url.toString();
}
