// `bun run check:llm` (from apps/api): sends one tiny request per tier through
// the same provider factory the conductor uses, and says plainly whether real
// calls work. A wrong or missing .env value shows up here as an error message
// instead of as sample content in the app. Uses the same env files as dev.
import { describeLlmConfig, getProvider, type Tier } from "../src/conductor/provider";

console.log(describeLlmConfig());

let failed = false;
for (const tier of ["flash", "pro"] as const satisfies readonly Tier[]) {
  const started = performance.now();
  try {
    const provider = getProvider(tier);
    const result = await provider.generate(
      [{ kind: "text", text: 'Reply with this JSON and nothing else: {"ok": true}' }],
      { system: "You are a connectivity check. Respond with JSON only.", temperature: 0 },
    );
    const ms = Math.round(performance.now() - started);
    console.log(
      `${tier}: ok · ${result.provider}/${result.model} · ${ms}ms · ${result.text.trim()}`,
    );
  } catch (error) {
    failed = true;
    console.log(`${tier}: FAILED · ${error instanceof Error ? error.message : String(error)}`);
  }
}

process.exit(failed ? 1 : 0);
