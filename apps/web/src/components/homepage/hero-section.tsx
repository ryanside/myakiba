import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ArrowRightIcon } from "lucide-react";


export default function HeroSection({ heroImage, heroBackgroundImage }: { heroImage: string, heroBackgroundImage: string }) {

  return (
    <section className="py-20" id="hero">
      <div className="relative z-10 mx-auto w-full max-w-7xl px-6 xl:px-0">
        <div className="flex flex-col items-start justify-center relative mt-14">
          <div className="flex w-fit items-start justify-center gap-2">
            <div className="flex relative items-center bg-sidebar hover:bg-background transition-all duration-150 border border-foreground/10 gap-2 rounded-3xl p-1 px-2 text-xs shadow-xs">
              <span className="font-medium text-foreground">
                v0.1.0 early build out now
              </span>
            </div>
          </div>
          <h1 className="mt-4 max-w-xl text-balance text-black dark:text-white text-2xl font-medium">
            Built to provide a better collecting experience.
          </h1>

          <p className="text-muted-foreground mb-6 mt-2 text-start text-lg max-w-2xl">
            the community-powered catalog from{" "}
            <span className="text-foreground">MyFigureCollection</span> and the{" "}
            <span className="text-foreground">flexibility of spreadsheets</span>
            , unified into one powerful{" "}
            <span className="dark:text-primary text-secondary">
              collection management tool
            </span>
            .
          </p>

          <div className="flex flex-row items-center gap-2 sm:flex-row sm:*:w-auto">
            <Button asChild variant="mono" className="p-6 rounded-full">
              <Link to="/login">
                Get Started <ArrowRightIcon className="w-4 h-4" />
              </Link>
            </Button>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center relative mt-12 overflow-hidden rounded-sm bg-black/10 md:mt-16 aspect-video">
          <img
            src={heroBackgroundImage}
            alt="hero background image"
            className="absolute inset-0 size-full object-cover opacity-100"
            loading="eager"
            fetchPriority="high"
          />

          <div className="bg-background relative rounded-lg overflow-hidden shadow-xl shadow-black/15 lg:mx-32">
            <img
              src={heroImage}
              alt="app screen"
              className="object-top-left size-full object-cover"
              loading="eager"
              fetchPriority="high"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
