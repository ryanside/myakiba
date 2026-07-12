import { Fragment } from "react";
import { ArrowRight02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChangelogCoverImage } from "@/components/changelog/changelog-mdx";
import { Separator } from "@/components/ui/separator";
import { formatChangelogDate, getChangelogEntries } from "@/lib/changelog";
import "@/components/changelog/changelog.css";

export const Route = createFileRoute("/(changelog)/changelog/")({
  component: ChangelogIndex,
  head: () => ({
    meta: [
      { title: "Changelog - myakiba" },
      {
        name: "description",
        content: "See what's new in myakiba.",
      },
      { property: "og:title", content: "Changelog - myakiba" },
      {
        property: "og:description",
        content: "See what's new in myakiba.",
      },
    ],
  }),
});

function ChangelogIndex() {
  const entries = getChangelogEntries();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-12 px-6 py-14 sm:py-20">
      <header className="flex flex-col gap-3">
        <h1 className="text-balance text-3xl font-medium tracking-tight sm:text-4xl">Changelog</h1>
        <p className="text-pretty text-base leading-relaxed text-muted-foreground">
          See what's new in myakiba.
        </p>
      </header>

      <ol className="flex flex-col">
        {entries.map((entry, index) => (
          <Fragment key={entry.slug}>
            {index > 0 ? <Separator className="my-8" /> : null}
            <li>
              <article>
                <Link
                  to="/changelog/$slug"
                  params={{ slug: entry.slug }}
                  className="group -mx-3 flex flex-col gap-4 rounded-xl px-3 py-4 outline-none transition-colors duration-150 hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <time
                    dateTime={entry.date}
                    className="w-fit text-sm tabular-nums text-muted-foreground"
                  >
                    {formatChangelogDate(entry.date)}
                  </time>

                  <div className="flex flex-col gap-2">
                    <h2 className="text-balance text-xl font-medium tracking-tight sm:text-2xl">
                      {entry.title}
                    </h2>
                    <p className="text-pretty leading-relaxed text-muted-foreground">
                      {entry.summary}
                    </p>
                  </div>

                  {entry.cover ? (
                    <ChangelogCoverImage
                      src={entry.cover.src}
                      alt={entry.cover.alt}
                      className="aspect-video w-full rounded-xl"
                    />
                  ) : null}

                  <span className="flex min-h-10 w-fit items-center gap-1.5 text-sm">
                    Read more
                    <HugeiconsIcon
                      icon={ArrowRight02Icon}
                      className="transition-transform duration-150 group-hover:translate-x-0.5 size-3 mt-0.5"
                      aria-hidden
                    />
                  </span>
                </Link>
              </article>
            </li>
          </Fragment>
        ))}
      </ol>
    </div>
  );
}
