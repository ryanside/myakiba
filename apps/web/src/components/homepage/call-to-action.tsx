import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { ArrowRightIcon } from "lucide-react";

export default function CallToAction() {
  return (
    <section id="call-to-action">
      <div className="py-12 border-t border-b bg-sidebar">
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex md:flex-row flex-col gap-4 justify-between items-center">
            <h2 className="text-black dark:text-white tracking-tight text-balance text-center md:text-left text-3xl font-medium lg:text-4xl">
              Start collecting with myakiba.
            </h2>
            <div className="flex justify-start gap-3">
              <Button asChild size="lg" className="p-6 rounded-full">
                <Link to="/">
                  Get Started <ArrowRightIcon className="size-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
