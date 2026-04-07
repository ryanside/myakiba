import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { MyAkibaLogo } from "@/components/myakiba-logo";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";

const FIGURE_ITEMS = [
  "/example-item1.jpg",
  "/example-item2.jpg",
  "/example-item3.jpg",
  "/example-item4.jpg",
  "/example-item5.jpg",
  "/example-item6.jpg",
] as const;

function FigureThumb({ src }: { readonly src: string }) {
  return (
    <div className="bg-card shadow-black/6.5 ring-border relative flex size-9 items-center justify-center overflow-hidden rounded-md shadow-sm ring">
      <img src={src} alt="" className="size-full object-cover object-top" />
    </div>
  );
}

export default function MfcSyncSection() {
  return (
    <section className="bg-background @container py-16">
      <div className="mx-auto max-w-2xl px-6">
        <SyncIllustration />
        <div className="mx-auto mt-12 max-w-md text-balance text-center">
          <h2 className="text-xl font-medium tracking-tight">Sync from MyFigureCollection</h2>
          <p className="text-muted-foreground mt-3 text-[15px] leading-normal">
            Import your MFC collection and orders into a customizable manager with detailed
            analytics and order tracking.
          </p>
          <div className="mt-5">
            <Button
              variant="secondary"
              size="sm"
              className="gap-1 rounded-full pr-1.5"
              render={<Link to="/login" />}
              nativeButton={false}
            >
              Get started
              <HugeiconsIcon icon={ArrowRight01Icon} />
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function SyncIllustration() {
  return (
    <div aria-hidden className="mx-auto flex h-44 max-w-lg flex-col justify-between">
      <div className="@lg:px-6 relative flex h-10 items-center justify-between gap-12">
        <div className="bg-border absolute inset-0 my-auto h-px" />

        <FigureThumb src={FIGURE_ITEMS[0]} />
        <FigureThumb src={FIGURE_ITEMS[1]} />
      </div>

      <div className="@lg:px-24 relative flex h-10 items-center justify-between px-12">
        <div className="bg-border absolute inset-0 my-auto h-px" />
        <div className="bg-linear-to-r mask-l-from-15% mask-l-to-40% mask-r-from-75% mask-r-to-75% from-chart-3 absolute inset-0 my-auto h-px w-1/2 via-chart-5 to-chart-6" />
        <div className="bg-linear-to-r mask-r-from-15% mask-r-to-40% mask-l-from-75% mask-l-to-75% absolute inset-0 my-auto ml-auto h-px w-1/2 from-chart-2 via-chart-4 to-chart-6" />

        <FigureThumb src={FIGURE_ITEMS[2]} />

        <div className="border-foreground/15 rounded-full border border-dashed p-2">
          <div className="bg-card shadow-black/6.5 ring-border relative flex h-8 items-center rounded-full px-3 shadow-sm ring">
            <MyAkibaLogo size="full" className="h-3.5 w-auto my-0" />
          </div>
        </div>

        <FigureThumb src={FIGURE_ITEMS[3]} />
      </div>

      <div className="@lg:px-6 relative flex h-10 items-center justify-between gap-12">
        <div className="bg-border absolute inset-0 my-auto h-px" />

        <FigureThumb src={FIGURE_ITEMS[4]} />
        <FigureThumb src={FIGURE_ITEMS[5]} />
      </div>
    </div>
  );
}
