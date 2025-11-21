import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Sparkle } from "lucide-react";
import dashboard from "/dashboard.webp";
import Aurora from "./aurora";
import { Card } from "../ui/card";
import { useTheme } from "@/components/theme-provider";
import { BorderTrail } from "../ui/border-trail";

export default function HeroSection() {
  const { theme } = useTheme();
  return (
    <main>
      <section className="bg-background before:bg-sidebar before:border before:border-border border-e-foreground relative overflow-hidden before:absolute before:inset-1 before:h-[calc(100%-8rem)] before:rounded-2xl sm:before:inset-2 md:before:rounded-[2rem] lg:before:h-[calc(100%-14rem)]">
        {theme === "dark" && (
          <div className="absolute inset-1 h-[calc(100%-8rem)] rounded-2xl sm:inset-2 md:rounded-[2rem] lg:h-[calc(100%)] z-0 overflow-hidden">
            <Aurora
              colorStops={["#7353e7", "#a2d843", "#000000"]}
              amplitude={0.8}
              blend={0.5}
            />
          </div>
        )}

        <div className="py-20 md:py-36 relative z-10">
          <div className="relative z-10 mx-auto max-w-5xl px-6 text-center">
            <div>
              <Link
                to="/login"
                className="mx-auto flex w-fit items-center justify-center gap-2 rounded-3xl"
              >
                <div className="flex relative items-center bg-black/15 hover:bg-black/30 transition-all duration-150 border border-black/10 inset-shadow-xs gap-2 rounded-3xl p-2 px-3 text-sm shadow-lg">
                  <BorderTrail
                    className="bg-foreground"
                    style={{
                      boxShadow:
                        "0px 0px 60px 30px rgb(255 255 255 / 50%), 0 0 100px 60px rgb(0 0 0 / 50%), 0 0 140px 90px rgb(0 0 0 / 50%)",
                    }}
                    size={35}
                  />
                  <div
                    aria-hidden
                    className="border-background bg-linear-to-br dark:inset-shadow-2xs to-foreground from-chart-1 relative flex size-5 items-center justify-center rounded border shadow-md shadow-black/20 ring-1 ring-black/10"
                  >
                    <Sparkle className="size-3 fill-white stroke-white drop-shadow" />
                  </div>
                  <span className="font-medium text-foreground">
                    early, early build out now
                  </span>
                </div>
              </Link>
              <h1 className="mx-auto mt-8 max-w-3xl text-balance text-shadow-sm dark:text-white/90 text-4xl font-semibold tracking-tight sm:text-5xl">
                An all-in-one platform for anime figure collectors.{" "}
              </h1>
              <p className="text-foreground mx-auto my-6 max-w-xl text-balance text-xl">
                Order tracking, analytics, and collection management using
                MyFigureCollection items.
              </p>

              <div className="flex items-center justify-center gap-3">
                <div className="relative overflow-hidden rounded-xl">
                  <Button
                    asChild
                    size="lg"
                    className="dark:bg-white bg-black text-background p-6 rounded-xl border"
                  >
                    <Link to="/login">
                      <span className="text-nowrap">Get Started</span>
                    </Link>
                  </Button>
                </div>

                <Button
                  size="lg"
                  variant="dim"
                  onClick={() => {
                    window.scrollTo({
                      top: document.documentElement.scrollHeight,
                      behavior: "smooth",
                    });
                  }}
                >
                  <span className="text-nowrap text-foreground hover:text-white transition-colors duration-150">
                    Learn More
                  </span>
                </Button>
              </div>
            </div>
          </div>
          <div className="relative z-10 mx-auto max-w-5xl px-6">
            <div className="mt-14">
              <div className="bg-black/10 rounded-3xl p-4 shadow-lg inset-shadow-xs">
                <Card className="overflow-hidden p-0 border-black/10 shadow-lg">
                  <img
                    src={dashboard}
                    alt="app screen"
                    className="w-full h-full object-cover"
                  />
                </Card>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
