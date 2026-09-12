// The conductor's study panel, as it appears during a session. Unlike chat,
// there is no button of its own here: clicking the conductor character in
// the 3D scene (features/scene's train.tsx) is the only way in, so this
// component only renders the panel and reacts to the same open/closed state
// the scene's camera rig eases toward.
import { ConductorPanel } from "./conductor-panel";
import { useConductorUi } from "./store";

export function ConductorOverlay() {
  const open = useConductorUi((s) => s.open);
  const close = useConductorUi((s) => s.closePanel);

  return (
    <div
      aria-hidden={!open}
      className={
        `absolute inset-y-4 right-4 z-10 ${open ? "flex" : "hidden"} ` +
        "w-[min(34rem,calc(60%-2rem))] flex-col " +
        "overflow-hidden rounded-2xl border border-border/40 bg-background/55 shadow-xl backdrop-blur-md"
      }
    >
      <ConductorPanel onClose={close} />
    </div>
  );
}
