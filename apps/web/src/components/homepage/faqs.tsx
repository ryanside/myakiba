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
    question: "Does myakiba use MyFigureCollection's data?",
    answer:
      "Yes, we use MyFigureCollection's item information. Since MyFigureCollection does not have a public API, myakiba scrapes and stores item information from MyFigureCollection item links that the user provides. Items are periodically rescraped to ensure the item information is accurate and up to date.",
  },
  {
    id: "item-2",
    question: "How does myakiba compare to MyFigureCollection?",
    answer:
      "myakiba is built to realize the features that I thought were missing from MyFigureCollection. It currently offers a dashboard, analytics, order management, and collection management. It is still in early development.",
  },
  {
    id: "item-3",
    question: "Is myakiba safe to use since it scrapes data from MyFigureCollection?",
    answer:
      "Yes. MyFigureCollection's terms of service do not prohibit scraping. We only scrape core item data from the user's provided item links. The scraper is heavily rate limited and throttled, item data is cached to avoid redundant scrapes, and users are limited to syncing a few times per hour to prevent abuse.",
  },
  {
    id: "item-4",
    question: "Who is myakiba for?",
    answer:
      "Collectors who want an alternative to MyFigureCollection's manager or DIY spreadsheets.",
  },
  {
    id: "item-5",
    question: "I'm a developer. Can I contribute to the project?",
    answer:
      "Yes! Contributions are welcome. Check out the GitHub repository and feel free to join our Discord server.",
  },
];

export default function FAQsSection() {
  return (
    <section id="faqs" className="bg-background py-16">
      <div className="mx-auto max-w-2xl px-6">
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
          Have a different question?{" "}
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
