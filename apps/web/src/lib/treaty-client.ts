import { treaty } from "@elysiajs/eden";
import type { App } from "@server/index";

export const app = treaty<App>("localhost:3000");

