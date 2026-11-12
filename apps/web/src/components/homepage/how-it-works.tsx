import { BookmarkAdd01Icon, PackageAddIcon, PuzzleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import { useDemoTheme } from "@/components/demos/demo-props";
import { PickToAddDemo } from "@/components/demos/pick-to-add";
import { Bezel, HomeSection } from "@/components/homepage/kit";
import { EXTENSION_LISTINGS, EXTENSION_STORES } from "@/lib/extension-listings";

type Step = {
  readonly icon: IconSvgElement;
  readonly lead: string;
  readonly rest: string;
};

const IN_REVIEW = EXTENSION_STORES.every((store) => EXTENSION_LISTINGS[store] === null);

const STEPS: readonly Step[] = [
  {
    icon: PuzzleIcon,
    lead: "Install the myakiba extension",
    rest: IN_REVIEW
      ? "in Chrome or Firefox on a computer, once it passes store review."
      : "in Chrome or Firefox on a computer.",
  },
  {
    icon: BookmarkAdd01Icon,
    lead: "Pick an item",
    rest: "on its MFC page.",
  },
  {
    icon: PackageAddIcon,
    lead: "Add it",
    rest: "to your collection, an order, your wishlist or a list.",
  },
];

export function HowItWorks() {
  const theme = useDemoTheme();
  return (
    <HomeSection
      id="how-it-works"
      labelledBy="how-it-works-title"
      className="overflow-hidden py-16 md:py-24"
    >
      <h2
        id="how-it-works-title"
        className="mb-8 max-w-3xl text-3xl font-medium tracking-tight text-balance text-muted-foreground md:mb-16 md:text-4xl xl:text-5xl"
      >
        <span className="text-foreground">How it works.</span> Item details come from
        MyFigureCollection (MFC), so you never type them in.
      </h2>

      <div className="grid items-center gap-10 lg:grid-cols-3 lg:gap-20">
        <div className="relative lg:col-span-2">
          <Bezel className="shadow-xl shadow-black/10 dark:shadow-black/40">
            <PickToAddDemo theme={theme} />
          </Bezel>
        </div>

        <ul className="flex flex-col gap-3 *:not-last:border-b *:not-last:pb-3">
          {STEPS.map((step) => (
            <li key={step.lead} className="text-base text-balance text-muted-foreground">
              <span className="font-medium text-foreground">
                <HugeiconsIcon icon={step.icon} className="inline size-4 -translate-y-0.5" />{" "}
                {step.lead}
              </span>{" "}
              {step.rest}
            </li>
          ))}
        </ul>
      </div>
    </HomeSection>
  );
}
