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
      answer:
        "myakiba scrapes item data from MyFigureCollection item links (e.g. myfigurecollection.net/item/) that the user provides and stores the item data in a database. The scraper is heavily rate limited and throttled to prevent overloading MyFigureCollection.",
    },
    {
      id: "item-2",
      question: "How does myakiba compare to MyFigureCollection?",
      answer:
        "myakiba was built to realize the features that I thought were missing from MyFigureCollection. It offers a dashboard, lots of analytics, expense tracking, comprehensive order management (like allowing you to add multiple items to an order), collection management, and a sharable analytics-focused profile page that complements your MyFigureCollection profile.",
    },
    {
      id: "item-3",
      question:
        "why build this",
      answer:
        "The other tools were either too simple (like Spreadsheets) or lacked the features I wanted (like MyFigureCollection). So I built this for myself and decided to share it with the community.",
    },
    {
      id: "item-4",
      question: "Who is myakiba for?",
      answer:
        "Collectors who want a viable alternative to MyFigureCollection/Spreadsheets.",
    },
    {
      id: "item-5",
      question:
        "Is myakiba safe to use since it scrapes data from MyFigureCollection?",
      answer:
        "Yes. MyFigureCollection's terms of service does not prohibit scraping. We also don't mass scrape MyFigureCollection. We only scrape item data from the user's provided MyFigureCollection item links. The scraper is heavily rate limited and throttled to prevent overloading MyFigureCollection, and item data is cached so we don't need to scrape the same item data multiple times. Items are periodically rescraped to ensure the data is accurate and up to date.",
    },
  ];

  return (
    <section id="faqs" className="py-16 md:py-24 bg-sidebar">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid gap-8 md:grid-cols-5 md:gap-12">
          <div className="md:col-span-2">
            <h2 className="text-black dark:text-white text-4xl font-medium">
              FAQs
            </h2>
            <p className="text-muted-foreground mt-4 text-balance text-lg">
              Your questions answered
            </p>
            <p className="text-muted-foreground mt-6 hidden md:block">
              Have a different question? Join and ask in our{" "}
              <Link
                to="/"
                className="text-foreground font-medium hover:underline"
              >
                Discord
              </Link>
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
