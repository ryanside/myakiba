import { Card } from "@/components/ui/card";
import orders from "/orders.webp";
import analytics from "/analytics.webp";
import collection from "/collection.webp";

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
            <div className="bg-sidebar rounded-3xl p-6">
              <Card className="aspect-video overflow-hidden p-0">
                <img src={orders} alt="app screen" className="w-full h-full object-cover" />
              </Card>
            </div>
          </div>

          <div className="relative mt-16 grid gap-12  [--radius:1rem] md:grid-cols-2">
            <div className="flex flex-col h-full">
              <h3 className="text-foreground text-xl font-semibold">
                {" 📊 "}collection analytics
              </h3>
              <p className="text-muted-foreground my-4 text-lg">
                Get insights into your collection.
              </p>
              <Card className="aspect-video overflow-hidden p-0 px-6 bg-sidebar border-none">
                <img src={analytics} alt="app screen" className=" h-full object-cover translate-y-6 border-border border-1 rounded-lg rounded-b-none border-b-0" />
              </Card>
            </div>
            <div className="flex flex-col h-full">
              <h3 className="text-foreground text-xl font-semibold">
                {" ⭐ "}collection management
              </h3>
              <p className="text-muted-foreground my-4 text-lg">
                Manage and track your collection items.
              </p>
              <Card className="aspect-video overflow-hidden p-0 bg-sidebar border-none">
                <img src={collection} alt="app screen" className=" h-full object-cover translate-y-6 translate-x-6 rounded-lg border border-b-0 rounded-b-none" />
              </Card>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
