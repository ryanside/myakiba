# MFC page fixtures

The repo is public, so no fixture carries the capturing user's handle, avatar, session tokens, or other users' handles or profiles. The footer's "Banner designed by" credit names the MFC user who made the page banner; in every fixture that handle became `fixture_user`.

## Captured

`item-98777.html` is the signed-in page for item 98777, captured from a real browser session. It was edited before commit:

- The capturing user's handle and avatar became `fixture_user` and `/upload/users/200/fixture_user.jpeg`, in the user menu and its `/profile/` links.
- Every `<script>`, `<form>` and `<input>`, and every HTML comment, was removed. That covers the consent manager, analytics and ad tags, the search forms and their hidden fields.
- The Comments, My lists and Changelog sections were removed, because they list other users' `/profile/` links.

The markup the parser reads is byte-identical to the capture.

Three signed-out pages were captured on 2026-11-12 from a browser session with no MFC account. They were edited before commit:

- `item-581731-signed-out.html` has six releases: JPY and CNY prices with MFC's conversion link, a type naming an event and a year (`Magical Mirai 2023 TOKYO`), and a release with no barcode.
- `item-10756-signed-out.html` has a release with no price, so its barcode link follows the type with no bullet.
- `not-found-signed-out.html` is MFC's answer to an item id that does not exist. MFC sent it with status 404.

Every `<script>`, `<noscript>`, `<form>`, `<input>`, `<iframe>` and HTML comment was removed, and so was every section that names other users: Comments, Pictures, Community, Related Clubs and Changelog. No `/profile/` link is left. The pages were loaded and written again by cheerio, so entities such as `&laquo;` are decoded, void tags lose their `/>` and a repeated attribute keeps its first value. What the parser reads parses to the same tree as the capture. `item-98777.html` still holds MFC's encoded entities and its repeated `class` attribute.

## Derived

None of these was captured. Each one except the challenge page is `item-98777.html` with the edits listed.

- `derived-public-item.html` is a signed-out view of the same item.
  - Every literal `[Explicit] - ` prefix was removed, in the title, the description, the Open Graph tags, `h1.title` and the image `alt` texts.
  - `og:image` and the main `.item-picture img` became `https://static.myfigurecollection.net/upload/items/1/98777-a1b2c.jpg`.
  - The user menu became MFC's guest menu, as captured from a signed-out page: its handle links to `/session/signin/` and reads `Guest`.
  - The `18+` rating link in Various was removed.
  - The header thumbnail still uses the gated picture, and the share links keep the URL-encoded prefix.
- `derived-not-found-signed-in.html` is a 404 for a signed-in user.
  - The `<title>` became `MyFigureCollection.net`.
  - The description, Open Graph tags and canonical link were removed.
  - The item content was replaced by `<p>The page you requested was not found.</p>`.
- `derived-not-found-signed-out.html` is the signed-in 404 with the user menu replaced by MFC's guest menu, as above.
- `derived-challenge.html` is written by hand after Cloudflare's "Just a moment..." interstitial. It shares no markup with the item page.

## Checked against real MFC

The signed-out captures confirm the markers the derived pages assumed:

- A signed-out page keeps an element with the `user-menu` class, holding MFC's guest menu: its handle links to `/session/signin/` and reads `Guest`.
- A missing item answers 404 with the sentence "The page you requested was not found."
- A public picture's `og:image` is under `https://static.myfigurecollection.net/upload/items/`.
