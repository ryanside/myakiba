import type { PageFetch } from "./capture";

export type ContentGlobal = { readonly content?: { readonly fetch?: PageFetch } | null };

/**
 * Firefox's content-script `fetch` runs as the extension, without MFC's cookies, and `content.fetch` runs as the page.
 * Chrome has no `content`, but an element with `id="content"`, which MFC has, is reachable under that name and has no
 * `fetch`, so the check has to be on `fetch` and not on `content`.
 */
export function pageFetchOf(global: ContentGlobal, ownFetch: PageFetch): PageFetch {
  const page = global.content;
  const pageWindowFetch = page?.fetch;
  if (!pageWindowFetch) return ownFetch;
  return (url, init) => pageWindowFetch.call(page, url, init);
}
