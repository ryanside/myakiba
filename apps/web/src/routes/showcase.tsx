import { createFileRoute } from "@tanstack/react-router";
import * as z from "zod";
import { ThemeToggle } from "@/components/theme-toggle";
import { prepareShowcaseScreens } from "@/components/showcase/prepare";
import { SHOWCASE_SCREEN_NAMES, SHOWCASE_SCREENS } from "@/components/showcase/screens";
import { ShowcaseScreen } from "@/components/showcase/showcase-screen";
import { SCREEN_WIDTH } from "@/components/showcase/showcase-frame";

export const Route = createFileRoute("/showcase")({
  validateSearch: z.object({
    /** Shows one screen alone at its full size, to compare it with the app pixel for pixel. */
    focus: z.enum(SHOWCASE_SCREEN_NAMES).optional(),
  }),
  loaderDeps: ({ search }) => ({ focus: search.focus }),
  loader: async ({ deps }) => {
    await prepareShowcaseScreens(deps.focus ? [deps.focus] : SHOWCASE_SCREEN_NAMES);
    return { now: new Date() };
  },
  component: ShowcaseComponent,
  head: () => ({
    meta: [{ title: "Showcase - myakiba" }, { name: "robots", content: "noindex" }],
  }),
});

function ShowcaseComponent() {
  const { now } = Route.useLoaderData();
  const { focus } = Route.useSearch();

  if (focus) return <ShowcaseScreen name={focus} now={now} className="w-full" />;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-16 px-6 py-12">
      <header className="flex items-center justify-between gap-4">
        <h1 className="page-title">Showcase</h1>
        <ThemeToggle />
      </header>
      {SHOWCASE_SCREEN_NAMES.map((name) => (
        <section key={name} className="flex flex-col gap-4">
          <h2 className="text-sm text-muted-foreground">{SHOWCASE_SCREENS[name].label}</h2>
          <ShowcaseScreen name={name} now={now} className="rounded-xl border shadow-sm" />
        </section>
      ))}
      <p className="text-xs text-muted-foreground">
        Each screen shows the app at {SCREEN_WIDTH}px wide, with sample data.
      </p>
    </main>
  );
}
