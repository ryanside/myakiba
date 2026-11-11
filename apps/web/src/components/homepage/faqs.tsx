import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import type { ReactNode } from "react";
import {
  EXTENSION_FAQ_ID,
  EXTENSION_UPDATE_FAQ_ID,
  STORE_NAMES,
  UNDER_REVIEW_TITLE,
  underReviewBody,
} from "@/components/extension/extension-notice";
import { EXTENSION_LISTINGS, EXTENSION_STORES } from "@/lib/extension-listings";
import { HomeSection } from "@/components/homepage/kit";
import { DISCORD_URL } from "@/components/homepage/links";
import type { ExtensionStore } from "@/lib/extension-listings";

const STORE_BROWSERS = {
  chromeWebStore: "Chrome, Edge and other Chromium browsers",
  firefoxAddons: "Firefox",
} as const satisfies Record<ExtensionStore, string>;

const EXTENSION_USES =
  "You need the extension on a computer to pick MFC items and refresh an item's details.";

function ExtensionInstallAnswer() {
  const reviewing = EXTENSION_STORES.filter((store) => EXTENSION_LISTINGS[store] === null);
  if (reviewing.length === EXTENSION_STORES.length) {
    return `${UNDER_REVIEW_TITLE}. ${underReviewBody(reviewing)}`;
  }
  return (
    <>
      {EXTENSION_USES}
      {EXTENSION_STORES.map((store) => (
        <StoreInstructions key={store} store={store} />
      ))}
    </>
  );
}

function StoreInstructions({ store }: { readonly store: ExtensionStore }) {
  const url = EXTENSION_LISTINGS[store];
  if (url === null) {
    return ` For ${STORE_BROWSERS[store]}, it is in review at ${STORE_NAMES[store]} now, and it will be released shortly.`;
  }
  return (
    <>
      {` For ${STORE_BROWSERS[store]}, install it from `}
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="font-medium text-foreground hover:underline"
      >
        {STORE_NAMES[store]}
      </a>
      , then reload myakiba.
    </>
  );
}

const FAQ_ITEMS: readonly {
  readonly id: string;
  readonly question: string;
  readonly answer: ReactNode;
}[] = [
  {
    id: "item-1",
    question: "Does myakiba use data from MFC?",
    answer:
      "Yes. When you pick an item on its MFC page, the myakiba browser extension keeps that page and its picture in your browser until myakiba's Add page saves the item. Once an item is saved, its details are shared across myakiba, and anyone can add it from the Add page's search without picking it again. An item refresh loads that item's MFC page with the MFC sign-in in your browser, at most one every few seconds, to go easy on their site.",
  },
  {
    id: "faq-add-items",
    question: "How do I add items?",
    answer:
      "Open an item on MFC and click Pick for myakiba, the button the extension adds next to MFC's own. Your picks wait in the extension until you save them on myakiba's Add page, where you choose where they go: your collection, an order, your wishlist or a list. Items already in myakiba can be added from the Add page's search, without the extension.",
  },
  {
    id: EXTENSION_FAQ_ID,
    question: "How do I install the myakiba browser extension?",
    answer: <ExtensionInstallAnswer />,
  },
  {
    id: EXTENSION_UPDATE_FAQ_ID,
    question: "How do I update the myakiba browser extension?",
    answer:
      "Your browser updates the extension from its store on its own: Chrome every few hours, and Firefox about once a day. To update it now in Firefox, open the Add-ons Manager, open its gear menu and choose Check for Updates. In Chrome, open chrome://extensions, turn on Developer mode and click Update. Then reload myakiba.",
  },
  {
    id: "item-2",
    question: "Is myakiba an MFC alternative?",
    answer:
      "myakiba is an alternative to MFC's manager. It does not aim to replace MFC's community, database, or marketplace features.",
  },
  {
    id: "item-3",
    question: "Who is myakiba for?",
    answer:
      "If MFC's manager feels limiting or your DIY spreadsheet is getting out of hand, give myakiba a try.",
  },
  {
    id: "item-4",
    question: "Is myakiba open source?",
    answer:
      "myakiba is open source! If you find a bug, want to add a feature, or have a request, the GitHub repo and Discord are the best places to start.",
  },
];

function openedFromLink(): string[] {
  const linked = window.location.hash.slice(1);
  return FAQ_ITEMS.some((item) => item.id === linked) ? [linked] : [];
}

export default function FAQsSection() {
  return (
    <HomeSection id="faqs" labelledBy="faqs-title" className="py-16 md:py-24">
      <div className="grid gap-12 md:grid-cols-2 md:gap-6">
        <h2
          id="faqs-title"
          className="max-w-sm text-3xl font-medium tracking-tight text-balance md:text-4xl"
        >
          Questions
        </h2>
        <div>
          <Accordion defaultValue={openedFromLink()}>
            {FAQ_ITEMS.map((item) => (
              <AccordionItem
                key={item.id}
                id={item.id}
                value={item.id}
                className="scroll-mt-16 border-dashed"
              >
                <AccordionTrigger className="cursor-pointer py-3 text-[15px]">
                  {item.question}
                </AccordionTrigger>
                <AccordionContent>
                  <p className="text-[15px] leading-relaxed text-muted-foreground">{item.answer}</p>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
          <p className="mt-6 text-sm text-muted-foreground">
            Something else?{" "}
            <a
              href={DISCORD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-foreground hover:underline"
            >
              Ask on Discord
            </a>
          </p>
        </div>
      </div>
    </HomeSection>
  );
}
