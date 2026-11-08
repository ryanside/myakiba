import "@fontsource-variable/inter/opsz.css";
import "./sentence.css";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { MotionGlobalConfig } from "motion/react";
import { useState } from "react";
import ReactDOM from "react-dom/client";
import type { AddController } from "@/components/add/add-controller";
import { CommitButton } from "@/components/add/commit-button";
import { destinationOf, presetDestination } from "@/components/add/commit-input";
import type { CommitRow, DestinationForm } from "@/components/add/commit-input";
import { DestinationSentence } from "@/components/add/destination-sentence";
import { createQueryClient } from "@/data/client";
import { LISTS } from "./cases";
import type { SentenceCase } from "./cases";

// Measured layouts must not catch a glide or a crossfade halfway.
MotionGlobalConfig.skipAnimations = true;

const lists = { items: LISTS, totalCount: LISTS.length };
// The Lists picker reads the account's Lists, and nothing else here asks the server for anything.
Object.defineProperty(window, "fetch", {
  value: async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    return url.pathname.endsWith("/api/lists")
      ? Response.json(lists)
      : Response.json({ message: "Not in this harness" }, { status: 404 });
  },
});

const params = new URLSearchParams(location.search);
const sentenceCase: SentenceCase = {
  to: (params.get("to") ?? "unset") as SentenceCase["to"],
  rows: Number(params.get("rows")),
  selected: Number(params.get("selected")),
  lists: params.get("lists")?.split(",").filter(Boolean) ?? [],
  wishlist: params.get("wishlist") === "1",
};
document.documentElement.classList.add(params.get("theme") ?? "dark");

function formOf({ to, wishlist, lists: chosen }: SentenceCase): DestinationForm {
  const base = presetDestination();
  const picked = LISTS.filter((list) => chosen.includes(list.id));
  const form = { ...base, wishlist, lists: picked };
  switch (to) {
    case "unset":
      return form;
    case "collection":
      return { ...form, kind: "collection" };
    case "order-new":
      return { ...form, kind: "order" };
    case "order-existing":
      return {
        ...form,
        kind: "order",
        order: { kind: "existing", order: { id: "order0000001", title: "Spring preorders" } },
      };
    case "none":
      return { ...form, kind: "none" };
  }
}

function Sentence() {
  const [form, setForm] = useState(() => formOf(sentenceCase));
  const destination = destinationOf(form);
  const rows: CommitRow[] = Array.from({ length: sentenceCase.selected }, (_, index) => ({
    row: { itemId: `item${String(index).padStart(8, "0")}`, overrides: {}, selected: true },
    title: `Item ${index + 1}`,
  }));
  // The sentence reads only these from the page's controller.
  const controller: Pick<
    AddController,
    "resolvedForm" | "setForm" | "rowCount" | "selectedCount" | "sending"
  > = {
    resolvedForm: form,
    setForm,
    rowCount: sentenceCase.rows,
    selectedCount: sentenceCase.selected,
    sending: false,
  };
  return (
    <div id="frame" className="mx-auto w-full max-w-5xl px-4 py-24">
      <div className="@container/add">
        <div className="@container/sentence">
          <DestinationSentence
            controller={controller as AddController}
            disabled={sentenceCase.rows === 0}
          >
            <CommitButton
              rows={rows}
              count={sentenceCase.selected}
              destination={destination}
              emailVerified
              loading={false}
              onIssues={() => {}}
              onSending={() => {}}
              onFailed={() => {}}
              onCommitted={() => {}}
              onDone={() => {}}
            />
          </DestinationSentence>
        </div>
      </div>
    </div>
  );
}

const router = createRouter({
  routeTree: createRootRoute({ component: Sentence }),
  history: createMemoryHistory(),
});

const root = document.querySelector("#app");
if (!root) throw new Error("The harness has no #app");
ReactDOM.createRoot(root).render(
  <QueryClientProvider client={createQueryClient()}>
    <RouterProvider router={router} />
  </QueryClientProvider>,
);
