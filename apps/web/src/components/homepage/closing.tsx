import { Add01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { HomeSection, StartActions } from "@/components/homepage/kit";

const SHELF: readonly { readonly src: string; readonly fromSm?: true }[] = [
  { src: "/example-item2.webp" },
  { src: "/example-item4.webp" },
  { src: "/example-item5.webp" },
  { src: "/example-item6.webp" },
  { src: "/example-item3.webp", fromSm: true },
];

function ItemShelf() {
  return (
    <ul aria-hidden className="flex gap-2 max-lg:justify-center">
      {SHELF.map(({ src, fromSm }) => (
        <li key={src} className={fromSm ? "max-sm:hidden" : undefined}>
          <img
            src={src}
            alt=""
            width={56}
            height={56}
            loading="lazy"
            decoding="async"
            className="size-14 rounded-lg object-cover ring-1 ring-foreground/10"
          />
        </li>
      ))}
      <li>
        <span className="flex size-14 items-center justify-center rounded-lg border border-dashed border-foreground/20 text-muted-foreground">
          <HugeiconsIcon icon={Add01Icon} className="size-4" />
        </span>
      </li>
    </ul>
  );
}

export function Closing() {
  return (
    <HomeSection labelledBy="closing-title" className="py-16 md:py-24">
      <ItemShelf />
      <div className="mt-8 flex items-center justify-center gap-6 max-lg:flex-col max-lg:text-center lg:items-end lg:justify-between">
        <h2
          id="closing-title"
          className="max-w-3xl text-3xl font-medium tracking-tight text-balance md:text-4xl"
        >
          Track your next preorder in myakiba.
        </h2>
        <StartActions />
      </div>
    </HomeSection>
  );
}
