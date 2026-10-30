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

Use the same text in both stores.

- **Name.** myakiba
- **Summary.** Pick the MyFigureCollection item you are viewing for myakiba, and refresh an item's details on request.

  This is the manifest's `description`, 103 characters. Chrome allows 132 and AMO allows 250.

- **Description.**

  ```text
  myakiba (https://myakiba.app) is a collection manager for Japanese pop-culture collectibles. This extension lets you pick items while you browse MyFigureCollection (MFC) and add them to myakiba.

  On an MFC item page, click "Pick for myakiba" next to MFC's own buttons. Click it again to unpick. A small note shows how many items you picked. Click "Review in myakiba" to open myakiba's Add page, choose where they go (your collection, an order, your wishlist or a list) and add them.

  The extension sends nothing when you open an MFC page. It reads an item page only when you click Pick on it, and keeps the page and the item's picture in your browser until myakiba's Add page collects them. It removes your MFC username and profile links from the page first. It does not read your MFC password or cookies, other websites, or your browsing history.

  When you ask myakiba to refresh an item's details, the extension reads that one MFC item page in a tab with your own MFC sign-in, at a pace that does not overload MFC.

  You need a myakiba account. Items that MFC shows only to signed-in members need you signed in to MFC. myakiba is not affiliated with MyFigureCollection.

  Privacy policy: https://myakiba.app/privacy
  ```

- **Homepage.** https://myakiba.app
- **Support site.** https://github.com/ryanside/myakiba/issues
- **Privacy policy.** https://myakiba.app/privacy
- **Category.** Pick the closest one. Chrome's Productivity or Tools and AMO's Shopping or Other are reasonable choices.

## Single purpose

```text
The extension brings MyFigureCollection items into myakiba. When the user clicks "Pick for myakiba" on the MyFigureCollection item page they are viewing, it keeps that page and the item's picture in the browser until the myakiba web app collects them. When the user asks myakiba to refresh an item's details, it reads that one item page with the user's own MyFigureCollection sign-in and passes it to myakiba.
```

## Permissions

| Permission                                                | Browsers        | Justification for the form                                                                                                                                                                                                                                                                                              | Code                                                                                                                      |
| --------------------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `scripting`                                               | Chrome, Firefox | Runs the packaged collector script in the MFC tab it uses to refresh an item the user asked to refresh.                                                                                                                                                                                                                 | `apps/extension/entrypoints/background.ts` (`browser.scripting.executeScript`), `apps/extension/entrypoints/collector.ts` |
| `storage`                                                 | Chrome, Firefox | Keeps the items the user picked (MFC item number, title, the cleaned page and its picture) in local storage until myakiba's Add page collects them, at most 8 MiB and at most 14 days; private-window picks only in session storage. Also keeps, in session storage, which MFC tabs it opened and its page-load pacing. | `apps/extension/lib/picks.ts`, `apps/extension/lib/session-value.ts`                                                      |
| `cookies`                                                 | Firefox only    | Opens the refresh's MFC tab in the same container as the myakiba tab. No cookie is read.                                                                                                                                                                                                                                | `apps/extension/lib/owned-tab.ts` (`cookieStoreId` on `tabs.create`)                                                      |
| `https://myfigurecollection.net/*`                        | Chrome, Firefox | Finds or opens the MFC tab for a refresh, runs the collector in it, fetches the item page and members-only picture with the user's sign-in.                                                                                                                                                                             | `apps/extension/lib/mfc-tab.ts` (`tabs.query`), `apps/extension/entrypoints/collector.ts` (`fetch`)                       |
| `https://static.myfigurecollection.net/*`                 | Chrome, Firefox | Loads and reads a refreshed item's public picture.                                                                                                                                                                                                                                                                      | `apps/extension/lib/fetcher.ts` (`pictureTab`), `apps/extension/lib/picture.ts` (`pictureToRead`)                         |
| Content script on `https://myfigurecollection.net/item/*` | Chrome, Firefox | Shows the "Pick for myakiba" button and the picks note on MFC item pages. It sends nothing when a page loads; on a click it reads that page and fetches that item's picture from MFC.                                                                                                                                   | `apps/extension/entrypoints/mfc.ts`, `apps/extension/lib/mfc-page/`                                                       |
| Content script on `https://myakiba.app/*`                 | Chrome, Firefox | Receives requests from the myakiba web app: item refreshes, and handing over the user's picks when the Add page asks.                                                                                                                                                                                                   | `apps/extension/entrypoints/myakiba.content.ts`, `apps/extension/lib/page-bridge.ts`                                      |

The extension does not use the `tabs` permission. A host permission is enough to query and read MyFigureCollection tabs.

## Chrome privacy practices tab

- **Single purpose description.** Paste the single purpose text above.
- **Permission justification.** Paste each Chrome row from the table above. Chrome lists `scripting`, `storage` and the host permissions.
- **Are you using remote code?** No, I am not using remote code. Every script is in the package, and the extension runs only its own files (`entrypoints/background.ts`, `executeScript` with `files: ["/collector.js"]`).
- **Data usage. What user data do you plan to collect?** Check only **Website content**. The extension sends the MFC item pages and pictures the user picked or asked to refresh to myakiba. Leave every other type unchecked:
  - It sends no personally identifiable information. `packages/mfc/src/capture.ts` (`scrubMfcPage`) removes the MFC account menu and profile links before a page leaves the MFC tab.
  - It reads no authentication information. The browser attaches MFC cookies to the requests, and the extension never reads or sends them.
  - It records no web history and no user activity. It reads an MFC item page only after the user clicks Pick on it, and sends it only to the myakiba page when that page asks. It keeps the items the user chose, not the pages they viewed. For a refresh, it reads only the URL and title of MFC tabs, and keeps them in the browser.
- **Certifications.** Check all three. They state that the data is not sold or transferred to third parties outside the approved uses, not used for anything unrelated to the single purpose, and not used to decide creditworthiness or lending. The privacy page says the same and states compliance with the Limited Use requirements, which Chrome's Limited Use policy asks for.
- **Privacy policy URL.** https://myakiba.app/privacy

## Firefox data collection

The manifest declares `browser_specific_settings.gecko.data_collection_permissions` as `{ "required": ["websiteContent"] }`. Firefox shows it at install, and AMO shows it on the listing. Website content covers page text, images and request data, which is what the extension sends to myakiba. Nothing is optional, so there is no `optional` list.

`strict_min_version` is `140.0`, the first Firefox that shows this built-in consent. It and Chrome's `minimum_chrome_version` come from `EXTENSION_MIN_BROWSER_VERSION` in `packages/contracts/src/shared/extension-browsers.ts`, which the web app also reads to tell an older browser that the extension cannot run there. Older Firefox would need a consent screen of the extension's own. The code also needs Firefox 133 for `Uint8Array.fromBase64` and `toBase64`, so 140 drops no supported browser.

The add-on ID is `extension@myakiba.app`. AMO ties every future version to it, so it never changes.

When AMO asks whether the add-on has a privacy policy, say yes and give https://myakiba.app/privacy.

## Privacy policy

The policy is the web page at https://myakiba.app/privacy. Its text is in `apps/web/src/routes/privacy.tsx`, the only copy, so the store and the site cannot disagree. It is a client-side route, so the server's single-page fallback serves it without a session. When the extension's data handling changes, update that page and its date in the same change.

## Reviewer notes

Paste this into Chrome's **Test instructions** tab and AMO's **Notes to Reviewer**, and fill in the myakiba account lines.

```text
What it does
The user picks MyFigureCollection (MFC) items on MFC's item pages, then decides in the myakiba web app (https://myakiba.app) where they go. The extension shows a "Pick for myakiba" button on MFC item pages and a small note with the number of picks. It sends nothing when a page loads. A click reads that page and the item's picture and keeps them in the browser; myakiba's Add page collects them through the extension's content script on myakiba.app. The extension never calls myakiba's server itself. Separately, when the user asks myakiba to refresh an item's details, the extension reads that one MFC item page in a tab with the user's sign-in. The extension has no popup, options page or toolbar button.

Test account
myakiba: sign in at https://myakiba.app/login
  Email: <test account email>
  Password: <test account password>
No MyFigureCollection account is needed. Public MFC items cover the whole flow.

How to test
1. Install the extension and sign in to myakiba.
2. Open an MFC item page, for example https://myfigurecollection.net/item/<id>. Click "Pick for myakiba" next to MFC's "Add to my collection". A note "1 picked · Review in myakiba" appears at the bottom right. Pick one or two more items the same way.
3. Click "Review in myakiba". myakiba's Add page opens and lists the picked items with their pictures.
4. Choose "Not owned" and "Wishlist", then click "Add 3 to Wishlist". Or choose "Collection" to add them to the test account's collection.
5. To refresh an item, open it in myakiba and click "Refresh item details".

Permissions
- scripting: runs the packaged collector script (collector.js) in the MFC tab used for a refresh.
- storage: local storage of the user's picks until myakiba's Add page collects them, at most 14 days, and session storage for private-window picks, the MFC tabs the extension opened and its page-load pacing.
- cookies (Firefox only): opens the MFC tab in the myakiba tab's container. No cookie is read.
- https://myfigurecollection.net/*: finds or opens the MFC tab for a refresh and fetches item pages and members-only pictures with the user's sign-in.
- https://static.myfigurecollection.net/*: loads and reads a refreshed item's public picture.
- Content script on https://myfigurecollection.net/item/*: shows the Pick button; reads a page only on a click.
- Content script on https://myakiba.app/*: receives requests from the myakiba web app and hands over picks when the Add page asks.

Data
The extension sends picked or refreshed MFC item pages and pictures only to the myakiba page, which uploads them to myakiba's server. It removes the MFC username and profile links from each page first. Privacy policy: https://myakiba.app/privacy
```

For AMO, add this paragraph:

```text
Source code: the add-on is bundled and minified by WXT (Vite). The sources zip contains apps/extension/SOURCE_CODE_REVIEW.md with the build steps: Bun 1.4.4, Node 24, then "bun install --frozen-lockfile" at the root and "bun run zip" in apps/extension. The output is apps/extension/.output/myakiba-1.0.0-firefox.zip. The "Function constructor" linter warnings come from zod 4's eval check, and the Android warning is expected because the add-on is for Firefox desktop only. SOURCE_CODE_REVIEW.md explains both.
```

## Screenshots

The Chrome Web Store needs at least one screenshot, up to five, each 1280x800 or 640x400, with square corners and no padding. AMO recommends 1280x800 too. Capture them in Chrome at a 1280x800 window size, signed in with a real account:

1. An MFC item page with "✓ Picked" next to MFC's buttons and the note.
2. The Add page with three picked rows, pictures and prices.
3. The destination bar set to a new Order and a List.
4. The commit toast over the collection filtered to the new items.
5. An item page after "Refresh item details".

The repo's end-to-end tests run against a mock myakiba page and a mock MFC site with made-up pictures, so they cannot produce honest screenshots.

The small promo tile (440x280) and the marquee tile (1400x560) are optional. Chrome lists items without a small tile after those that have one.

## Release checklist

1. Make sure https://myakiba.app/privacy is live in production.
2. In `apps/extension`, run `bun run zip`, then `bun run check-manifest`, then `bun run verify-sources`.
3. Optionally, lint the Firefox zip from a temporary directory: `bunx addons-linter apps/extension/.output/myakiba-1.0.0-firefox.zip`. Expect 0 errors and the 5 warnings that `SOURCE_CODE_REVIEW.md` explains.
4. Chrome Web Store, at https://chrome.google.com/webstore/devconsole:
   1. Register as a developer and pay the one-time registration fee.
   2. Choose **New item** and upload `myakiba-1.0.0-chrome.zip`.
   3. **Store listing.** Paste the description, pick a category and language, and upload the screenshots. The 128x128 icon comes from the package.
   4. **Privacy.** Fill in the single purpose, each permission justification, "No" to remote code, Website content only, all three certifications, and the privacy policy URL.
   5. **Distribution.** Free, public, and the regions you want.
   6. **Test instructions.** Paste the reviewer notes with the test account.
   7. Submit for review.
5. Firefox Add-ons, at https://addons.mozilla.org/developers/:
   1. Sign in with a Mozilla account and choose **Submit a New Add-on**.
   2. Choose **On this site**.
   3. Upload `myakiba-1.0.0-firefox.zip`, and select Firefox only, not Firefox for Android.
   4. Answer yes to the source code question and upload `myakiba-1.0.0-sources.zip`.
   5. Fill in the name, summary, description, categories, support site, license and privacy policy.
   6. Paste the reviewer notes and the source code paragraph into **Notes to Reviewer**.
   7. Upload the screenshots on the listing page after the version is submitted.
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
