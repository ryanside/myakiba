const REMOVED = "script, style, noscript, iframe, form, input, textarea, select, button, template";
const KEPT_META = 'meta[property="og:image"], meta[name="pictures"], meta[name="description"]';
const COMMENT_NODE = 8;

/**
 * Serializes an MFC page without what the parser never reads and what identifies the
 * signed-in user, so the page can leave the MFC tab. A denylist, so MFC markup knowledge
 * stays on the server.
 */
export function scrubMfcPage(doc: Document): string {
  const root = doc.documentElement.cloneNode(true) as HTMLElement;
  for (const element of root.querySelectorAll(REMOVED)) element.remove();
  for (const link of root.querySelectorAll('link:not([rel="canonical"])')) link.remove();
  for (const meta of root.querySelectorAll("meta")) {
    if (!meta.matches(KEPT_META)) meta.remove();
  }
  for (const menu of root.querySelectorAll(".user-menu")) keepOnlyClass(menu);
  for (const element of root.querySelectorAll("[href]")) {
    if (isProfileLink(element.getAttribute("href") ?? "")) keepOnlyClass(element);
  }
  removeComments(root);
  return `<!DOCTYPE html>\n${root.outerHTML}`;
}

function keepOnlyClass(element: Element): void {
  element.replaceChildren();
  for (const name of element.getAttributeNames()) {
    if (name !== "class") element.removeAttribute(name);
  }
}

function isProfileLink(href: string): boolean {
  const url = URL.parse(href, "https://myfigurecollection.net");
  return url?.hostname === "myfigurecollection.net" && url.pathname.startsWith("/profile/");
}

function removeComments(node: Node): void {
  let child = node.firstChild;
  while (child) {
    const next = child.nextSibling;
    if (child.nodeType === COMMENT_NODE) child.remove();
    else removeComments(child);
    child = next;
  }
}
