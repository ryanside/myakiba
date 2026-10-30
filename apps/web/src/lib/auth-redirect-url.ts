const defaultRedirectPath = "/dashboard";

export function resolvePostAuthRedirect(redirectTo: string | undefined): string {
  if (!redirectTo?.startsWith("/") || redirectTo.startsWith("//")) {
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
