import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import {
  HeadContent,
  Outlet,
  createRootRouteWithContext,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import "../index.css";
import { authClient } from "@/lib/auth-client";

export interface RouterAppContext {
  session: Awaited<ReturnType<typeof authClient.getSession>>["data"];
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  component: RootComponent,
  head: () => ({
    meta: [
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1.0",
      },
      // Open Graph / Facebook
      {
        property: "og:type",
        content: "website",
      },
      {
        property: "og:url",
        content: "https://myakiba.app",
      },
      {
        property: "og:title",
        content: "myakiba",
      },
      {
        property: "og:description",
        content:
          "The modern collection management tool for Japanese pop-culture (anime, manga, video-games, etc.) collectables (figures, artbooks, CDs, cups, collectibles, dakimakura, etc.). Track your collection, manage orders, view insightful analytics, and stay organized.",
      },
      {
        property: "og:image",
        content: "/og-image.png",
      },
      {
        property: "og:image:width",
        content: "1200",
      },
      {
        property: "og:image:height",
        content: "630",
      },
      // Twitter
      {
        property: "twitter:card",
        content: "summary_large_image",
      },
      {
        property: "twitter:url",
        content: "https://myakiba.app",
      },
      {
        property: "twitter:title",
        content: "myakiba",
      },
      {
        property: "twitter:description",
        content:
          "The modern collection management tool for Japanese pop-culture (anime, manga, video-games, etc.) collectables (figures, artbooks, CDs, cups, collectibles, dakimakura, etc.). Track your collection, manage orders, view insightful analytics, and stay organized.",
      },
      {
        property: "twitter:image",
        content: "https://myakiba.app/og-image.png",
      },
    ],
    links: [
      {
        rel: "preconnect",
        href: "https://fonts.googleapis.com",
      },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Instrument+Sans:ital,wght@0,400..700;1,400..700&family=JetBrains+Mono:ital,wght@0,100..800;1,100..800&display=swap",
      },
      {
        rel: "icon",
        type: "image/x-icon",
        href: "/favicon.ico",
      },
    ],
    scripts: [],
  }),
});

function RootComponent() {
  return (
    <>
      <HeadContent />
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        disableTransitionOnChange
        storageKey="vite-ui-theme"
      >
        <div className="grid grid-rows-[auto_1fr] min-h-dvh">
          <Outlet />
        </div>
        <Toaster richColors position="top-center" />
      </ThemeProvider>
      {import.meta.env.DEV && (
        <TanStackRouterDevtools position="bottom-right" />
      )}{" "}
    </>
  );
}
