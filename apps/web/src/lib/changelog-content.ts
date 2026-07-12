import { z } from "zod";

const coverSchema = z
  .object({
    src: z.string().trim().min(1),
    alt: z.string().trim().min(1),
  })
  .strict();

export const changelogFrontmatterSchema = z
  .object({
    title: z.string().trim().min(1),
    date: z.iso.date(),
    summary: z.string().trim().min(1),
    cover: coverSchema.optional(),
  })
  .strict();

export type ChangelogFrontmatter = z.infer<typeof changelogFrontmatterSchema>;
export type ChangelogEntryMetadata = Readonly<ChangelogFrontmatter & { slug: string }>;
export type ChangelogSource = Readonly<{
  metadata: ChangelogEntryMetadata;
  sourcePath: string;
}>;

const MDX_EXTENSION = /\.mdx$/;

export function getChangelogSlug(sourcePath: string): string {
  const filename = sourcePath.split("/").at(-1);
  if (!filename?.endsWith(".mdx")) {
    throw new Error(`Invalid changelog source path: ${sourcePath}`);
  }

  return filename.replace(MDX_EXTENSION, "");
}

export function buildChangelogSources(
  modules: Readonly<Record<string, { readonly frontmatter: unknown }>>,
): readonly ChangelogSource[] {
  const sources = Object.entries(modules).map(([sourcePath, module]) => {
    const parsed = changelogFrontmatterSchema.safeParse(module.frontmatter);
    if (!parsed.success) {
      throw new Error(`Invalid changelog frontmatter in ${sourcePath}: ${parsed.error.message}`);
    }

    return {
      sourcePath,
      metadata: {
        ...parsed.data,
        slug: getChangelogSlug(sourcePath),
      },
    } satisfies ChangelogSource;
  });

  return sources.toSorted((left, right) => right.metadata.date.localeCompare(left.metadata.date));
}
