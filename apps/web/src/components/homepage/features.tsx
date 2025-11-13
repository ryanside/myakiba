import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  ChartBarIncreasingIcon,
  Database,
  Fingerprint,
  Package,
  IdCard,
  ArrowRightIcon,
  DatabaseIcon,
} from "lucide-react";
import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import analytics from "/analytics.webp";
import collection from "/collection.webp";
import orders from "/orders.webp";
import dashboard from "/dashboard.webp";
import { BorderTrail } from "../ui/border-trail";
import { Button } from "../ui/button";
import { Link } from "@tanstack/react-router";
import { MyAkibaLogo } from "../myakiba-logo";

export default function Features() {
  type ImageKey = "item-1" | "item-2" | "item-3" | "item-4";
  const [activeItem, setActiveItem] = useState<ImageKey>("item-1");

  const images = {
    "item-1": {
      image: orders,
      alt: "Order management",
    },
    "item-2": {
      image: analytics,
      alt: "Collection analytics",
    },
    "item-3": {
      image: collection,
      alt: "Show off your collection in style",
    },
    "item-4": {
      image: dashboard,
      alt: "Sync with MyFigureCollection data",
    },
  };

  return (
    <section className="relative bg-background pb-32 pt-16">
      <div className="bg-linear-to-b absolute inset-0 -z-10 sm:inset-6 sm:rounded-b-3xl dark:block dark:to-[color-mix(in_oklab,var(--color-zinc-900)_75%,var(--color-background))]"></div>
      <div
        aria-hidden
        className="absolute bottom-0 left-0 right-0 h-112 z-0 pointer-events-none [background:radial-gradient(150%_100%_at_50%_0%,transparent_40%,var(--color-secondary),var(--color-foreground)_100%)]"
      />
      <div className="relative mx-auto max-w-5xl space-y-8 px-6 md:space-y-16 lg:space-y-20 dark:[--color-border:color-mix(in_oklab,var(--color-white)_10%,transparent)]">
        <div className="relative z-10 max-w-2xl space-y-6 text-start">
          <h2 className="text-balance text-3xl font-semibold lg:text-6xl dark:text-white/90">
            do cool stuff like:
          </h2>
        </div>
        <div className="grid gap-12 sm:px-12 md:grid-cols-2 lg:gap-20 lg:px-0">
          <Accordion
            type="single"
            value={activeItem}
            onValueChange={(value) => setActiveItem(value as ImageKey)}
            className="w-full"
          >
            <AccordionItem value="item-1">
              <AccordionTrigger>
                <div className="flex items-center gap-2 text-base">
                  <Package className="size-4 fill-yellow-500 stroke-sidebar" />
                  Order Management & Tracking
                </div>
              </AccordionTrigger>
              <AccordionContent>
                Track every order from pre-order to delivery. Add purchase
                details, shipping updates, and delivery confirmations all in one
                place. Never lose track of a figure again.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-2">
              <AccordionTrigger>
                <div className="flex items-center gap-2 text-base">
                  <ChartBarIncreasingIcon className="size-4 stroke-chart-3" />
                  Collection Analytics
                </div>
              </AccordionTrigger>
              <AccordionContent>
                Visualize your spending habits, track collection growth over
                time, and discover patterns in your purchases. Get insights that
                help you make smarter collecting decisions.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-3">
              <AccordionTrigger>
                <div className="flex items-center gap-2 text-base">
                  <IdCard className="size-4 stroke-chart-6" />
                  Show off your collection in style
                </div>
              </AccordionTrigger>
              <AccordionContent>
                Create beautiful, shareable collection pages that showcase your
                figures with high-quality images and detailed information.
                Impress fellow collectors with your curated displays.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-4">
              <AccordionTrigger>
                <div className="flex items-center gap-2 text-base">
                  <DatabaseIcon className="size-4 stroke-chart-2" />
                  Sync with MyFigureCollection data
                </div>
              </AccordionTrigger>
              <AccordionContent>
                Automatically sync your MyFigureCollection items to keep your
                collection up-to-date. Import figure details, images, and
                specifications without manual data entry.
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <div className="bg-background relative flex overflow-hidden rounded-3xl border p-2">
            <div className="w-15 absolute inset-0 right-0 ml-auto border-l bg-[repeating-linear-gradient(-45deg,var(--color-border),var(--color-border)_1px,transparent_1px,transparent_8px)]"></div>
            <div className="aspect-76/59 bg-background relative w-[calc(3/4*100%+3rem)] rounded-2xl">
              <AnimatePresence mode="wait">
                <motion.div
                  key={`${activeItem}-id`}
                  initial={{ opacity: 0, y: 6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.98 }}
                  transition={{ duration: 0.2 }}
                  className="size-full overflow-hidden rounded-2xl border bg-zinc-900 shadow-md"
                >
                  <img
                    src={images[activeItem].image}
                    className="size-full object-cover object-left-top dark:mix-blend-lighten"
                    alt={images[activeItem].alt}
                    width={1207}
                    height={929}
                  />
                </motion.div>
              </AnimatePresence>
            </div>
            <BorderTrail
              className="bg-secondary"
              style={{
                boxShadow:
                  "0px 0px 60px 30px rgb(255 255 255 / 50%), 0 0 100px 60px rgb(0 0 0 / 50%), 0 0 140px 90px rgb(0 0 0 / 50%)",
              }}
              size={100}
            />
          </div>
        </div>
        <div className="relative z-10 space-y-6 text-center mx-auto pt-12">
          <div className="flex justify-end items-center gap-6">
            <h3 className=" text-xl font-semibold lg:text-4xl dark:text-white/90 text flex items-center gap-2">
              and more with <MyAkibaLogo size="full" className="inline-block h-[1.2em] ml-2" />.
            </h3>
            <Button
              size="lg"
              className="bg-white/95 hover:bg-white border-black/90 border p-6 rounded-xl shadow-lg"
            >
              <ArrowRightIcon className="size-4 p-0 m-0" />
              <Link to="/login">
                <span>Try it out</span>
              </Link>
            </Button>
          </div>
          
        </div>

      </div>
    </section>
  );
}
