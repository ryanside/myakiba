import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const EXTENSION_FAQ_ID = "faq-extension";
export const EXTENSION_FAQ_HREF = `/#${EXTENSION_FAQ_ID}`;

const FAQ_ITEMS: readonly {
  readonly id: string;
  readonly question: string;
  readonly answer: string;
}[] = [
  {
    id: "item-1",
    question: "Does myakiba use data from MFC?",
    answer:
      "Yes. When you add an MFC item that isn't in myakiba yet, the myakiba browser extension opens its page with your MFC sign-in and imports the item details. It loads one page every few seconds so it never hammers their site. Imported items are shared, so an item imported once never needs importing again.",
  },
  {
    id: EXTENSION_FAQ_ID,
    question: "How do I install the myakiba browser extension?",
    answer:
      "You need the extension to add MFC items, import an MFC CSV or a myakiba export, and refresh an item's details. It isn't in the Chrome Web Store or Firefox Add-ons yet, so ask on Discord for the current build. Once it's installed, reload myakiba.",
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
