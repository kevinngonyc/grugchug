// Gives bun test a browser-like global scope so React components can render.
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();
