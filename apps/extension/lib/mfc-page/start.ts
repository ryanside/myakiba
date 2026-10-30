import { PickHostUnreachable } from "../errors/pick-host-unreachable";
import { mfcPageStateSchema } from "../messages";
import type { Origins } from "../origins";
import type { MfcPageRequest, MfcPageState } from "../pick-host";
import { capturePage } from "./capture";
import type { PageFetch } from "./capture";
import { itemOnPage, keepToggleInPlace } from "./item-page";
import type { ItemOnPage } from "./item-page";
import { createPickUi } from "./ui";
import type { PickRefusal, PickView } from "./ui";

export type MfcPickingDeps = {
  readonly window: Window & typeof globalThis;
  readonly runtime: {
    readonly sendMessage: (message: MfcPageRequest) => Promise<MfcPageState | undefined>;
  };
  readonly fetch: PageFetch;
  readonly origins: Origins;
};

/**
 * Shows the Pick toggle on an MFC Item page. Until a click it makes no request and sends only a field-less `mfc-hello`,
 * which is the extension's store-review line, so anything new that runs before a click needs that test changed too.
 */
export function startMfcPicking(deps: MfcPickingDeps): void {
  const item = itemOnPage(deps.window.document, deps.window.location);
  if (item !== null) pickOnPage(item, deps);
}

function pickOnPage(item: ItemOnPage, deps: MfcPickingDeps): void {
  const { window, runtime } = deps;
  const doc = window.document;

  let view: PickView = { picked: false, busy: false, count: 0, full: false, refusal: null };
  // A hello that was overtaken by a click must not paint over the click's answer.
  let latestAsk = 0;

  const ui = createPickUi(window, {
    webOrigin: deps.origins.web,
    onToggle: () => {
      void toggle();
    },
    onDismiss: () => update({ refusal: null }),
  });

  function update(change: Partial<PickView>) {
    view = { ...view, ...change };
    ui.render(view);
  }

  async function ask(message: MfcPageRequest): Promise<MfcPageState | null> {
    try {
      const answer = await runtime.sendMessage(message);
      return mfcPageStateSchema.safeParse(answer).data ?? null;
    } catch (error) {
      const unreachable = new PickHostUnreachable({ cause: error });
      console.warn(`${unreachable._tag}: ${unreachable.message}`);
      return null;
    }
  }

  async function hello() {
    if (view.busy) return;
    latestAsk += 1;
    const asked = latestAsk;
    const state = await ask({ type: "mfc-hello" });
    if (!state || asked !== latestAsk) return;
    update({ picked: state.picked, count: state.count, full: state.full });
  }

  const answered = (state: MfcPageState, refusal: PickRefusal | null): Partial<PickView> => ({
    picked: state.picked,
    count: state.count,
    full: state.full,
    refusal,
  });

  async function pick(): Promise<Partial<PickView>> {
    const captured = await capturePage(doc, item, deps);
    if (captured.isErr()) {
      console.warn(`${captured.error._tag}: ${captured.error.message}`);
      return { refusal: captured.error.reason };
    }
    const state = await ask({ type: "mfc-pick", capture: captured.value });
    return state ? answered(state, state.refused) : { refusal: "failed" };
  }

  async function unpick(): Promise<Partial<PickView>> {
    const state = await ask({ type: "mfc-unpick", mfcItemId: item.mfcItemId });
    if (!state) return { refusal: "failed" };
    return answered(state, state.picked ? "storage_failed" : null);
  }

  async function toggle() {
    if (view.busy) return;
    latestAsk += 1;
    update({ busy: true, refusal: null });
    try {
      update({ busy: false, ...(await (view.picked ? unpick() : pick())) });
    } catch (error) {
      console.error("could not change this page's pick", error);
      update({ busy: false, refusal: "failed" });
    }
  }

  keepToggleInPlace(window, ui.toggle);
  ui.render(view);
  doc.addEventListener("visibilitychange", () => {
    if (doc.visibilityState === "visible") void hello();
  });
  void hello();
}
