import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const FAQ_ITEMS: readonly {
  readonly id: string;
  readonly question: string;
  readonly answer: string;
}[] = [
  {
    id: "item-1",
    question: "Does myakiba use data from MFC?",
    answer:
      "Yes. When you submit a MFC item link, myakiba scrapes and saves the item details. This process, called sync, has various limits in place like throttling and rate limiting to prevent hammering their site. We also cache item data so subsequent requests for the same item link doesn't need syncing again.",
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

export default function FAQsSection() {
  return (
    <section id="faqs" className="bg-background py-16">
      <div className="mx-auto max-w-5xl px-6">
        <h2 className="text-xl font-medium tracking-tight">FAQs</h2>
        <Accordion className="mt-8">
          {FAQ_ITEMS.map((item) => (
            <AccordionItem key={item.id} value={item.id}>
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
