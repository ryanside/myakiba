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
import type { ExtensionStore } from "@/lib/extension-listings";

const STORE_BROWSERS = {
  chromeWebStore: "Chrome, Edge and other Chromium browsers",
  firefoxAddons: "Firefox",
} as const satisfies Record<ExtensionStore, string>;

const EXTENSION_USES =
  "You need the extension on a computer to pick MFC items, add MFC items, import an MFC CSV or a myakiba export, and refresh an item's details.";

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
      "Yes. When you pick an item on its MFC page, the myakiba browser extension keeps that page and its picture in your browser until myakiba's Add page saves the item. Saved items are shared, so an item added once never needs adding again. A CSV import or an item refresh loads MFC pages with your MFC sign-in, one every few seconds, so it never hammers their site.",
  },
  {
    id: "faq-add-items",
    question: "How do I add items?",
    answer:
      "Open an item on MFC and click Pick for myakiba, next to MFC's own buttons. Your picks wait in the extension until you open the Add page in myakiba, where you choose where they go: your collection, an order, your wishlist or a list. Items already in myakiba can be added from the Add page's search, without the extension.",
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
    question: "Is myakiba a MFC alternative?",
    answer:
      "myakiba is an alternative for MFC's manager. It does not aim to replace MFC's community, database, or marketplace features.",
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
    <section id="faqs" className="bg-background py-16">
      <div className="mx-auto max-w-5xl px-6">
        <h2 className="text-xl font-medium tracking-tight">FAQs</h2>
        <Accordion className="mt-8" defaultValue={openedFromLink()}>
          {FAQ_ITEMS.map((item) => (
            <AccordionItem key={item.id} id={item.id} value={item.id} className="scroll-mt-16">
              <AccordionTrigger className="cursor-pointer text-sm hover:no-underline">
                {item.question}
              </AccordionTrigger>
              <AccordionContent>
                <p className="text-sm text-muted-foreground">{item.answer}</p>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

        <p className="text-muted-foreground mt-8 text-sm">
          Something else?{" "}
          <a
            href="https://discord.gg/VKHVvhcC2z"
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground font-medium hover:underline"
          >
            Ask on Discord
          </a>
        </p>
      </div>
    </section>
  );
}
