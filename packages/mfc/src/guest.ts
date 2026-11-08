/** MFC shows a signed-out visitor a guest user menu whose handle links here. */
export function isSignInLink(href: string): boolean {
  return URL.parse(href, "https://myfigurecollection.net")?.pathname === "/session/signin/";
}
