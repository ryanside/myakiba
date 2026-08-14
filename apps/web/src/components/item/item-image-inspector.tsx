import { useState } from "react";
import type { ReactNode } from "react";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function ItemImageInspector({
  image,
  title,
}: {
  readonly image: string;
  readonly title: string;
}): ReactNode {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Dialog modal open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger
        render={
          <div
            className="animate-data-in w-48 aspect-11/15 shrink-0 cursor-zoom-in overflow-hidden rounded-xl bg-muted/30 ring-1 ring-foreground/6"
            aria-label={`Inspect image of ${title}`}
          />
        }
      >
        <img
          src={image}
          alt={title}
          className="h-full w-full object-cover object-top"
          loading="lazy"
        />
      </DialogTrigger>

      <DialogContent
        showCloseButton={false}
        className="inset-0 top-0 left-0 h-dvh max-h-none w-screen max-w-none! translate-x-0 translate-y-0 gap-0 overflow-hidden rounded-none bg-background/95 p-0 text-foreground ring-0 backdrop-blur-sm sm:max-w-none!"
        onClick={(event) => {
          if (
            event.target instanceof Element &&
            event.target.closest("[data-image-inspector-interactive]")
          ) {
            return;
          }
          setIsOpen(false);
        }}
      >
        <DialogTitle className="sr-only">Inspect image of {title}</DialogTitle>
        <DialogDescription className="sr-only">Full-screen image viewer.</DialogDescription>

        <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-4 bg-linear-to-b from-background/95 to-transparent px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-12 sm:px-6">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{title}</p>
          </div>
          <DialogClose
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                data-image-inspector-interactive
                className="pointer-events-auto shrink-0"
                aria-label="Close image inspector"
              />
            }
          >
            <HugeiconsIcon icon={Cancel01Icon} data-icon="inline-start" strokeWidth={2} />
          </DialogClose>
        </header>

        <div className="h-dvh overflow-auto overscroll-contain px-4 py-20 sm:px-8">
          <div className="flex min-h-full min-w-full items-center justify-center">
            <div
              data-image-inspector-interactive
              className="w-120 max-w-[calc(100vw-2rem)] shrink-0"
            >
              <img
                src={image}
                alt={title}
                className="block h-auto w-full rounded-xl object-contain outline -outline-offset-1 outline-border"
              />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
