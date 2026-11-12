import { AddSentence } from "@/components/homepage/add-sentence";
import { FramedScreen } from "@/components/homepage/framed-screen";
import { Bezel, HomeSection, StartActions } from "@/components/homepage/kit";
import { SceneSpill } from "@/components/homepage/window-light";

export function Hero() {
  return (
    <HomeSection labelledBy="hero-title" className="overflow-hidden pt-16 md:pt-20 lg:pt-24">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-baseline-last lg:justify-between lg:gap-12">
        <div className="min-w-0 flex-1">
          <AddSentence className="animate-appear" />
          <div className="animate-appear mt-4 text-lg text-pretty text-muted-foreground [--appear-delay:60ms]">
            <h1 id="hero-title" className="inline text-foreground">
              A modern collection manager.
            </h1>{" "}
            <p className="inline">Collection, orders, analytics and expenses.</p>
          </div>
        </div>
        <StartActions className="animate-appear flex-wrap [--appear-delay:120ms]" />
      </div>

      <div className="animate-appear relative isolate mt-12 [--appear-delay:180ms] md:mt-16">
        <SceneSpill page="dashboard" hero />
        <div className="relative -mx-2 overflow-hidden rounded-[2.05rem] bg-[oklch(0.977_0_0)] p-2 max-sm:-mr-56 dark:bg-black">
          <Bezel className="dark:shadow-2xl dark:shadow-black/55">
            <FramedScreen name="dashboard" className="relative overflow-hidden rounded-xl" />
          </Bezel>
        </div>
      </div>
    </HomeSection>
  );
}
