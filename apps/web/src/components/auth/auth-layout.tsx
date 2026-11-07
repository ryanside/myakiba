import { BackLink } from "@/components/ui/back-link";
import type { ReactNode } from "react";
import akihabara from "@/assets/backgrounds/11-akihabara-bright-bitgrain.webp";

type AuthLayoutProps = {
  readonly children: ReactNode;
};

/** The form on the left; on wide screens the pixel-art street fills a rounded panel on the right. */
export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="grid min-h-svh bg-background lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex flex-col">
        <div className="p-6 md:p-8">
          <BackLink to="/" text="Back to Home" font="sans" />
        </div>
        <div className="flex flex-1 items-center justify-center px-6 pb-16 md:px-10">
          <div className="animate-appear w-full max-w-[22.5rem]">{children}</div>
        </div>
      </div>
      <div aria-hidden className="hidden p-3 lg:block">
        <div className="relative h-full overflow-hidden rounded-3xl bg-muted">
          {/* Lazy loading avoids fetching the desktop-only image while its panel is hidden. */}
          <img
            src={akihabara}
            alt=""
            loading="lazy"
            className="absolute inset-0 size-full object-cover saturate-[.85] [image-rendering:pixelated]"
          />
          <p className="absolute bottom-6 left-6 rounded-full bg-background/80 px-3 py-1.5 text-sm text-foreground backdrop-blur">
            Your collection, every release, every order.
          </p>
        </div>
      </div>
    </div>
  );
}
