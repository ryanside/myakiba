import { Card } from "@/components/ui/card";

export default function Features() {
  return (
    <section>
      <div className="bg-background py-24">
        <div className="mx-auto w-full max-w-5xl px-6">
          <div>
            <h2 className="text-foreground text-4xl font-semibold">
              {" 📦 "}order management
            </h2>
            <p className="text-muted-foreground mb-12 mt-4 text-balance text-lg">
              Manage and track your orders from purchase to delivery.
            </p>
            <div className="bg-foreground/5 rounded-3xl p-6">
              <Card className="aspect-video overflow-hidden px-6">
                <Card className="h-full translate-y-6" />
              </Card>
            </div>
          </div>

          <div className="relative mt-16 grid gap-12  [--radius:1rem] md:grid-cols-2">
            <div className="flex flex-col h-full">
              <h3 className="text-foreground text-xl font-semibold">
                {" 📊 "}collection analytics
              </h3>
              <p className="text-muted-foreground my-4 text-lg">
                Get insights into your collection and how it's performing.
              </p>
              <Card className="aspect-video overflow-hidden px-6 mt-auto">
                <Card className="h-full translate-y-6" />
              </Card>
            </div>
            <div className="flex flex-col h-full">
              <h3 className="text-foreground text-xl font-semibold">
                {" ⭐ "}collection management
              </h3>
              <p className="text-muted-foreground my-4 text-lg">
                Manage and track your collection items.
              </p>
              <Card className="aspect-video overflow-hidden mt-auto">
                <Card className="translate-6 h-full" />
              </Card>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
