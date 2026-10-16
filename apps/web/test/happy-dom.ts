import { jest } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();
// Testing Library advances fake timers only when it finds a global jest.
Object.assign(globalThis, { jest });
