import { createFileRoute, notFound } from "@tanstack/react-router";
import type { MDXComponents } from "mdx/types";
import {
  ChangelogCoverImage,
  ChangelogImage,
  ChangelogLink,
  ChangelogTable,
} from "@/components/changelog/changelog-mdx";
import { formatChangelogDate, loadChangelogEntry } from "@/lib/changelog";
import "@/components/changelog/changelog.css";

const changelogMdxComponents = {
  a: ChangelogLink,
  img: ChangelogImage,
  table: ChangelogTable,
} satisfies MDXComponents;

export const Route = createFileRoute("/(changelog)/changelog/$slug")({
  loader: ({ params }) => {
    const entry = loadChangelogEntry(params.slug);
    if (!entry) throw notFound();
    return entry;
  },
  head: ({ loaderData }) => {
    if (!loaderData) return {};

    const { metadata } = loaderData;
    return {
      meta: [
        { title: `${metadata.title} - myakiba` },
        { name: "description", content: metadata.summary },
        { property: "og:title", content: metadata.title },
        { property: "og:description", content: metadata.summary },
        ...(metadata.cover
          ? [{ property: "og:image", content: `https://myakiba.app${metadata.cover.src}` }]
          : []),
      ],
    };
  },
  component: ChangelogDetail,
});

function ChangelogDetail() {
  const { Content, metadata } = Route.useLoaderData();

  return (
    <article className="mx-auto flex w-full max-w-2xl flex-col gap-10 px-6 py-10 sm:py-16">
      <div className="flex flex-col gap-8">
        <header className="flex flex-col gap-4">
          <time
            dateTime={metadata.date}
            className="w-fit text-sm tabular-nums text-muted-foreground"
          >
            {formatChangelogDate(metadata.date)}
          </time>
          <h1 className="text-balance text-3xl font-medium tracking-tight sm:text-4xl">
            {metadata.title}
          </h1>
          <p className="text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
            {metadata.summary}
          </p>
        </header>

        {metadata.cover ? (
          <ChangelogCoverImage
            src={metadata.cover.src}
            alt={metadata.cover.alt}
            className="aspect-video w-full rounded-xl"
          />
        ) : null}
      </div>

      <div className="typeset typeset-docs text-pretty">
        <Content components={changelogMdxComponents} />
      </div>
    </article>
  );
}
