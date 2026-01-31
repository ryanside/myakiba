import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface FeatureProps {
  imageOrientation: "left" | "right";
  backgroundImage: string;
  featureImage: string;
  title: string;
  description?: string;
  link?: string;
  linkText?: string;
}

export default function Feature({
  imageOrientation = "right",
  backgroundImage,
  featureImage,
  title,
  description,
  link,
  linkText,
}: FeatureProps) {
  return (
    <div className="flex flex-col py-10 md:py-20 mx-auto">
      <div className="md:h-[80vh] w-full px-6 xl:px-0">
        <div className="grid grid-cols-3 h-full w-full max-w-7xl border rounded-sm overflow-hidden p-4 bg-card space-y-4">
          {imageOrientation === "left" ? (
            <>
              <FeatureImage
                backgroundImage={backgroundImage}
                featureImage={featureImage}
                imageOrientation={imageOrientation}
              />
              <FeatureInfo
                title={title}
                description={description}
                link={link}
                linkText={linkText}
                imageOrientation={imageOrientation}
              />
            </>
          ) : (
            <>
              <FeatureInfo
                title={title}
                description={description}
                link={link}
                linkText={linkText}
                imageOrientation={imageOrientation}
              />
              <FeatureImage
                backgroundImage={backgroundImage}
                featureImage={featureImage}
                imageOrientation={imageOrientation}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function FeatureInfo({
  title,
  description,
  link,
  linkText,
  imageOrientation,
}: Omit<FeatureProps, "backgroundImage" | "featureImage">) {
  return (
    <div
      className={cn(
        "md:col-span-1 col-span-3 flex flex-col justify-center items-start gap-2 relative",
        imageOrientation === "right" ? "md:px-2" : "md:pl-6 md:pr-2",
      )}
    >
      <div className="flex flex-col">
        <h2 className="md:text-xl text-base tracking-tight font-medium text-black dark:text-white">
          {title}
        </h2>
        <p className="text-muted-foreground tracking-tight md:text-lg text-sm max-w-sm">
          {description}
        </p>
      </div>
      {link && (
        <Link
          to={link}
          className="my-2 text-nowrap text-sm dark:text-primary text-secondary hover:text-primary/80 transition-colors underline-offset-4 hover:underline flex items-center gap-2"
        >
          {linkText}
          <ArrowRight className="inline-block size-4" />
        </Link>
      )}
    </div>
  );
}

function FeatureImage({
  backgroundImage,
  featureImage,
}: Omit<FeatureProps, "title" | "description" | "link" | "linkText">) {
  return (
    <div className="md:col-span-2 col-span-3 flex flex-col justify-center items-center relative overflow-hidden rounded-sm">
      <img
        src={backgroundImage}
        alt="hero background image"
        className="absolute inset-0 size-full object-cover opacity-100"
        loading="lazy"
      />
      <div className="bg-transparent border-black/20 border-2 rounded-lg relative m-4 sm:m-8 md:m-12 overflow-hidden shadow-sm shadow-black/15 ring-1 ring-black/10 ">
        <img
          src={featureImage}
          alt="app screen"
          className="object-top-left size-full object-cover"
          loading="lazy"
        />
      </div>
    </div>
  );
}
