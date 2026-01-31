import { InfiniteSlider } from "@/components/ui/infinite-slider";
import { ProgressiveBlur } from "@/components/ui/progressive-blur";

export default function LogoCloud({ images }: { images: readonly string[] }) {
  return (
    <section className="bg-background overflow-hidden py-8 px-6 xl:px-0">
      <div className="group relative m-auto max-w-7xl">
        <div className="flex flex-col items-center md:flex-row">
          <div className="md:max-w-44 md:border-r md:pr-6">
            <p className="text-pretty text-sm">Uses your MyFigureCollection items</p>
          </div>
          <div className="relative py-6 md:w-[calc(100%-11rem)]">
            <InfiniteSlider speedOnHover={20} speed={40} gap={100}>
              {images.map((image, idx) => (
                <div
                  key={idx}
                  className="relative size-24 rounded-lg overflow-hidden border shrink-0"
                >
                  <img
                    src={image}
                    alt="MyFigureCollection Item Image"
                    className="w-full h-full object-top object-cover"
                    loading="lazy"
                  />
                </div>
              ))}
            </InfiniteSlider>

            <div className="bg-linear-to-r from-background absolute inset-y-0 left-0 w-20"></div>
            <div className="bg-linear-to-l from-background absolute inset-y-0 right-0 w-20"></div>
            <ProgressiveBlur
              className="pointer-events-none absolute left-0 top-0 h-full w-20"
              direction="left"
              blurIntensity={1}
            />
            <ProgressiveBlur
              className="pointer-events-none absolute right-0 top-0 h-full w-20"
              direction="right"
              blurIntensity={1}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
