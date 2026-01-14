import { TextLoop } from "./text-loop";
import { WaitlistForm } from "./waitlist-form";

export default function HeroSection({
  heroImage,
  heroBackgroundImage,
}: {
  heroImage: string;
  heroBackgroundImage: string;
}) {
  return (
    <section className="py-20" id="hero">
      <div className="relative z-10 mx-auto w-full max-w-7xl px-6 xl:px-0">
        <div className="flex flex-col items-start justify-center relative w-full max-w-3xl my-18">
          <div className="flex relative text-sm items-start bg-background">
            <TextLoop
              preText="An alternative to"
              texts={["MyFigureCollection's Manager", "DIY Spreadsheets"]}
            />
          </div>
          <h1 className="mt-4 max-w-xl tracking-tight text-balance text-black dark:text-white text-2xl font-medium">
            Built to provide a modern collecting experience.
          </h1>

          <p className="text-muted-foreground tracking-tight text-balance mb-6 mt-2 text-start text-lg max-w-2xl">
            The community-powered catalog from{" "}
            <span className="text-foreground">MyFigureCollection</span> and the{" "}
            <span className="text-foreground">flexibility of spreadsheets</span>
            , unified into{" "}
            <span className="dark:text-primary text-secondary">
              a modern collection manager
            </span>
            .
          </p>

          <div className="flex flex-col gap-3">
            <WaitlistForm />
            <div className="px-2 text-start text-xs text-muted-foreground italic">
              <p>*in early development</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center relative overflow-hidden rounded-sm bg-black/10 aspect-video">
          <img
            src={heroBackgroundImage}
            alt="hero background image"
            className="absolute inset-0 size-full object-cover opacity-100"
            loading="eager"
            fetchPriority="high"
          />

          <div className="bg-transparent relative border-black/20 border-2 rounded-md shadow-sm overflow-hidden shadow-black/15 mx-8 md:mx-16 lg:mx-32">
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
