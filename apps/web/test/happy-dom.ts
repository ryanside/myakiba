import { jest } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();
// Testing Library advances fake timers only when it finds a global jest.
Object.assign(globalThis, { jest });

// Browsers mark a cancelled animation's `finished` promise as handled. happy-dom leaves it to
// reject unhandled, which fails any test that unmounts a running Motion animation.
const { cancel } = Animation.prototype;
Object.assign(Animation.prototype, {
  cancel(this: Animation) {
    void Promise.allSettled([this.finished]);
    cancel.call(this);
  },
});
