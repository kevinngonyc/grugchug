// Gives bun test a browser-like global scope so React components can render.
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();

// bun test shares one DOM across every test file, so without this a component
// rendered in one test is still on the page during the next and queries match
// twice. Imported after registration because Testing Library wants a document.
const { afterEach } = await import("bun:test");
const { cleanup } = await import("@testing-library/react");

afterEach(cleanup);
