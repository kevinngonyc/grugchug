export const MODELS = {
  locomotive: "/models/train-locomotive-a.glb",
  carriage: "/models/train-carriage-box.glb",
  track: "/models/railroad-straight.glb",
  scenery: [
    "/models/tree_default.glb",
    "/models/tree_pineTallA.glb",
    "/models/tree_oak.glb",
    "/models/rock_smallA.glb",
    "/models/rock_largeA.glb",
    "/models/plant_bush.glb",
  ],
} as const;

export const ALL_MODEL_URLS: readonly string[] = [
  MODELS.locomotive,
  MODELS.carriage,
  MODELS.track,
  ...MODELS.scenery,
];
