# MFC page fixtures

The repo is public, so no fixture carries the capturing user's handle, avatar, session tokens or other users' profiles.

## Captured

`item-98777.html` is the signed-in page for item 98777, captured from a real browser session. It was edited before commit:

- The capturing user's handle and avatar became `fixture_user` and `/upload/users/200/fixture_user.jpeg`, in the user menu and its `/profile/` links.
- Every `<script>`, `<form>` and `<input>`, and every HTML comment, was removed. That covers the consent manager, analytics and ad tags, the search forms and their hidden fields.
- The Comments, My lists and Changelog sections were removed, because they list other users' `/profile/` links.

The markup the parser reads is byte-identical to the capture.

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

## Unverified against real MFC

These markers come from the edits above, not from a capture:

- The signed-out page has no element with the `user-menu` class.
- A missing item answers with the sentence "The page you requested was not found".
- A public picture's `og:image` is under `https://static.myfigurecollection.net/upload/items/`.

Capture a real page for each before relying on it in production.
