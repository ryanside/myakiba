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
- **Summary.** Brings MyFigureCollection items into myakiba with your MyFigureCollection session.

  This is the manifest's `description`, 82 characters. Chrome allows 132 and AMO allows 250.

- **Description.**

  ```text
  myakiba (https://myakiba.app) is a collection manager for Japanese pop-culture collectibles. This extension lets myakiba add items from MyFigureCollection (MFC).

  When you add an MFC item to myakiba, import an MFC CSV or a myakiba export, or refresh an item's details, myakiba asks the extension for those items. The extension opens each item's MFC page in a tab with your own MFC sign-in, reads the item's details and main picture, and passes them to myakiba. It loads one page every few seconds, so it does not overload MFC.

  What it sends: the MFC item pages and pictures that myakiba asked for, to myakiba only. It removes your MFC username and profile links from each page first. It does not read your MFC password or cookies, other websites, or your browsing history.

  You need a myakiba account. Items that MFC shows only to signed-in members also need you to be signed in to MFC. The extension has no settings and no toolbar button. You use it from myakiba.

  myakiba is not affiliated with MyFigureCollection.

  Privacy policy: https://myakiba.app/privacy
  ```

- **Homepage.** https://myakiba.app
- **Support site.** https://github.com/ryanside/myakiba/issues
- **Privacy policy.** https://myakiba.app/privacy
- **Category.** Pick the closest one. Chrome's Productivity or Tools and AMO's Shopping or Other are reasonable choices.

## Single purpose

```text
The extension gets MyFigureCollection item pages and pictures that the myakiba web app asks for, with the user's own MyFigureCollection sign-in, and passes them to myakiba.
```

## Permissions

| Permission                                | Browsers        | Justification for the form                                                                                                                                  | Code                                                                                                                      |
| ----------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `scripting`                               | Chrome, Firefox | Runs the extension's packaged collector script in the MyFigureCollection tab it uses, to read the requested item page and picture with the user's sign-in.  | `apps/extension/entrypoints/background.ts` (`browser.scripting.executeScript`), `apps/extension/entrypoints/collector.ts` |
| `storage`                                 | Chrome, Firefox | Keeps, in session storage only, which MyFigureCollection tabs the extension opened and its page-load pacing, so a restarted background worker can carry on. | `apps/extension/entrypoints/background.ts` (`browser.storage.session`), `apps/extension/lib/session-value.ts`             |
| `cookies`                                 | Firefox only    | Opens the MyFigureCollection tab in the same container as the myakiba tab, so it uses the MFC sign-in from that container. The extension reads no cookies.  | `apps/extension/lib/owned-tab.ts` (`cookieStoreId` on `tabs.create`)                                                      |
| `https://myfigurecollection.net/*`        | Chrome, Firefox | Finds or opens a MyFigureCollection tab, runs the collector in it, and fetches the requested item pages and members-only pictures with the user's sign-in.  | `apps/extension/lib/mfc-tab.ts` (`tabs.query`), `apps/extension/entrypoints/collector.ts` (`fetch`)                       |
| `https://static.myfigurecollection.net/*` | Chrome, Firefox | Loads a requested item's public picture in a tab on MFC's image host and reads it there.                                                                    | `apps/extension/lib/fetcher.ts` (`pictureTab`), `apps/extension/lib/picture.ts` (`pictureToRead`)                         |
| Content script on `https://myakiba.app/*` | Chrome, Firefox | Receives item requests from the myakiba web app and passes results back. It runs only on myakiba.app.                                                       | `apps/extension/entrypoints/myakiba.content.ts`, `apps/extension/lib/page-bridge.ts`                                      |

The extension does not use the `tabs` permission. A host permission is enough to query and read MyFigureCollection tabs.

## Chrome privacy practices tab

- **Single purpose description.** Paste the single purpose text above.
- **Permission justification.** Paste each Chrome row from the table above. Chrome lists `scripting`, `storage` and the host permissions.
- **Are you using remote code?** No, I am not using remote code. Every script is in the package, and the extension runs only its own files (`entrypoints/background.ts`, `executeScript` with `files: ["/collector.js"]`).
- **Data usage. What user data do you plan to collect?** Check only **Website content**. The extension sends the requested MFC item pages and pictures to myakiba. Leave every other type unchecked:
  - It sends no personally identifiable information. `packages/mfc/src/capture.ts` (`scrubMfcPage`) removes the MFC account menu and profile links before a page leaves the MFC tab.
  - It reads no authentication information. The browser attaches MFC cookies to the requests, and the extension never reads or sends them.
  - It records no web history and no user activity. It reads only the URL and title of MFC tabs, and keeps them in the browser.
- **Certifications.** Check all three. They state that the data is not sold or transferred to third parties outside the approved uses, not used for anything unrelated to the single purpose, and not used to decide creditworthiness or lending. The privacy page says the same and states compliance with the Limited Use requirements, which Chrome's Limited Use policy asks for.
- **Privacy policy URL.** https://myakiba.app/privacy

## Firefox data collection

The manifest declares `browser_specific_settings.gecko.data_collection_permissions` as `{ "required": ["websiteContent"] }`. Firefox shows it at install, and AMO shows it on the listing. Website content covers page text, images and request data, which is what the extension sends to myakiba. Nothing is optional, so there is no `optional` list.

`strict_min_version` is `140.0`, the first Firefox that shows this built-in consent. Older Firefox would need a consent screen of the extension's own. The code also needs Firefox 133 for `Uint8Array.fromBase64` and `toBase64`, so 140 drops no supported browser.

The add-on ID is `extension@myakiba.app`. AMO ties every future version to it, so it never changes.

When AMO asks whether the add-on has a privacy policy, say yes and give https://myakiba.app/privacy.

## Privacy policy

The policy is the web page at https://myakiba.app/privacy. Its text is in `apps/web/src/routes/privacy.tsx`, the only copy, so the store and the site cannot disagree. It is a client-side route, so the server's single-page fallback serves it without a session. When the extension's data handling changes, update that page and its date in the same change.

## Reviewer notes

Paste this into Chrome's **Test instructions** tab and AMO's **Notes to Reviewer**, and fill in the account lines.

```text
What it does
The myakiba web app (https://myakiba.app) asks this extension for MyFigureCollection (MFC) items. For each item, the extension opens or reuses an MFC tab, runs its packaged collector script there to read the item page and main picture with the user's own MFC sign-in, and passes them back to the myakiba page through a content script. The myakiba server reads the item details from the page. The extension has no popup, options page or toolbar button.

Test account
myakiba: sign in at https://myakiba.app/login
  Email: <test account email>
  Password: <test account password>
MFC: most item pages work without MFC sign-in. To test items that MFC shows only to signed-in members, sign in to MFC at https://myfigurecollection.net with:
  Username: <MFC test account, or "not provided">
  Password: <MFC test password>

How to test
1. Install the extension and sign in to myakiba.
2. Click Add at the top right, then choose Item Database.
3. Paste one or two MFC item links, such as https://myfigurecollection.net/item/<id>, and submit. Use items that are not in myakiba yet: myakiba does not ask the extension for an item it already has.
4. An MFC tab opens in the background, loads each item page, and closes when the import ends. The import's progress and the new items appear in myakiba.
5. To fetch an item again, open any MFC item in myakiba and click "Refresh item details".

Permissions
- scripting: runs the packaged collector script (collector.js) in the MFC tab.
- storage: session storage for the MFC tabs the extension opened and its page-load pacing.
- cookies (Firefox only): opens the MFC tab in the myakiba tab's container. No cookie is read.
- https://myfigurecollection.net/*: finds or opens the MFC tab and fetches item pages and members-only pictures with the user's sign-in.
- https://static.myfigurecollection.net/*: loads and reads an item's public picture.
- Content script on https://myakiba.app/*: receives requests from the myakiba web app.

Data
The extension sends the requested MFC item pages and pictures only to the myakiba page, which uploads them to myakiba's server. It removes the MFC username and profile links from each page first. Privacy policy: https://myakiba.app/privacy
```

For AMO, add this paragraph:

```text
Source code: the add-on is bundled and minified by WXT (Vite). The sources zip contains apps/extension/SOURCE_CODE_REVIEW.md with the build steps: Bun 1.4.4, Node 24, then "bun install --frozen-lockfile" at the root and "bun run zip" in apps/extension. The output is apps/extension/.output/myakiba-1.0.0-firefox.zip. The "Function constructor" linter warnings come from zod 4's eval check, and the Android warning is expected because the add-on is for Firefox desktop only. SOURCE_CODE_REVIEW.md explains both.
```

## Screenshots

The Chrome Web Store needs at least one screenshot, up to five, each 1280x800 or 640x400, with square corners and no padding. AMO recommends 1280x800 too. The extension has no screen of its own, so each screenshot shows myakiba while it uses the extension. Capture them in Chrome at a 1280x800 window size, signed in with a real account:

1. The Add menu open, with Item Database and the field for MFC item links.
2. An import in progress, showing its progress while the extension reads the items.
3. The finished import, with the new items and their pictures.
4. Optional: an item's page after "Refresh item details".

The repo's end-to-end tests run against a mock myakiba page and a mock MFC site with made-up pictures, so they cannot produce honest screenshots.

The small promo tile (440x280) and the marquee tile (1400x560) are optional. Chrome lists items without a small tile after those that have one.

## Release checklist

1. Make sure https://myakiba.app/privacy is live in production.
2. In `apps/extension`, run `bun run zip`, then `bun run verify-sources`.
3. Optionally, lint the Firefox zip from a temporary directory: `bunx addons-linter apps/extension/.output/myakiba-1.0.0-firefox.zip`. Expect 0 errors and the 4 warnings that `SOURCE_CODE_REVIEW.md` explains.
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
6. After both stores approve the extension, update the "How do I install the myakiba browser extension?" answer in `apps/web/src/components/homepage/faqs.tsx` to link to the two listings.

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
