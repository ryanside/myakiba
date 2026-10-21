import { afterAll, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { edit, fixture, itemId } from "../test/fixtures";
import { scrubMfcPage } from "./capture";
import { readMfcEnvelope } from "./page";
import { parseMfcItemPage } from "./parse";

const item98777 = await fixture("item-98777.html");
const ID_98777 = itemId(98_777);

GlobalRegistrator.register();
afterAll(() => GlobalRegistrator.unregister());

function documentOf(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

function scrub(html: string): string {
  return scrubMfcPage(documentOf(html));
}

function envelopeOf(html: string, status = 200) {
  return readMfcEnvelope({ status, cfMitigated: null, html });
}

const item98777WithLivePageParts = edit(
  edit(
    item98777,
    "</head>",
    '<script>window.csrf = "fixture_user";</script><style>.x{}</style><!-- fixture_user --></head>',
  ),
  "</body>",
  '<form action="/?_tb=commit"><input type="hidden" name="token" value="secret"><textarea>fixture_user</textarea><select><option>a</option></select><button>Go</button></form><noscript>x</noscript><iframe src="/ads"></iframe><template><p>t</p></template></body>',
);

describe("scrubMfcPage on the signed-in 98777 page", () => {
  const scrubbed = scrub(item98777WithLivePageParts);

  test("parses to the same item as the unscrubbed page", () => {
    expect(parseMfcItemPage(scrubbed, ID_98777)).toEqual(parseMfcItemPage(item98777, ID_98777));
  });

  test("keeps the envelope, signed-in state included", () => {
    expect(envelopeOf(scrubbed)).toEqual(envelopeOf(item98777));
  });

  test("drops the user, scripts, forms and inputs", () => {
    for (const leak of ["fixture_user", "<script", "<form", "<input", "secret", "<!--"]) {
      expect(scrubbed).not.toContain(leak);
    }
  });

  test("drops every other control, style and embed", () => {
    for (const tag of ["style", "noscript", "iframe", "textarea", "select", "button", "template"]) {
      expect(scrubbed).not.toContain(`<${tag}`);
    }
  });

  test("keeps only the canonical link and the meta the server reads", () => {
    const doc = documentOf(scrubbed);
    expect([...doc.querySelectorAll("link")].map((link) => link.outerHTML)).toEqual([
      '<link rel="canonical" href="https://myfigurecollection.net/item/98777">',
    ]);
    expect(
      [...doc.querySelectorAll("meta")].map(
        (meta) => meta.getAttribute("property") ?? meta.getAttribute("name"),
      ),
    ).toEqual(["description", "og:image", "pictures"]);
  });

  test("leaves the user menu as an empty shell", () => {
    expect(scrubbed).toContain('<div class="tbx-menu user-menu"></div>');
  });

  test("does not change the document it reads", () => {
    const doc = documentOf(item98777);
    const before = doc.documentElement.outerHTML;
    scrubMfcPage(doc);
    expect(doc.documentElement.outerHTML).toBe(before);
  });
});

describe("scrubMfcPage keeps what readMfcEnvelope reads on other pages", () => {
  test.each([
    ["derived-not-found-signed-in.html", 404],
    ["derived-not-found-signed-out.html", 404],
    ["derived-challenge.html", 403],
    ["derived-public-item.html", 200],
  ])("%s", async (name, status) => {
    const html = await fixture(name);
    expect(envelopeOf(scrub(html), status)).toEqual(envelopeOf(html, status));
  });

  test("an absolute profile link is emptied like a relative one", () => {
    const html = edit(
      item98777,
      "</body>",
      '<a class="who" href="https://myfigurecollection.net/profile/someone">someone</a></body>',
    );
    expect(scrub(html)).toContain('<a class="who"></a>');
  });
});
