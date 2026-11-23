import { afterEach, jest } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();

declare global {
  interface Window {
    readonly happyDOM: {
      readonly setInnerWidth: (width: number) => void;
      readonly settings: {
        enableJavaScriptEvaluation: boolean;
        suppressInsecureJavaScriptEnvironmentWarning: boolean;
      };
    };
  }
}
// Testing Library advances fake timers only when it finds a global jest.
Object.assign(globalThis, { jest });

// One happy-dom window serves every test in a file, so a setting saved by one test would reach the next.
afterEach(() => {
  localStorage.clear();
});

// Bun prints a node in a failed expect by walking its properties, which reach the whole window and
// React's fiber tree, so one failed poll in `waitFor` took 40 s. Print a node as its markup instead.
Object.defineProperty(Node.prototype, Symbol.for("nodejs.util.inspect.custom"), {
  value(this: Node) {
    return this instanceof Element ? this.outerHTML : `${this.nodeName} ${this.textContent ?? ""}`;
  },
});

// Browsers mark a cancelled animation's `finished` promise as handled. happy-dom leaves it to
// reject unhandled, which fails any test that unmounts a running Motion animation.
const { cancel } = Animation.prototype;
Object.assign(Animation.prototype, {
  cancel(this: Animation) {
    void Promise.allSettled([this.finished]);
    cancel.call(this);
  },
});
