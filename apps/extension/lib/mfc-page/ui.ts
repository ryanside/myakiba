import { MFC_SETTINGS_URL } from "@myakiba/contracts/add/constants";
import type { CaptureRefusal } from "../errors/capture-refused";

export type PickRefusal = CaptureRefusal | "full" | "storage_failed" | "failed";

export type PickView = {
  readonly picked: boolean;
  readonly busy: boolean;
  readonly count: number;
  readonly full: boolean;
  readonly refusal: PickRefusal | null;
};

export type PickUi = {
  readonly toggle: HTMLElement;
  readonly render: (view: PickView) => void;
};

const REVIEW_TARGET = "myakiba-add";

const FULL_TEXT = "Your picks are full.";
const FULL_LINK = "Review them in myakiba.";

type RefusalCopy = {
  readonly text: string;
  readonly link?: { readonly label: string; readonly to: "review" | "settings" };
};

const REFUSAL_COPY = {
  sfw_hidden: {
    text: "MyFigureCollection hides this item while SFW mode is on. Turn SFW off in the menu under your profile picture, reload, and pick it again.",
    link: { label: "Open MFC settings", to: "settings" },
  },
  not_an_item_page: {
    text: "This page does not read as an MFC item page, so nothing was picked. Reload it and try again.",
  },
  wrong_item: {
    text: "This page shows a different item than its address, so nothing was picked. Reload it and try again.",
  },
  full: { text: FULL_TEXT, link: { label: FULL_LINK, to: "review" } },
  storage_failed: {
    text: "Your browser could not save this change. Try again, or review your picks to make room.",
    link: { label: "Review in myakiba", to: "review" },
  },
  failed: { text: "Something went wrong, so nothing changed. Reload this page and try again." },
} as const satisfies Record<PickRefusal, RefusalCopy>;

const SURFACE =
  "background: #2b2b2b; color: #fff; border: 1px solid #666; border-radius: 4px; font: 13px/1.4 arial, helvetica, sans-serif;";

const TOGGLE_CSS = `
:host { display: block; flex: none; position: relative; }
:host([data-floating]) { position: fixed; right: 16px; bottom: 64px; z-index: 1000; }
/* The numbers are MFC's own .action metrics. Colors derive from the inherited text color, so both MFC themes fit. */
button.toggle {
  all: unset; box-sizing: border-box; display: inline-grid; cursor: pointer; white-space: nowrap;
  font: inherit; height: 48px; line-height: 48px; padding: 0 16px; margin: 0 4px; border-radius: 4px;
  color: color-mix(in srgb, currentColor 85%, transparent);
  background: color-mix(in srgb, currentColor 4%, transparent);
}
button.toggle:hover { background: color-mix(in srgb, currentColor 10%, transparent); }
button.toggle:focus-visible { outline: 2px solid currentColor; outline-offset: -2px; }
button.toggle[aria-pressed="true"] { background: color-mix(in srgb, currentColor 18%, transparent); }
button.toggle[aria-busy="true"] { cursor: progress; opacity: 0.7; }
:host([data-floating]) button.toggle {
  height: 40px; margin: 0; ${SURFACE} font-size: 14px; line-height: 38px;
}
:host([data-floating]) button.toggle:hover { background: #3a3a3a; }
/* Every label shares one grid cell, so the button keeps its width and MFC's bar never shifts. */
.label { grid-area: 1 / 1; visibility: hidden; text-align: center; }
.toggle[aria-pressed="false"]:not([aria-busy="true"]) .pick,
.toggle[aria-pressed="true"]:not([aria-busy="true"]) .picked,
.toggle[aria-busy="true"] .busy { visibility: visible; }
.toggle[aria-pressed="true"]:not([aria-busy="true"], [data-just-toggled]):is(:hover, :focus-visible) .picked { visibility: hidden; }
.toggle[aria-pressed="true"]:not([aria-busy="true"], [data-just-toggled]):is(:hover, :focus-visible) .unpick { visibility: visible; }
.refusal {
  position: absolute; top: calc(100% + 6px); right: 4px; z-index: 1000; box-sizing: border-box; width: 320px; max-width: 80vw;
  margin: 0; padding: 10px 28px 10px 12px; ${SURFACE} white-space: normal;
}
:host([data-floating]) .refusal { top: auto; bottom: calc(100% + 6px); right: 0; }
.refusal a { display: block; margin-top: 6px; color: #9dc1ff; }
.refusal a:focus-visible, .dismiss:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
.dismiss { all: unset; position: absolute; top: 6px; right: 8px; cursor: pointer; padding: 0 4px; line-height: 1.4; color: #fff; }
`;

const NOTE_CSS = `
:host { all: initial; position: fixed; right: 16px; bottom: 16px; z-index: 1000; }
.note { margin: 0; padding: 8px 12px; ${SURFACE} }
a { color: #9dc1ff; }
a:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
`;

/** A closed root, so MFC's scripts and styles cannot reach in and the captured page cannot hold its contents. */
function shadowHost(window: Window & typeof globalThis, name: string, css: string) {
  const doc = window.document;
  const host = doc.createElement("div");
  host.dataset["myakibaPick"] = name;
  const root = host.attachShadow({ mode: "closed" });
  try {
    const sheet = new window.CSSStyleSheet();
    sheet.replaceSync(css);
    root.adoptedStyleSheets = [sheet];
  } catch {
    // Firefox's content-script wrappers can refuse adoptedStyleSheets.
    const style = doc.createElement("style");
    style.textContent = css;
    root.append(style);
  }
  return { host, root };
}

function element<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  className: string,
  text = "",
): HTMLElementTagNameMap[K] {
  const created = doc.createElement(tag);
  created.className = className;
  created.textContent = text;
  return created;
}

export function createPickUi(
  window: Window & typeof globalThis,
  deps: {
    readonly webOrigin: string;
    readonly onToggle: () => void;
    readonly onDismiss: () => void;
  },
): PickUi {
  const doc = window.document;
  const reviewUrl = `${deps.webOrigin}/add?from=mfc`;

  const review = (label: string) => {
    const link = element(doc, "a", "", label);
    link.href = reviewUrl;
    link.target = REVIEW_TARGET;
    link.referrerPolicy = "no-referrer";
    return link;
  };

  const settings = (label: string) => {
    const link = element(doc, "a", "", label);
    link.href = MFC_SETTINGS_URL;
    link.target = "_blank";
    link.rel = "noopener";
    return link;
  };

  const { host: toggle, root: toggleRoot } = shadowHost(window, "toggle", TOGGLE_CSS);
  const button = element(doc, "button", "toggle");
  button.type = "button";
  button.append(
    element(doc, "span", "label pick", "Pick for myakiba"),
    element(doc, "span", "label picked", "✓ Picked"),
    element(doc, "span", "label unpick", "Unpick"),
    element(doc, "span", "label busy", "Working…"),
  );
  button.addEventListener("click", () => {
    // The pointer is still on the button after a click, and the result should show before "Unpick" does.
    button.dataset["justToggled"] = "";
    deps.onToggle();
  });
  const settle = () => {
    delete button.dataset["justToggled"];
  };
  button.addEventListener("pointerleave", settle);
  button.addEventListener("blur", settle);
  toggleRoot.append(button);

  const { host: noteHost, root: noteRoot } = shadowHost(window, "note", NOTE_CSS);
  // A live region announces reliably only when it is already there, so it stays while empty and has no size.
  const noteRegion = doc.createElement("div");
  noteRegion.setAttribute("role", "status");
  noteRoot.append(noteRegion);
  doc.body.append(noteHost);

  let shownRefusal: { readonly refusal: PickRefusal; readonly node: HTMLElement } | null = null;
  let shownNote: string | null = null;

  function renderRefusal(refusal: PickRefusal | null) {
    if (shownRefusal?.refusal === refusal) return;
    shownRefusal?.node.remove();
    shownRefusal = null;
    if (refusal === null) return;
    const copy: RefusalCopy = REFUSAL_COPY[refusal];
    const node = element(doc, "p", "refusal", copy.text);
    node.setAttribute("role", "alert");
    if (copy.link) {
      node.append(copy.link.to === "review" ? review(copy.link.label) : settings(copy.link.label));
    }
    const dismiss = element(doc, "button", "dismiss", "×");
    dismiss.type = "button";
    dismiss.setAttribute("aria-label", "Dismiss");
    dismiss.addEventListener("click", deps.onDismiss);
    node.append(dismiss);
    toggleRoot.append(node);
    shownRefusal = { refusal, node };
  }

  function renderNote(count: number, full: boolean) {
    const key = count === 0 ? null : `${count}:${full}`;
    if (key === shownNote) return;
    shownNote = key;
    if (count === 0) {
      noteRegion.replaceChildren();
      return;
    }
    const note = element(doc, "p", "note");
    note.append(
      ...(full
        ? [`${FULL_TEXT} `, review(FULL_LINK)]
        : [`${count} picked · `, review("Review in myakiba")]),
    );
    noteRegion.replaceChildren(note);
  }

  return {
    toggle,
    render(view) {
      button.setAttribute("aria-pressed", String(view.picked));
      button.setAttribute("aria-label", view.picked ? "Picked for myakiba" : "Pick for myakiba");
      if (view.busy) button.setAttribute("aria-busy", "true");
      else button.removeAttribute("aria-busy");
      renderRefusal(view.refusal);
      renderNote(view.count, view.full);
    },
  };
}
