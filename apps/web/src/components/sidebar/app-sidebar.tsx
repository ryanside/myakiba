import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useEffect } from "react";
import { Link, useLocation, useRouter } from "@tanstack/react-router";
import { ActiveDot } from "@/components/active-dot";
import { MyAkibaLogo } from "@/components/myakiba-logo";
import { useOpenOnboarding } from "@/components/onboarding/onboarding-dialog";
import { downloadPageBackground } from "@/lib/page-background";

type NavItem = {
  readonly title: string;
  readonly url: string;
  readonly pathnameMatch?: "prefix";
};

const NAV_GROUPS: readonly { readonly label: string; readonly items: readonly NavItem[] }[] = [
  {
    label: "Overview",
    items: [
      { title: "Dashboard", url: "/dashboard" },
      { title: "Calendar", url: "/calendar" },
      { title: "Analytics", url: "/analytics", pathnameMatch: "prefix" },
      { title: "Expenses", url: "/expenses", pathnameMatch: "prefix" },
    ],
  },
  {
    label: "Library",
    items: [
      { title: "Collection", url: "/collection" },
      { title: "Orders", url: "/orders", pathnameMatch: "prefix" },
      { title: "Wishlist", url: "/wishlist" },
      { title: "Lists", url: "/lists", pathnameMatch: "prefix" },
      { title: "Item Database", url: "/items" },
    ],
  },
  {
    label: "Account",
    items: [{ title: "Settings", url: "/settings" }],
  },
];

const FOOTER_LINKS = [
  { title: "Changelog", url: "/changelog", external: false },
  { title: "Discord", url: "https://discord.gg/VKHVvhcC2z", external: true },
  { title: "GitHub", url: "https://github.com/ryanside/myakiba", external: true },
] as const;

function useWarmDestinations(urls: readonly string[]) {
  const router = useRouter();
  useEffect(() => {
    let cancelled = false;
    const warmDestinations = async () => {
      for (const url of urls) {
        if (cancelled) return;
        await router.preloadRoute({ to: url });
      }
      if (cancelled) return;
      for (const url of urls) downloadPageBackground(url);
    };
    const handle = window.setTimeout(warmDestinations, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [router, urls]);
}

const navMainUrls = NAV_GROUPS.flatMap((group) => group.items.map((item) => item.url));

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const location = useLocation();
  const openOnboarding = useOpenOnboarding();
  useWarmDestinations(navMainUrls);

  return (
    <Sidebar variant="sidebar" collapsible="offcanvas" {...props}>
      <SidebarHeader className="px-3 pt-4 pb-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              aria-label="myakiba dashboard"
              className="h-9 w-fit px-2 hover:bg-transparent active:bg-transparent"
              render={<Link to="/dashboard" />}
            >
              <MyAkibaLogo size="full" className="my-0 h-[1.125rem]! w-[5.75rem]!" />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="gap-0 px-3">
        <nav aria-label="Main">
          {NAV_GROUPS.map((group) => (
            <SidebarGroup key={group.label} className="px-0 py-2">
              <div
                id={`nav-group-${group.label.toLowerCase()}`}
                className="group-label flex h-6 shrink-0 items-center px-2"
              >
                {group.label}
              </div>
              <SidebarMenu
                className="gap-0"
                aria-labelledby={`nav-group-${group.label.toLowerCase()}`}
              >
                {group.items.map((item) => {
                  const isActive =
                    item.pathnameMatch === "prefix"
                      ? location.pathname.startsWith(item.url)
                      : location.pathname === item.url;
                  return (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton
                        isActive={isActive}
                        className="h-8 gap-2 px-2 text-sm text-muted-foreground hover:bg-transparent hover:text-foreground active:bg-transparent data-active:bg-transparent data-active:font-medium data-active:text-foreground"
                        render={<Link to={item.url} preload="intent" />}
                      >
                        <span>{item.title}</span>
                        {isActive ? <ActiveDot /> : null}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroup>
          ))}
        </nav>
      </SidebarContent>
      <SidebarFooter className="gap-1 px-5 pb-5">
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={openOnboarding}
          className="w-fit rounded-md text-left text-[0.8125rem] text-muted-foreground outline-ring color-motion hover:text-foreground focus-visible:outline-2"
        >
          Getting started
        </button>
        <SidebarMenu className="gap-0">
          {FOOTER_LINKS.map((link) => (
            <SidebarMenuItem key={link.title}>
              <SidebarMenuButton
                size="sm"
                className="h-7 px-0 text-[0.8125rem] text-muted-foreground hover:bg-transparent hover:text-foreground active:bg-transparent"
                render={
                  link.external ? (
                    (renderProps) => (
                      <a {...renderProps} href={link.url} target="_blank" rel="noopener noreferrer">
                        {renderProps.children}
                      </a>
                    )
                  ) : (
                    <Link to={link.url} />
                  )
                }
              >
                {link.title}
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
