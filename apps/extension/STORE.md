# Store submission

This file holds what the Chrome Web Store and Firefox Add-ons (AMO) ask for when you submit the myakiba extension: the listing text, the answers to each form, the reviewer notes and the release steps. Paths are relative to the repo root.

## Build the packages

Run these from `apps/extension` with Bun 1.4.4 and Node 24, and with no `WXT_*` variable set:

1. `bun run zip` builds both browsers and writes three files to `apps/extension/.output/`:
   - `myakiba-1.0.0-chrome.zip`, which you upload to the Chrome Web Store.
   - `myakiba-1.0.0-firefox.zip`, which you upload to AMO.
   - `myakiba-1.0.0-sources.zip`, which you upload to AMO as the source code.
2. `bun run verify-sources` unzips the sources zip into a temporary directory, installs and builds there, and checks that all three zips come out byte for byte the same. AMO's reviewers rebuild the extension the same way.

A release build needs no environment variables. `packages/env/src/extension.ts` holds the production origins as defaults, and `lib/release-profile.ts` stops any build except `--mode e2e` and `wxt dev` that points at another origin.

The version comes from `apps/extension/package.json`. Each upload to either store needs a higher version than the last one.

`bun run icons` redraws `public/icon-{16,32,48,96,128}.png` from the 53x18 mark in `apps/web/src/components/myakiba-logo.tsx`. Run it only when the logo changes, and commit the PNGs.

## Listing text

Use the same text in both stores, except where a field says otherwise.

- **Name.** myakiba
- **Summary.** Pick the MyFigureCollection item you are viewing for myakiba, and refresh an item's details on request.

  This is the manifest's `description`, 103 characters. Chrome allows 132 and AMO allows 250.

- **Description.** Chrome shows plain text, so its headings are plain lines and its bullets are `•`. AMO supports some Markdown, so there the headings are `**bold**` and the bullets are `-`. The text is otherwise the same.

  ```text
  myakiba (https://myakiba.app) is a collection manager for Japanese pop-culture collectibles. This extension brings items from MyFigureCollection (MFC) into myakiba, so you never retype an item's details.

  Why install it
  • Add items as you browse: click "Pick for myakiba" on any MFC item page, then add everything you picked at once.
  • No typing: each item's title, makers, releases, prices and picture come from its MFC page.
  • Choose where they go: your collection, a new or existing order, your wishlist or a list.
  • Keep items current: refresh an item's details from MFC with one click.

  How it works
  On an MFC item page, click "Pick for myakiba" next to MFC's own buttons. Click it again to unpick. A small note shows how many items you picked. Click "Review in myakiba" to open myakiba's Add page, choose where they go and add them.

  Privacy
  The extension makes no request when you open an MFC page. It reads an item page only when you click Pick on it, and keeps the page and the item's picture in your browser until myakiba's Add page collects them. It keeps only the item's details from the page and drops the rest first, your MFC username, notes and collection status included. It does not read your MFC password or cookies, other websites, or your browsing history.

  When you ask myakiba to refresh an item's details, the extension reads that one MFC item page in an MFC tab, as MFC shows it to you, at a pace that does not overload MFC.

  You need a myakiba account. Items that MFC shows only to signed-in members need you signed in to MFC. myakiba is not affiliated with MyFigureCollection.

  Privacy policy: https://myakiba.app/privacy
  ```

- **Homepage.** https://myakiba.app
- **Support site.** https://github.com/ryanside/myakiba/issues
- **Privacy policy.** https://myakiba.app/privacy
- **Support email.** support@myakiba.app, which Cloudflare Email Routing forwards. Chrome also needs a verified publisher contact email on its Settings page before it accepts a submission.
- **Category.** Chrome: Tools. AMO: Shopping, where collectors tracking what they buy look. AMO's "doesn't fit" choice keeps an add-on out of every category page.
- **License (AMO).** GNU Affero General Public License v3.0 only, the repo's `LICENSE`.

## Single purpose

```text
The extension brings MyFigureCollection items into myakiba. When the user clicks "Pick for myakiba" on the MyFigureCollection item page they are viewing, it keeps that page and the item's picture in the browser until the myakiba web app collects them. When the user asks myakiba to refresh an item's details, it reads that one item page in a MyFigureCollection tab, as MyFigureCollection shows it to the user, and passes it to myakiba.
```

## Permissions

| Permission                                                | Browsers        | Justification for the form                                                                                                                                                                                                                                                                                                                                                                                                    | Code                                                                                                                      |
| --------------------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `scripting`                                               | Chrome, Firefox | Refreshing an item the user asked to refresh: the extension injects its packaged collector script (collector.js), and two small packaged functions that start and stop it, into the MyFigureCollection tab it uses for that refresh. The collector reads that one item page and its picture and returns them to the extension. No remote code is run.                                                                         | `apps/extension/entrypoints/background.ts` (`browser.scripting.executeScript`), `apps/extension/entrypoints/collector.ts` |
| `storage`                                                 | Chrome, Firefox | Keeps the items the user picked (MFC item number, title, the cleaned item page and its picture) in local storage until myakiba's Add page collects them, at most 8 MiB and at most 14 days. Picks made in a private window are kept only in session storage. Session storage also holds which tabs the extension opened for a refresh and the pacing between MyFigureCollection page loads, so it does not overload the site. | `apps/extension/lib/picks.ts`, `apps/extension/lib/session-value.ts`                                                      |
| `cookies`                                                 | Firefox only    | Opens the refresh's MFC tab in the same container as the myakiba tab. No cookie is read.                                                                                                                                                                                                                                                                                                                                      | `apps/extension/lib/owned-tab.ts` (`cookieStoreId` on `tabs.create`)                                                      |
| `https://myfigurecollection.net/*`                        | Chrome, Firefox | For a refresh the user asked for, finds an open MyFigureCollection tab or opens one, runs the collector in it, and fetches the item page there, plus a members-only picture with the user's own sign-in.                                                                                                                                                                                                                      | `apps/extension/lib/mfc-tab.ts` (`tabs.query`), `apps/extension/entrypoints/collector.ts` (`fetch`)                       |
| `https://static.myfigurecollection.net/*`                 | Chrome, Firefox | Loads a refreshed item's public picture and reads it.                                                                                                                                                                                                                                                                                                                                                                         | `apps/extension/lib/fetcher.ts` (`pictureTab`), `apps/extension/lib/picture.ts` (`pictureToRead`)                         |
| Content script on `https://myfigurecollection.net/item/*` | Chrome, Firefox | Shows the "Pick for myakiba" button and the picks note on MFC item pages. It makes no request when a page loads; on a click it reads that page and fetches that item's picture from MyFigureCollection.                                                                                                                                                                                                                       | `apps/extension/entrypoints/mfc.ts`, `apps/extension/lib/mfc-page/`                                                       |
| Content script on `https://myakiba.app/*`                 | Chrome, Firefox | Receives requests from the myakiba web app: item refreshes, and handing over the user's picks when the Add page asks.                                                                                                                                                                                                                                                                                                         | `apps/extension/entrypoints/myakiba.content.ts`, `apps/extension/lib/page-bridge.ts`                                      |

The extension does not use the `tabs` permission. A host permission is enough to query and read MyFigureCollection tabs.

## Chrome privacy practices tab

- **Single purpose description.** Paste the single purpose text above.
- **Permission justification.** Chrome has one field each for `scripting` and `storage`, and a single **Host permission justification** field. Paste the `scripting` and `storage` rows from the table above into theirs. Paste the two host rows and the two content-script rows into the host field, one per line, each starting with its pattern: `https://myfigurecollection.net/*: …`, `Content script on https://myakiba.app/*: …`. Each field takes 1,000 characters.
- **Are you using remote code?** No, I am not using remote code. Every script is in the package, and the extension runs only its own files (`entrypoints/background.ts`, `executeScript` with `files: ["/collector.js"]`).
- **Data usage. What user data do you plan to collect?** Check only **Website content**. The extension sends the MFC item pages and pictures the user picked or asked to refresh to myakiba. Leave every other type unchecked:
  - It sends no personally identifiable information. Before a page leaves the MFC tab, `packages/mfc/src/capture.ts` (`scrubMfcPage`) keeps only what `packages/mfc/src/reads.ts` lists as read: the page title, canonical link, picture address, item heading, item detail fields, not-found sentence and whether the user is signed in. It drops the rest of the page, the account menu, profile links, notes and collection status included.
  - It reads no authentication information. The browser attaches MFC cookies to the requests, and the extension never reads or sends them.
  - It records no web history and no user activity. It reads an MFC item page only after the user clicks Pick on it, and sends it only to the myakiba page when that page asks. It keeps the items the user chose, not the pages they viewed. For a refresh, it reads only the URL and title of MFC tabs, and keeps them in the browser.
- **Certifications.** Check all three. They state that the data is not sold or transferred to third parties outside the approved uses, not used for anything unrelated to the single purpose, and not used to decide creditworthiness or lending. The privacy page says the same and states compliance with the Limited Use requirements, which Chrome's Limited Use policy asks for.
- **Privacy policy URL.** https://myakiba.app/privacy

## Firefox data collection

The manifest declares `browser_specific_settings.gecko.data_collection_permissions` as `{ "required": ["websiteContent"] }`. Firefox shows it at install, and AMO shows it on the listing. Website content covers page text, images and request data, which is what the extension sends to myakiba. Nothing is optional, so there is no `optional` list.

`strict_min_version` is `140.0`, the first Firefox that shows this built-in consent. It and Chrome's `minimum_chrome_version` come from `EXTENSION_MIN_BROWSER_VERSION` in `packages/contracts/src/shared/extension-browsers.ts`, which the web app also reads to tell an older browser that the extension cannot run there. Older Firefox would need a consent screen of the extension's own. The code also needs Firefox 133 for `Uint8Array.fromBase64` and `toBase64`, so 140 drops no supported browser.

The add-on ID is `extension@myakiba.app`. AMO ties every future version to it, so it never changes.

When AMO asks whether the add-on has a privacy policy, check the box. AMO then takes the policy as text and shows it on its own page, so paste the text of https://myakiba.app/privacy, without the Chrome-only Limited Use sentence and with a line pointing at the page.

## Privacy policy

The policy is the web page at https://myakiba.app/privacy. Its text is in `apps/web/src/routes/privacy.tsx`. Chrome links to the page, and AMO's listing holds a pasted copy. It is a client-side route, so the server's single-page fallback serves it without a session. When the extension's data handling changes, update that page and its date in the same change, then paste the new text into AMO's listing.

## Reviewer notes

The two stores take different shapes and lengths, and each uses its own MFC Item. Both reviewers sign in to the same test account, and the Add page marks an Item the account already owns "In your collection", so one store's review would leave the other's reviewer a used Item. Fill in the account lines from the password manager; never commit them.

### Chrome: Test instructions

Chrome has separate **Username** and **Password** fields, and **Additional instructions** takes 500 characters. This text is 480.

```text
Sign in at https://myakiba.app/login. No MFC account is needed.
1. Open https://myfigurecollection.net/item/1618468 and click "Pick for myakiba" (after "Buy").
2. Click "Review in myakiba" in the note at the bottom right.
3. On the Add page, open "choose where", choose "Collection", then click "Add 1 to collection".
4. Click "View", open the item, then click "Refresh item details". The extension reads the item's MFC page in a tab. If MFC shows a Cloudflare check, complete it.
```

The store listing and the Privacy tab carry what this text leaves out.

### AMO: Notes to Reviewer

AMO's field takes 3,000 characters. This text, source code paragraph included, is about 2,850 before the password.

```text
What it does
myakiba (https://myakiba.app) is a collection manager for collectibles. On a MyFigureCollection (MFC) item page the extension adds a "Pick for myakiba" button. A click reads that page and the item's picture and keeps them in the browser until myakiba's Add page collects them through the content script on myakiba.app. When the user clicks "Refresh item details" in myakiba, the extension reads that item's MFC page in an MFC tab. It never calls myakiba's server itself and has no popup, options page or toolbar button. Loading an MFC page makes no network request; the content script only asks the background script for the pick count.

Test account
Sign in at https://myakiba.app/login
Email: <test account email>
Password: <test account password>
No MFC account is needed.

How to test
1. Open https://myfigurecollection.net/item/581731 and click "Pick for myakiba" (after "Buy"). A note "1 picked · Review in myakiba" appears at the bottom right.
2. Click "Review in myakiba". The Add page opens and lists the item with its picture.
3. Open "choose where", choose "Collection", click "Add 1 to collection".
4. Click "View", open the item, click "Refresh item details". The extension reads the page in the open MFC tab, or one it opens in the background and closes afterwards, and may briefly open a background tab on static.myfigurecollection.net for the picture. If MFC shows a Cloudflare check, the extension brings that tab forward; the refresh continues once it passes.

Permissions
- scripting: injects the packaged collector.js, and two packaged functions that start and stop it, into the refresh's MFC tab. No remote code.
- storage: picks in local storage until the Add page collects them (at most 14 days, 8 MiB); private-window picks in session storage; the tabs it opened and MFC page-load pacing in session storage.
- cookies: opens the refresh's MFC tab in the myakiba tab's container. No cookie is read.
- Host permissions: the MFC tab, item page and members-only picture for a refresh; a refreshed item's public picture on static.myfigurecollection.net.

Data
Pages and pictures go only to the myakiba page, which uploads them to myakiba's server. The extension drops everything but the item's details first, including the MFC username, notes and collection status. Privacy policy: https://myakiba.app/privacy

Source code
Bundled and minified by WXT (Vite). Build steps are in apps/extension/SOURCE_CODE_REVIEW.md in the sources zip: Bun 1.4.4 and Node 24, then "bun install --frozen-lockfile" at the root and "bun run zip" in apps/extension, which writes apps/extension/.output/myakiba-1.0.0-firefox.zip. The "Function constructor" warnings are zod 4's eval check, which the extension turns off before zod loads. The Android warning is expected: the add-on is desktop-only. SOURCE_CODE_REVIEW.md explains both.
```

### Version notes (AMO)

```text
First release. Pick MyFigureCollection items on their item pages and add them to myakiba, and refresh an item's details from MyFigureCollection on request.
```

## Screenshots, promo tiles and video

What each store takes:

- Chrome Web Store: one to five screenshots, each 1280x800 or 640x400, with square corners and no padding. The store shows them at 640x400 and has no caption field. The small promo tile (440x280) and the marquee tile (1400x560) are optional PNG or JPEG files that should carry little or no text. Chrome lists items without a small tile after those that have one. The video is a YouTube link.
- AMO: screenshots at 1280x800 or another 1.6:1 size, with no practical limit on how many. Each screenshot has its own caption, and AMO asks for no text inside the images. AMO has no video or promo tile.

### Screenshots

Upload the same five PNGs, in this order, to both stores. The captions go in AMO's caption field.

| #   | Shows                                                                                               | AMO caption                                                               |
| --- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 1   | MFC item 1618468, signed out of MFC, with "✓ Picked" next to MFC's buttons and the "1 picked" note. | Pick the item you're viewing on MyFigureCollection.                       |
| 2   | The Add page with the picked item's row.                                                            | Your picks arrive on myakiba's Add page.                                  |
| 3   | The same page with the destination menu open, next to the Wishlist and Lists controls.              | Choose where they go: your collection, an order, your wishlist or a list. |
| 4   | The "Added 1 to your collection" toast over the emptied Add page.                                   | Add them with one click.                                                  |
| 5   | The item's myakiba page after "Refresh item details", reading "Updated just now".                   | Refresh an item's details from MFC on request.                            |

All five use myakiba's dark theme, and MFC's item page is in its own dark style. The screenshots and the video show MFC's item pictures, so they are not in the repo. To capture them again, use a fresh browser profile that is signed out of MFC and signed in to myakiba, switch to the dark theme, collapse the sidebar, and capture a 1024x640 viewport at 125% so each image is 1280x800 and still reads at 640x400. Every shot uses the one item, MFC 1618468.

The repo's end-to-end tests run against a mock myakiba page and a mock MFC site with made-up pictures, so they cannot produce honest screenshots.

### Promo tiles

`store-assets/chrome-small-promo-440x280.png` and `store-assets/chrome-marquee-promo-1400x560.png` set the myakiba wordmark and a picked item card over the Akihabara street the app's sign-in page uses, drawn pixel-sharp like the app draws it. They hold no screenshot and no MFC picture. `bun run store-tiles` in `apps/web` redraws both from `apps/web/src/components/myakiba-logo.tsx` and `apps/web/src/assets/backgrounds/11-akihabara-bright-bitgrain.webp`. They live outside `apps/extension/` because the sources zip holds all of `apps/extension/`.

### Demo video

The Chrome listing's video is a 22-second, 1920x1080 recording of the real flow with item 1618468, framed over the same Akihabara street. It picks the item on MFC, opens "Review in myakiba", chooses Collection, clicks "Add 1 to collection", then clicks the toast's View and ends on the collection showing the item just added. Upload it to YouTube and paste the link in the Chrome listing. AMO has no video field.

## Release checklist

1. Make sure https://myakiba.app/privacy is live in production.
2. In `apps/extension`, run `bun run zip`, then `bun run check-manifest`, then `bun run verify-sources`.
3. Optionally, lint the Firefox zip from a temporary directory: `bunx addons-linter apps/extension/.output/myakiba-1.0.0-firefox.zip`. Expect 0 errors and the 5 warnings that `SOURCE_CODE_REVIEW.md` explains.
4. Chrome Web Store, at https://chrome.google.com/webstore/devconsole:
   1. Register as a developer and pay the one-time registration fee. On the Settings page, set the publisher contact email (support@myakiba.app) and verify it; Chrome refuses to submit without it.
   2. Choose **New item** and upload `myakiba-1.0.0-chrome.zip`.
   3. **Store listing.** Paste the description, pick a category and language, upload the five screenshots and the two promo tiles from `store-assets/`, and paste the demo video's YouTube link. Upload `apps/extension/public/icon-128.png` as the store icon; the listing does not take it from the package.
   4. **Privacy.** Fill in the single purpose, each permission justification, "No" to remote code, Website content only, all three certifications, and the privacy policy URL.
   5. **Distribution.** Free, public, and the regions you want.
   6. **Test instructions.** Fill in the username and password, and paste the Chrome text from Reviewer notes.
   7. Submit for review.
5. Firefox Add-ons, at https://addons.mozilla.org/developers/:
   1. Sign in with a Mozilla account and choose **Submit a New Add-on**.
   2. Choose **On this site**.
   3. Upload `myakiba-1.0.0-firefox.zip`, and select Firefox only, not Firefox for Android.
   4. Answer yes to the source code question and upload `myakiba-1.0.0-sources.zip`.
   5. Fill in the name, summary, description, categories, support email and site, license and privacy policy text. AMO's validation shows the 5 warnings that `SOURCE_CODE_REVIEW.md` explains; they are expected.
   6. Paste the AMO text from Reviewer notes into **Notes to Reviewer**, and the version notes when asked.
   7. After the version is submitted, open the listing's **Images** and upload `apps/extension/public/icon-128.png` as the add-on icon, which AMO shows as a puzzle piece until then, and the five screenshots with their captions from the Screenshots table.
6. When a store approves the extension, set that store's listing URL in `apps/web/src/lib/extension-listings.ts`: `chromeWebStore` for the Chrome Web Store, `firefoxAddons` for AMO. Release each store on its own day; the other stays under review until its URL is set. That one line is the whole release: visitors whose browser uses the store get an install link instead of the under-review notice, and the "How do I install the myakiba browser extension?" FAQ links the listing.

## Sources

The requirements above come from these pages, read on 2026-10-26:

- Chrome Web Store images: https://developer.chrome.com/docs/webstore/images
- Chrome privacy practices tab: https://developer.chrome.com/docs/webstore/cws-dashboard-privacy
- Chrome user data FAQ: https://developer.chrome.com/docs/webstore/program-policies/user-data-faq
- Chrome Limited Use: https://developer.chrome.com/docs/webstore/program-policies/limited-use
- Chrome Manifest V3 requirements: https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements
- Chrome publishing: https://developer.chrome.com/docs/webstore/publish
- AMO add-on policies: https://extensionworkshop.com/documentation/publish/add-on-policies/
- AMO source code submission: https://extensionworkshop.com/documentation/publish/source-code-submission/
- Firefox built-in data consent: https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/
- `browser_specific_settings`: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings
- WXT publishing: https://wxt.dev/guide/essentials/publishing

The screenshot, promo tile and video requirements come from these pages, read on 2026-11-09:

- Chrome store listing tab: https://developer.chrome.com/docs/webstore/cws-dashboard-listing
- Chrome listing best practices: https://developer.chrome.com/docs/webstore/best-listing
- Chrome listing requirements: https://developer.chrome.com/docs/webstore/program-policies/listing-requirements
- AMO listing guide: https://extensionworkshop.com/documentation/develop/create-an-appealing-listing/
- AMO add-on previews API: https://mozilla.github.io/addons-server/topics/api/addons.html
