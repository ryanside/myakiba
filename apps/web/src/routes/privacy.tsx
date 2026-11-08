import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { MyAkibaLogo } from "@/components/myakiba-logo";
import { ThemeToggle } from "@/components/theme-toggle";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPolicy,
  head: () => ({
    meta: [
      { title: "Privacy policy - myakiba" },
      {
        name: "description",
        content:
          "What the myakiba browser extension reads, where it sends it, and what myakiba keeps.",
      },
    ],
  }),
});

function Section({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl font-medium tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

function PrivacyPolicy() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-30 bg-background/90 backdrop-blur-sm">
        <nav
          className="mx-auto flex h-14 max-w-2xl items-center justify-between gap-4 px-6"
          aria-label="Privacy policy navigation"
        >
          <Link
            to="/"
            className="flex min-h-10 items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="myakiba home"
          >
            <MyAkibaLogo size="full" className="my-0 h-auto w-24" />
          </Link>
          <ThemeToggle />
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-col gap-10 px-6 py-14 leading-relaxed sm:py-20 [&_li]:ml-5 [&_li]:list-disc [&_p]:text-pretty [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-2">
        <header className="flex flex-col gap-3">
          <h1 className="text-balance text-3xl font-medium tracking-tight sm:text-4xl">
            Privacy policy
          </h1>
          <p className="text-muted-foreground">Last updated October 30, 2026.</p>
          <p>
            This policy covers the myakiba browser extension for Chrome and Firefox. It says what
            the extension reads, where that data goes, and what myakiba keeps.
          </p>
        </header>

        <Section title="What the extension does">
          <p>
            The extension brings MyFigureCollection (MFC) items into myakiba. When you click Pick
            for myakiba on an MFC item page, it keeps that page and the item&apos;s picture in your
            browser until myakiba&apos;s Add page collects them. Click the button again to unpick.
          </p>
          <p>
            When you refresh an item&apos;s details, the myakiba page at myakiba.app asks the
            extension for that item. The extension opens an MFC tab or reuses one you already have
            open, reads the item&apos;s page with your own MFC sign-in, and passes the page and the
            item&apos;s main picture back to the myakiba page.
          </p>
        </Section>

        <Section title="What it reads">
          <ul>
            <li>The MFC item page you click Pick for myakiba on, when you click it.</li>
            <li>The MFC item pages that myakiba asks for, and no other MFC pages.</li>
            <li>The main picture of each of those items, from myfigurecollection.net.</li>
            <li>
              The address, title and loading state of MFC tabs, so it can reuse an open MFC tab and
              know when a page has loaded.
            </li>
          </ul>
          <p>
            When an MFC item page opens, the extension reads only its address, its canonical link
            and the item&apos;s title, to show the button, and sends nothing.
          </p>
          <p>
            Before it keeps or passes on a page, the extension removes its scripts, forms, MFC
            profile links, account menu and most metadata. The page it keeps or passes on does not
            contain your MFC username.
          </p>
        </Section>

        <Section title="What it does not read">
          <ul>
            <li>
              Your MFC password or cookies. Your browser attaches your MFC sign-in to the requests,
              and the extension never reads or sends it.
            </li>
            <li>
              Any site other than myakiba.app and myfigurecollection.net. It does not record your
              browsing history.
            </li>
          </ul>
        </Section>

        <Section title="Where the data goes">
          <p>
            The extension sends item pages and pictures only to the myakiba page open in the same
            browser. That page sends them to myakiba&apos;s server over HTTPS. The extension sends
            nothing to anyone else, and it contains no analytics, ads or trackers.
          </p>
          <p>
            A click on Pick for myakiba makes one request, to MFC, for that item&apos;s picture. The
            picked page and picture stay in the browser&apos;s local storage until myakiba&apos;s
            Add page collects them, and for at most 14 days. Picks made in a private window stay in
            session storage only, for as long as a private window is open. Neither leaves your
            browser before the Add page asks for it.
          </p>
          <p>
            The extension also keeps a small amount of state in the browser&apos;s session storage:
            which MFC tabs it opened and how fast it may load the next page. The browser clears it
            when it closes.
          </p>
        </Section>

        <Section title="What myakiba keeps">
          <ul>
            <li>
              The item details read from the page, such as the name, releases, prices, and the
              artists, characters and companies it lists. They go into myakiba&apos;s item database,
              which every myakiba user shares, because an item&apos;s details are the same for
              everyone.
            </li>
            <li>The item&apos;s picture, in myakiba&apos;s image storage on Amazon S3.</li>
            <li>
              A log entry for each item request with your myakiba account ID, the MFC item number
              and whether the request worked. myakiba uses these logs to find and fix problems, and
              sends them to its log service, PostHog.
            </li>
          </ul>
          <p>myakiba does not keep the page itself after it reads the item details.</p>
        </Section>

        <Section title="How myakiba uses the data">
          <p>
            myakiba uses this data only to add and update items in myakiba. It does not sell it, use
            it for advertising, use it to decide credit or lending, or share it with anyone except
            the storage and log services named above. myakiba&apos;s use of information received
            from the extension complies with the Chrome Web Store User Data Policy, including the
            Limited Use requirements.
          </p>
        </Section>

        <Section title="Your choices">
          <p>
            The extension reads an MFC page only when you click Pick for myakiba on it, or while
            myakiba refreshes items you asked for. Click the button again to unpick an item and
            delete what the extension kept for it. You can remove the extension from your browser at
            any time. The browser then deletes its storage, picks included.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            For questions about this policy, open an issue at{" "}
            <a
              href="https://github.com/ryanside/myakiba/issues"
              className="underline underline-offset-4 hover:text-muted-foreground"
            >
              github.com/ryanside/myakiba
            </a>
            . If this policy changes, this page shows the new date at the top.
          </p>
        </Section>
      </main>
    </div>
  );
}
