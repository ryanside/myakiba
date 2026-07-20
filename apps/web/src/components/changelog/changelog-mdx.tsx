import { useState } from "react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function ChangelogLink({ children, href, ...props }: ComponentProps<"a">) {
  const isExternal = href?.startsWith("http://") || href?.startsWith("https://");

  return (
    <a
      href={href}
      target={isExternal ? "_blank" : undefined}
      rel={isExternal ? "noopener noreferrer" : undefined}
      {...props}
    >
      {children}
    </a>
  );
}

export function ChangelogImage({ className, alt = "", ...props }: ComponentProps<"img">) {
  return (
    <img
      className={cn("changelog-image", className)}
      alt={alt}
      loading="lazy"
      decoding="async"
      {...props}
    />
  );
}

export function ChangelogCoverImage({
  className,
  alt = "",
  onLoad,
  ...props
}: ComponentProps<"img">) {
  const [isLoaded, setIsLoaded] = useState(false);

  return (
    <span className={cn("changelog-cover relative block overflow-hidden bg-background", className)}>
      <img
        className={cn(
          "size-full object-cover opacity-0 transition-opacity duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none",
          isLoaded && "opacity-100",
        )}
        alt={alt}
        loading="lazy"
        decoding="async"
        onLoad={(event) => {
          setIsLoaded(true);
          onLoad?.(event);
        }}
        {...props}
      />
    </span>
  );
}

export function ChangelogTable(props: ComponentProps<"table">) {
  return (
    <div className="typeset-scroll">
      <table {...props} />
    </div>
  );
}
