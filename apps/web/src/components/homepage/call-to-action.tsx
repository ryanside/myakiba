import { WaitlistForm } from "./waitlist-form";

export default function CallToAction() {
  return (
    <section id="call-to-action">
      <div className="py-12 border-t border-b bg-sidebar">
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex flex-col gap-6 items-center text-center">
            <h2 className="text-black dark:text-white tracking-tight text-balance text-3xl font-medium lg:text-4xl">
              Join the waitlist.
            </h2>
            <p className="text-muted-foreground text-lg max-w-xl">
              Be the first to know when myakiba launches.
            </p>
            <WaitlistForm />
          </div>
        </div>
      </div>
    </section>
  );
}
