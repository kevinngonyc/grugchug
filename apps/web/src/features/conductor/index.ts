// The conductor: upload study material, get a route of stations with an
// AI-set timer, and work through it station by station while the train
// stops and departs to match. Entered by clicking the conductor character
// riding the locomotive (see features/scene/train.tsx), not a corner button.
//
// ConductorOverlay is the whole visible panel. useConductorUi is the small
// piece features/scene reaches across the boundary for: the click handler
// opens it, the camera rig reads whether to zoom in.

export { ConductorOverlay } from "./conductor-overlay";
export { useConductorUi } from "./store";
export { useStudySession } from "./study-session";
