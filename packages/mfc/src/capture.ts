import { isSignInLink } from "./guest";
import { MFC_PAGE_READS as READS } from "./reads";

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const SIGN_IN_PATH = "/session/signin/";

const DOCUMENT_SKELETON = new Set(["html", "head", "body"]);

type Scrub = {
  readonly out: Document;
  readonly firsts: ReadonlyMap<Element, (source: Element) => Element>;
  readonly itemObject: Element | null;
};

/**
 * Serializes only the parts of an MFC page that `MFC_PAGE_READS` names, so the page can leave
 * the MFC tab with nothing else of the signed-in user. Every other element becomes a bare
 * ancestor of a kept part or is dropped, so the readers see the kept parts in the same order
 * and under the same siblings as on the page.
 */
export function scrubMfcPage(doc: Document): string {
  const out = doc.implementation.createHTMLDocument("");
  const firsts = new Map<Element, (source: Element) => Element>();
  const keepFirst = (selector: string, copy: (source: Element) => Element) => {
    const element = doc.querySelector(selector);
    if (element) firsts.set(element, copy);
  };
  keepFirst(READS.title, (title) => withText(out.createElement("title"), title.textContent));
  keepFirst(READS.canonicalLink, (link) =>
    withAttributes(out.createElement("link"), {
      rel: "canonical",
      href: link.getAttribute("href"),
    }),
  );
  keepFirst(READS.ogImage, (meta) =>
    withAttributes(out.createElement("meta"), {
      property: "og:image",
      content: meta.getAttribute("content"),
    }),
  );
  keepFirst(READS.heading, (heading) =>
    withText(
      withAttributes(out.createElement("h1"), { class: heading.getAttribute("class") }),
      heading.textContent,
    ),
  );
  const scrub: Scrub = { out, firsts, itemObject: doc.querySelector(READS.itemObject) };
  const root = prune(doc.documentElement, scrub, false) ?? out.createElement("html");
  return `<!DOCTYPE html>\n${root.outerHTML}`;
}

function prune(source: Element, scrub: Scrub, inItemObject: boolean): Element | null {
  const name = source.localName;
  if (READS.hiddenElements.has(name)) return null;
  const first = scrub.firsts.get(source);
  if (first) return first(source);
  if (source.classList.contains(READS.userMenuClass)) return scrubUserMenu(source, scrub.out);
  const inItem = inItemObject || source === scrub.itemObject;
  if (inItem && source.matches(READS.itemField)) return copyField(source, scrub.out);
  const kept: Node[] = [];
  for (const child of source.childNodes) {
    if (child.nodeType === ELEMENT_NODE) {
      const copy = prune(child as Element, scrub, inItem);
      if (copy) kept.push(copy);
    } else if (
      child.nodeType === TEXT_NODE &&
      child.textContent?.includes(READS.notFoundSentence)
    ) {
      kept.push(scrub.out.createTextNode(READS.notFoundSentence));
    }
  }
  if (kept.length === 0 && !DOCUMENT_SKELETON.has(name)) return null;
  const copy = withAttributes(scrub.out.createElement(name), {
    class: source === scrub.itemObject ? source.getAttribute("class") : null,
  });
  copy.append(...kept);
  return copy;
}

function scrubUserMenu(menu: Element, out: Document): Element {
  const shell = withAttributes(out.createElement(menu.localName), {
    class: menu.getAttribute("class"),
  });
  if (isGuestMenu(menu)) {
    shell.append(
      withAttributes(out.createElement("a"), { class: READS.handleClass, href: SIGN_IN_PATH }),
    );
  }
  return shell;
}

function isGuestMenu(menu: Element): boolean {
  const handle = menu.querySelector("a");
  return (
    handle?.classList.contains(READS.handleClass) === true &&
    isSignInLink(handle.getAttribute("href") ?? "")
  );
}

function copyField(source: Element, out: Document): Element | null {
  const name = source.localName;
  if (!READS.fieldElements.has(name)) return null;
  const copy = withAttributes(out.createElement(name), {
    class: source.getAttribute("class"),
    href: name === "a" ? readFieldHrefIds(source.getAttribute("href")) : null,
    switch: source.hasAttribute("switch") ? "" : null,
  });
  for (const child of source.childNodes) {
    if (child.nodeType === TEXT_NODE) copy.append(child.textContent ?? "");
    else if (child.nodeType === ELEMENT_NODE) {
      const kept = copyField(child as Element, out);
      if (kept) copy.append(kept);
    }
  }
  return copy;
}

function readFieldHrefIds(href: string | null): string | null {
  if (href === null) return null;
  const entry = READS.entryHref.exec(href)?.[0] ?? "";
  const rating = READS.ratingHref.exec(href)?.[0] ?? "";
  return entry + rating || null;
}

function withAttributes(element: Element, attributes: Record<string, string | null>): Element {
  for (const [name, value] of Object.entries(attributes)) {
    if (value !== null) element.setAttribute(name, value);
  }
  return element;
}

function withText(element: Element, text: string | null): Element {
  element.textContent = text;
  return element;
}
