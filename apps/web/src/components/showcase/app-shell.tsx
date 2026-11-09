import type { ReactNode } from "react";
import { Add01Icon, PanelLeftIcon, SearchIcon, UserIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ActiveDot } from "@/components/active-dot";
import { MyAkibaLogo } from "@/components/myakiba-logo";
import { buttonVariants } from "@/components/ui/button";
import { getPageBackground } from "@/lib/page-background";
import { cn } from "@/lib/utils";
import "@/components/page-background.css";

type NavItem = { readonly title: string; readonly url: string; readonly prefix?: true };

// The app sidebar's links, as `components/sidebar/app-sidebar.tsx` lists them.
const NAV_GROUPS: readonly { readonly label: string; readonly items: readonly NavItem[] }[] = [
  {
    label: "Overview",
    items: [
      { title: "Dashboard", url: "/dashboard" },
      { title: "Calendar", url: "/calendar" },
      { title: "Analytics", url: "/analytics", prefix: true },
      { title: "Expenses", url: "/expenses", prefix: true },
    ],
  },
  {
    label: "Library",
    items: [
      { title: "Collection", url: "/collection" },
      { title: "Orders", url: "/orders", prefix: true },
      { title: "Wishlist", url: "/wishlist" },
      { title: "Lists", url: "/lists", prefix: true },
      { title: "Item Database", url: "/items" },
    ],
  },
  {
    label: "Account",
    items: [{ title: "Settings", url: "/settings" }],
  },
];

const FOOTER_LINKS = ["Changelog", "Discord", "GitHub"] as const;

const MENU_BUTTON =
  "flex w-full items-center gap-2 overflow-hidden rounded-md text-left [&>span:last-child]:truncate";

function Sidebar({ path }: { readonly path: string }) {
  return (
    <div className="flex h-full w-56 shrink-0 flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex flex-col gap-2 px-3 pt-4 pb-2">
        <div className="flex h-9 w-fit items-center overflow-hidden rounded-md px-2">
          <MyAkibaLogo size="full" className="my-0 h-[1.125rem] w-[5.75rem]" />
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="flex w-full min-w-0 flex-col py-2">
            <div className="group-label flex h-6 shrink-0 items-center px-2">{group.label}</div>
            {group.items.map((item) => {
              const active = item.prefix ? path.startsWith(item.url) : path === item.url;
              return (
                <div
                  key={item.url}
                  className={cn(
                    MENU_BUTTON,
                    "h-8 px-2 py-2 text-sm text-muted-foreground",
                    active && "font-medium text-foreground",
                  )}
                >
                  <span>{item.title}</span>
                  {active ? <ActiveDot /> : null}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-1 px-5 pt-2 pb-5">
        <span className="w-fit rounded-md text-left text-[0.8125rem] text-muted-foreground">
          Getting started
        </span>
        <div className="flex flex-col">
          {FOOTER_LINKS.map((title) => (
            <div
              key={title}
              className={cn(MENU_BUTTON, "h-7 px-0 py-2 text-[0.8125rem] text-muted-foreground")}
            >
              {title}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Header() {
  return (
    <div className="flex h-14 shrink-0 items-center justify-between gap-3 px-8">
      <div className="flex min-w-0 items-center gap-2">
        <span className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "-ml-1 size-7")}>
          <HugeiconsIcon icon={PanelLeftIcon} />
        </span>
        <span className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "size-7")}>
          <HugeiconsIcon icon={SearchIcon} />
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className={buttonVariants({ variant: "default", size: "icon" })}>
          <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
        </span>
        <span className={buttonVariants({ variant: "ghost", size: "icon-lg" })}>
          <span className="relative flex size-7 shrink-0 rounded-full after:absolute after:inset-0 after:rounded-full after:border after:border-border after:mix-blend-darken dark:after:mix-blend-lighten">
            <span className="flex size-full items-center justify-center rounded-full bg-muted bg-linear-to-br from-background via-muted to-background text-sm text-muted-foreground">
              <HugeiconsIcon icon={UserIcon} className="size-4" />
            </span>
          </span>
        </span>
      </div>
    </div>
  );
}

/**
 * The app's frame around a page, as it shows on a desktop window with the sidebar open:
 * sidebar, header and the page's background picture. `path` is the address the page lives at,
 * which picks the active sidebar link and the background, as the app does.
 */
export function AppShell({
  path,
  children,
}: {
  readonly path: string;
  readonly children: ReactNode;
}) {
  const background = getPageBackground(path);
  return (
    <div className="flex h-full w-full">
      <Sidebar path={path} />
      <div className="page-background-surface relative flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
        {background ? (
          // Pinned at its desktop height: the class alone grows on a narrow page.
          <div className="page-background" data-preset="panorama" style={{ height: 120 }}>
            <img src={background} alt="" />
          </div>
        ) : null}
        <Header />
        <div className="w-full min-w-0 px-8 pt-4 pb-12">{children}</div>
      </div>
    </div>
  );
}
