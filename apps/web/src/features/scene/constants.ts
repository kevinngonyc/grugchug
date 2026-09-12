// One scene unit is one metre. Numbers marked "measured" come from the glb
// bounds in docs/plans/2026-09-11-train-world.md.

// Kit models travel along their local +z. The world scrolls along screen +x,
// so every kit model is wrapped in a group with this rotation. Flip the sign
// if the locomotive turns out to face backwards.
export const KIT_ROTATION_Y = Math.PI / 2;

// Parallel lanes keep the locomotives abreast.
export const LANE_SPACING = 4; // metres deeper into the screen per lane
export const LANE_STAGGER = 0; // no longitudinal offset between trains

// Track: railroad-straight.glb is 4 m long with its origin at one end and
// sits 1 m below its origin (measured), so lifting it by 1 puts rail top at 0.1.
export const TRACK_SEGMENT_LENGTH = 4;
export const TRACK_SEGMENTS = 14;
export const TRACK_Y = 1.0;

// Train: wheels touch y=0 in the model (measured); rail top is at 0.1.
export const TRAIN_Y = 0.1;
export const LOCOMOTIVE_HEIGHT = 1.66; // measured
export const CARRIAGE_GAP = 2.9; // half loco (1.30) + half carriage (1.35) + coupling
export const WHEEL_RADIUS = 0.3;

// Motion, metres per second squared
export const ACCEL = 1.5;
export const BRAKE_DECEL = 2;

// Stopping: a station appears this far ahead when a stop is requested.
// Braking distance from MAX_SPEED (8) at BRAKE_DECEL is 16 m, so 20 leaves a
// short cruise before the brakes bite.
export const STATION_DISTANCE = 20;

// Recycling: anything further than this behind the train jumps forward.
export const VISIBLE_HALF_WIDTH = 26;
export const RECYCLE_SPAN = 2 * VISIBLE_HALF_WIDTH;

// Scenery
export const SCENERY_SCALE = 1.5;
export const SCENERY_PER_LANE = 16;
// behind the train's 0.71 m half-width plus a 0.57 m canopy, so nothing clips the body
export const SCENERY_MIN_DEPTH = 1.4;
export const SCENERY_MAX_DEPTH = 2.5; // stays clear of the next lane's train at LANE_SPACING 4
// Scenery slots this close to a station's centre hide until they recycle.
export const STATION_CLEARANCE = 5.5;
// Station group z behind the track centre; the deck's front edge clears the train.
export const STATION_DEPTH = 1.5;

// Smoke
export const SMOKE_PUFFS = 14;
export const SMOKE_LIFE = 1.6; // seconds
export const CHIMNEY_OFFSET: [number, number, number] = [0.9, LOCOMOTIVE_HEIGHT, 0];

// Users ride in the carriage; conductors ride on the locomotive. Every sprite shares a
// square canvas and is mapped whole onto a square plane, so how much of the
// canvas a drawing fills is how big that character is in the world.
export const CARRIAGE_HEIGHT = 1.3; // measured top of the cart sides
export const CHARACTER_OFFSET: [number, number, number] = [-CARRIAGE_GAP, CARRIAGE_HEIGHT + 0.4, 0];
export const CONDUCTOR_OFFSET: [number, number, number] = [-0.6, LOCOMOTIVE_HEIGHT + 0.4, 0];
export const CONDUCTOR_SPRITE_URL = "/characters/conductor.png";
export const CHARACTER_SIZE: [number, number] = [1.6, 1.6];

// Camera
export const CAMERA_POSITION: [number, number, number] = [-1.4, 5, -12];
export const CAMERA_LOOK_AT: [number, number, number] = [-1.4, 1.2, 1];
export const CAMERA_FOV = 35;

// Sky and hills
export const SKY_COLOR = "#bfe3ff";
export const HILL_DEPTH = 28;
export const HILL_PARALLAX = 0.15;
