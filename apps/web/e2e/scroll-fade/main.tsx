import "./scroll-fade.css";
import { useState } from "react";
import ReactDOM from "react-dom/client";
import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { startScrollFadeFallback } from "@/lib/scroll-fade";

startScrollFadeFallback();

const LIST = "max-h-40 w-60 overflow-y-auto scroll-fade-b";
const COLUMNS = ["Count", "Score", "Shop", "Price", "Release", "Order Date", "Collection Date"];

function Bars({ count }: { readonly count: number }) {
  return Array.from({ length: count }, (_, index) => (
    <div key={index} data-bar className="h-8 bg-white" />
  ));
}

function Growing() {
  const [count, setCount] = useState(12);
  return (
    <div className="flex flex-col gap-2">
      <div data-testid="growing" className={LIST}>
        <Bars count={count} />
      </div>
      <button type="button" className="text-white" onClick={() => setCount(count + 4)}>
        More
      </button>
    </div>
  );
}

function Harness() {
  return (
    <div className="flex flex-wrap items-start gap-8 p-8">
      <div data-testid="short" className={LIST}>
        <Bars count={3} />
      </div>
      <div data-testid="long" className={LIST}>
        <Bars count={12} />
      </div>
      <Growing />
      <Command className="w-60">
        <CommandList data-testid="command">
          <CommandGroup>
            {COLUMNS.map((column) => (
              <CommandItem key={column} data-bar className="h-8 rounded-none bg-white!">
                {column}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </div>
  );
}

const app = document.querySelector("#app");
if (!app) throw new Error("The harness has no #app");
ReactDOM.createRoot(app).render(<Harness />);
