"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Link } from "@tanstack/react-router";

export default function FAQs() {
  const faqItems = [
    {
      id: "item-1",
      question: "Does myakiba use MyFigureCollection's data?",
      answer: `Yes, we use MyFigureCollection's core item information. Since MyFigureCollection does not provide an API, myakiba scrapes and stores item information from MyFigureCollection item links (https://myfigurecollection.net/item/xxxxx) that the user provides. Items are periodically rescraped to ensure the item information is accurate and up to date.`,
    },
    {
      id: "item-2",
      question: "How does myakiba compare to MyFigureCollection?",
      answer:
        "myakiba was built to realize the features that I thought were missing from MyFigureCollection. It currently offers a dashboard, analytics, comprehensive order management, and collection management, with expense tracking and a sharable analytics-focused profile page (complements your MyFigureCollection profile!) in development.",
    },

    {
      id: "item-3",
      question:
        "Is myakiba safe to use since it scrapes data from MyFigureCollection?",
      answer:
        "Yes. MyFigureCollection's terms of service do not prohibit scraping. We also don't mass scrape MyFigureCollection, only scraping core item data from the user's provided MyFigureCollection item links. The scraper is heavily rate limited and throttled to prevent overloading MyFigureCollection, item data is cached so we don't need to scrape the same item data multiple times, and users are limited to syncing a few times per hour to prevent abuse.",
    },
    {
      id: "item-4",   
      question: "Who is myakiba for?",
      answer:
        "Collectors who want a viable alternative to MyFigureCollection/Spreadsheets. Collectors who also want to see a Spotify-wrapped like experience for their collection.",
    },
    {
      id: "item-5",
      question: "Why build this?",
      answer:
        "The other tools were either too simple (like Spreadsheets) or lacked the features I wanted (like MyFigureCollection), so I build this for myself and decided to share it with the community. It's also a fun project to work on and learn new things as a developer.",
    },
    {
      id: "item-6",
      question: "I'm a developer. Can I contribute to the project?",
      answer:
        "Yes! Contributions are welcome. Please check out the GitHub repository and feel free to join our Discord server.",
    },
  ];

  return (
    <section id="faqs" className="py-16 md:py-24 bg-sidebar">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid gap-8 md:grid-cols-5 md:gap-12">
          <div className="md:col-span-2">
            <h2 className="text-black dark:text-white tracking-tight text-4xl font-medium">
              FAQs
            </h2>
            <p className="text-muted-foreground mt-4 text-balance text-lg">
              Your questions answered
            </p>
            <p className="text-muted-foreground mt-6 hidden md:block">
              Have a different question? Join and ask in our{" "}
              <a
                href="https://discord.gg/VKHVvhcC2z"
                target="_blank"
                className="text-foreground font-medium hover:underline"
              >
                Discord
              </a>
            </p>
          </div>

          <div className="md:col-span-3">
            <Accordion type="single" collapsible>
              {faqItems.map((item) => (
                <AccordionItem key={item.id} value={item.id}>
                  <AccordionTrigger className="cursor-pointer text-base hover:no-underline">
                    {item.question}
                  </AccordionTrigger>
                  <AccordionContent>
                    <p className="text-base">{item.answer}</p>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>

          <p className="text-muted-foreground mt-6 md:hidden">
            Can't find what you're looking for? Join and ask in our{" "}
            <Link to="/" className="text-secondary font-medium hover:underline">
              Discord
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}
