import type { MDXContent } from "mdx/types";
import { parseDateOnly } from "@myakiba/utils/date-only";
import { buildChangelogSources } from "@/lib/changelog-content";
import type { ChangelogEntryMetadata } from "@/lib/changelog-content";

type ChangelogMdxModule = Readonly<{
  default: MDXContent;
  frontmatter: unknown;
}>;

const changelogModules = import.meta.glob<ChangelogMdxModule>("../content/changelog/*.mdx", {
  eager: true,
});
const sources = buildChangelogSources(changelogModules);
const sourceBySlug = new Map(sources.map((source) => [source.metadata.slug, source]));

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

export type LoadedChangelogEntry = Readonly<{
  Content: MDXContent;
  metadata: ChangelogEntryMetadata;
}>;

export function getChangelogEntries(): readonly ChangelogEntryMetadata[] {
  return sources.map((source) => source.metadata);
}

export function formatChangelogDate(value: string): string {
  const date = parseDateOnly(value);
  return date ? dateFormatter.format(date) : value;
}

export function loadChangelogEntry(slug: string): LoadedChangelogEntry | null {
  const source = sourceBySlug.get(slug);
  if (!source) return null;

  const module = changelogModules[source.sourcePath];
  if (!module) return null;

  return { Content: module.default, metadata: source.metadata };
}
