import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import dashboard from "/dashboard.webp";
import dashboardLight from "/dashboard-light.webp";
import heroImage from "/hero-section-bg.webp";
import { useTheme } from "@/components/theme-provider";

export default function HeroSection() {
  const { theme } = useTheme();

  return (
    <section className="py-20">
      <div className="relative z-10 mx-auto w-full max-w-7xl px-6 lg:px-0">
        <div className="relative mt-8">
          <div className="flex w-fit items-center justify-center gap-2">
            <div className="flex relative items-center bg-sidebar hover:bg-background transition-all duration-150 border border-foreground/10 gap-2 rounded-3xl p-1 px-2 text-xs shadow-xs">
              <span className="font-medium text-foreground">
                v0.1.0 early build out now
              </span>
            </div>
          </div>
          <h1 className="mt-4 max-w-xl text-balance text-black dark:text-white text-2xl font-medium">
            Built to provide a better collecting experience.
          </h1>

          <p className="text-muted-foreground mb-6 mt-2 text-balance text-lg max-w-2xl">
            the community-powered catalog from{" "}
            <span className="text-foreground">MyFigureCollection</span> and the{" "}
            <span className="text-foreground">flexibility of spreadsheets</span>
            , unified into one powerful{" "}
            <span className="dark:text-primary text-secondary">
              collection management tool
            </span>
            .
          </p>

          <div className="flex flex-row items-center gap-2 *:w-full sm:flex-row sm:*:w-auto">
            <Button asChild variant="mono" className="">
              <Link to="/login">
                <span className="text-nowrap">Get Started</span>
              </Link>
            </Button>
            <Button asChild variant="ghost">
              <Link to="/login">
                <span className="text-nowrap">Learn More</span>
              </Link>
            </Button>
          </div>
        </div>

        <div className="relative mt-12 overflow-hidden rounded-sm bg-black/10 md:mt-16">
          <img
            src={heroImage}
            alt=""
            className="absolute inset-0 size-full object-cover opacity-75"
          />

          <div className="bg-background rounded-lg relative m-4 overflow-hidden shadow-xl shadow-black/15 ring-1 ring-black/10 sm:m-8 md:m-12">
            <img
              src={theme === "light" ? dashboardLight : dashboard}
              alt="app screen"
              className="object-top-left size-full object-cover"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

const MistKitLogo = ({ className }: { className?: string }) => (
  <div
    aria-hidden
    className={cn(
      "border-background bg-linear-to-b rounded-(--radius) relative flex size-9 translate-y-0.5 items-center justify-center border from-yellow-300 to-orange-600 shadow-lg shadow-black/20 ring-1 ring-black/10",
      className
    )}
  >
    <BookOpen className="mask-b-from-25% size-6 fill-white stroke-white drop-shadow-sm" />
    <BookOpen className="absolute inset-0 m-auto size-6 fill-white stroke-white opacity-65 drop-shadow-sm" />
    <div className="z-1 h-4.5 absolute inset-2 m-auto w-px translate-y-px rounded-full bg-black/10"></div>
  </div>
);
