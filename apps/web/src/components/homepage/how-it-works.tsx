import { BookmarkAdd01Icon, PackageAddIcon, PuzzleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import { useDemoTheme } from "@/components/demos/demo-props";
import { PickToAddDemo } from "@/components/demos/pick-to-add";
import { Bezel, HomeSection } from "@/components/homepage/kit";
import { extensionAvailability } from "@/lib/extension-availability";
import { EXTENSION_LISTINGS, EXTENSION_STORES } from "@/lib/extension-listings";
import type { ExtensionStore } from "@/lib/extension-listings";

type Step = {
  readonly icon: IconSvgElement;
  readonly lead: string;
  readonly rest: string;
  readonly href: string | null;
};

const BROWSER_NAMES = {
  chromeWebStore: "Chrome",
  firefoxAddons: "Firefox",
} as const satisfies Record<ExtensionStore, string>;

function browsers(stores: readonly ExtensionStore[]): string {
  return stores.map((store) => BROWSER_NAMES[store]).join(" or ");
}

/** Which browsers install the extension now, and which still wait on store review. */
function installWhere(): string {
  const listed = EXTENSION_STORES.filter((store) => EXTENSION_LISTINGS[store] !== null);
  const reviewing = EXTENSION_STORES.filter((store) => EXTENSION_LISTINGS[store] === null);
  if (listed.length === 0) {
    return `in ${browsers(reviewing)} on a computer, once it passes store review.`;
  }
  const later =
    reviewing.length === 0 ? "" : ` ${browsers(reviewing)} support follows store review.`;
  return `in ${browsers(listed)} on a computer.${later}`;
}

const PICK_AND_ADD: readonly Step[] = [
  {
    icon: BookmarkAdd01Icon,
    lead: "Pick an item",
    rest: "on its MFC page.",
    href: null,
  },
  {
    icon: PackageAddIcon,
    lead: "Add it",
    rest: "to your collection, an order, your wishlist or a list.",
    href: null,
  },
];

export function HowItWorks() {
  const theme = useDemoTheme();
  const availability = extensionAvailability();
  const steps: readonly Step[] = [
    {
      icon: PuzzleIcon,
      lead: "Install the myakiba extension",
      rest: installWhere(),
      href: availability.kind === "listed" ? availability.url : null,
    },
    ...PICK_AND_ADD,
  ];
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
          {steps.map((step) => (
            <li key={step.lead} className="text-base text-balance text-muted-foreground">
              <span className="font-medium text-foreground">
                <HugeiconsIcon icon={step.icon} className="inline size-4 -translate-y-0.5" />{" "}
                {step.href === null ? (
                  step.lead
                ) : (
                  <a
                    href={step.href}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-sm underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    {step.lead}
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                )}
              </span>{" "}
              {step.rest}
            </li>
          ))}
        </ul>
      </div>
    </HomeSection>
  );
}
