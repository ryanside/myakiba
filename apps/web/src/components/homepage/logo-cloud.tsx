import { InfiniteSlider } from "@/components/ui/infinite-slider";
import { ProgressiveBlur } from "@/components/ui/progressive-blur";

export default function LogoCloud({ images }: { readonly images: readonly string[] }) {
  return (
    <div className="overflow-hidden pt-18 pb-4">
      <div className="group relative flex flex-col items-center gap-4 md:flex-row">
        <div className="relative w-full min-w-0">
          <InfiniteSlider speedOnHover={40} speed={40} gap={96}>
            {images.map((image, idx) => (
              <div key={idx} className="relative size-20 shrink-0 overflow-hidden rounded-xl">
                <img
                  src={image}
                  alt=""
                  className="size-full object-cover object-top"
                  loading="lazy"
                  decoding="async"
                />
              </div>
            ))}
          </InfiniteSlider>

          <div className="bg-linear-to-r from-background absolute inset-y-0 left-0 w-20" />
          <div className="bg-linear-to-l from-background absolute inset-y-0 right-0 w-20" />
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
  );
}
