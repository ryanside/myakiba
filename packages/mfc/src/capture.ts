import { isSignInLink } from "./guest";
import { ogImageToKeep } from "./page";
import { MFC_PAGE_READS as READS } from "./reads";

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const SIGN_IN_PATH = "/session/signin/";

const DOCUMENT_SKELETON = new Set(["html", "head", "body"]);

// A kept element under any other name takes this one, so its name carries nothing out. No
// reader selects on it, so it matches no reader the original name did not.
const UNKNOWN_ELEMENT = "x-unknown";

const HTML_ELEMENTS = new Set(
  [
    "a abbr address area article aside audio b base bdi bdo blockquote body br button canvas",
    "caption cite code col colgroup data datalist dd del details dfn dialog div dl dt em embed",
    "fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 head header hgroup hr html i",
    "iframe img input ins kbd label legend li link main map mark menu meta meter nav noscript",
    "object ol optgroup option output p param picture pre progress q rp rt ruby s samp script",
    "search section select slot small source span strong style sub summary sup table tbody td",
    "template textarea tfoot th thead time title tr track u ul var video wbr",
    "acronym applet basefont bgsound big blink center dir font frame frameset image isindex",
    "keygen listing marquee menuitem nobr noembed noframes plaintext rb rtc strike tt xmp",
  ].flatMap((names) => names.split(" ")),
);

// Inside a field every element keeps its text, except these, whose content is not text.
const NON_TEXT_ELEMENTS = new Set(
  [
    "script style template noscript noembed noframes plaintext title meta link base",
    "img picture source track video audio canvas iframe frame frameset object embed param",
    "applet bgsound map area svg math input textarea select option optgroup datalist",
    "button output meter progress keygen",
  ].flatMap((names) => names.split(" ")),
);

function tagOf(source: Element): string {
  return HTML_ELEMENTS.has(source.localName) ? source.localName : UNKNOWN_ELEMENT;
}

type Scrub = {
  readonly out: Document;
  readonly firsts: ReadonlyMap<Element, (source: Element) => Element | null>;
  readonly itemObject: Element | null;
  /** The parent of the `Releases…` field, whose unlabelled sibling fields hold further releases. */
  releasesParent: Element | null;
};

/**
 * Serializes only the parts of an MFC page that `MFC_PAGE_READS` names, so the page can leave
 * the MFC tab with nothing else of the signed-in user. Every other element becomes a bare
 * ancestor of a kept part or is dropped, so the readers see the kept parts in the same order
 * and under the same siblings as on the page.
 */
export function scrubMfcPage(doc: Document): string {
  const out = doc.implementation.createHTMLDocument("");
  const firsts = new Map<Element, (source: Element) => Element | null>();
  const keepFirst = (selector: string, copy: (source: Element) => Element | null) => {
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
  const canonicalHref = doc.querySelector(READS.canonicalLink)?.getAttribute("href") ?? null;
  keepFirst(READS.ogImage, (meta) => {
    const content = ogImageToKeep(meta.getAttribute("content") ?? "", canonicalHref);
    return content === null
      ? null
      : withAttributes(out.createElement("meta"), { property: "og:image", content });
  });
  keepFirst(READS.heading, (heading) =>
    withText(
      withAttributes(out.createElement("h1"), { class: READS.headingClass }),
      heading.textContent,
    ),
  );
  const scrub: Scrub = {
    out,
    firsts,
    itemObject: doc.querySelector(READS.itemObject),
    releasesParent: null,
  };
  const root = prune(doc.documentElement, scrub, false) ?? out.createElement("html");
  return `<!DOCTYPE html>\n${root.outerHTML}`;
}

function prune(source: Element, scrub: Scrub, inItemObject: boolean): Element | null {
  const name = source.localName;
  if (READS.hiddenElements.has(name)) return null;
  const first = scrub.firsts.get(source);
  if (first) return first(source);
  if (source.classList.contains(READS.userMenuClass)) return scrubUserMenu(source, scrub.out);
  if (inItemObject && source.matches(READS.itemField)) return copyItemField(source, scrub);
  const inItem = inItemObject || source === scrub.itemObject;
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
  const copy = withAttributes(scrub.out.createElement(tagOf(source)), {
    class: source === scrub.itemObject ? READS.itemObjectClass : null,
  });
  copy.append(...kept);
  return copy;
}

function scrubUserMenu(menu: Element, out: Document): Element {
  const shell = withAttributes(out.createElement(tagOf(menu)), { class: READS.userMenuClass });
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

/**
 * Copies a field a reader reads, or a further release, whole. Of a field no reader reads, it keeps
 * only the label, so the parser still warns of it, and it drops a field with no label that no
 * release continues.
 */
function copyItemField(field: Element, scrub: Scrub): Element | null {
  const copy = copyField(field, scrub.out);
  if (!copy) return null;
  const labels = [...copy.querySelectorAll(READS.fieldLabel)].filter((label) => {
    const outer = label.parentElement?.closest(READS.fieldLabel);
    return !outer || outer === copy;
  });
  const label = labels
    .map((element) => element.textContent)
    .join("")
    .trim();
  const continuesReleases =
    scrub.releasesParent !== null &&
    scrub.releasesParent === field.parentElement &&
    (labels.length === 0 || field.classList.contains(READS.extraReleaseClass));
  const read = READS.fieldLabels.has(label);
  if (!read && label.startsWith(READS.releasesLabel)) {
    scrub.releasesParent = field.parentElement;
    return copy;
  }
  if (continuesReleases || read) return copy;
  if (!label) return null;
  const [first] = labels;
  const shell = withAttributes(scrub.out.createElement(tagOf(field)), { class: "data-field" });
  shell.append(
    withText(
      withAttributes(scrub.out.createElement(first?.localName ?? "div"), { class: "data-label" }),
      label,
    ),
  );
  return shell;
}

function copyField(source: Element, out: Document): Element | null {
  const name = source.localName;
  if (NON_TEXT_ELEMENTS.has(name)) return null;
  const copy = withAttributes(out.createElement(tagOf(source)), {
    class: readClasses(source),
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

function readClasses(source: Element): string | null {
  const read = [...source.classList].filter((name) => READS.fieldClasses.has(name));
  return read.length > 0 ? read.join(" ") : null;
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
