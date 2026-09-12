// One scene unit is one metre. Numbers marked "measured" come from the glb
// bounds in docs/plans/2026-09-11-train-world.md.

// Kit models travel along their local +z. The world scrolls along screen +x,
// so every kit model is wrapped in a group with this rotation. Flip the sign
// if the locomotive turns out to face backwards.
export const KIT_ROTATION_Y = Math.PI / 2;

// Parallel lanes keep the locomotives abreast.
export const LANE_SPACING = 4; // metres deeper into the screen per lane
export const LANE_STAGGER = 0; // no longitudinal offset between trains

// Nothing caps how far ahead or behind a friend's train may get: everyone
// shares one scrolling world, so a difference in focus is a gap along the
// track, and a big enough difference means they are simply gone. DriftMarker
// is what stands in for a train that has left the picture.
//
// A gap only says something while the two trains are running at different
// speeds. Once they agree it is just where they happened to end up, so it
// eases away and a friend who went missing during a bad stretch comes back
// into frame during the next lull.
// The rate is what you see: at the frame edge it works out around 3.6 m/s,
// so a train comes back into shot at a walk and settles rather than snapping.
// The cap only governs the part nobody watches — it takes over beyond
// 62 m (MAX_SPEED / RATE), which is far outside the frame, so a friend who
// went missing for minutes is back at the edge in under a minute instead of
// never. Both are fictions in service of the scene staying useful; the gap
// they undo was real.
export const DRIFT_CLOSE_TOLERANCE = 1.5; // m/s apart before the easing stops
export const DRIFT_CLOSE_RATE = 0.4; // per second: the proportional part
export const DRIFT_CLOSE_MAX_SPEED = 25; // m/s, off-screen only

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
// Braking distance from MAX_SPEED (12) at BRAKE_DECEL is v²/2a = 36 m, so 40
// leaves a short cruise before the brakes bite. Keep this above that figure
// whenever MAX_SPEED changes, or a stop from full speed snaps rather than eases.
export const STATION_DISTANCE = 40;

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

// Drift marker: an arrowhead that rides the edge of the picture once a
// friend's train has left it. Height clears the conductor sprite, which tops
// out around LOCOMOTIVE_HEIGHT + 1.2.
export const DRIFT_MARKER_OFFSET: [number, number, number] = [0, LOCOMOTIVE_HEIGHT + 1.9, 0];
export const DRIFT_MARKER_RADIUS = 0.4;
export const DRIFT_MARKER_HEIGHT = 0.85;
export const DRIFT_MARKER_BOB = 0.18; // metres from centre to peak
export const DRIFT_MARKER_BOB_SPEED = 2.4; // radians per second
// How far inside the frame edge the marker sits, in metres at its own depth.
// Wide enough for the arrowhead itself plus a little air.
export const DRIFT_MARKER_EDGE_MARGIN = 0.9;
export const DRIFT_AHEAD_COLOR = "#15803d"; // pulling away up front
export const DRIFT_BEHIND_COLOR = "#b45309"; // dropping off the back

// Camera
export const CAMERA_POSITION: [number, number, number] = [-1.4, 5, -12];
export const CAMERA_LOOK_AT: [number, number, number] = [-1.4, 1.2, 1];
export const CAMERA_FOV = 35;

// Sky and hills
export const SKY_COLOR = "#bfe3ff";
export const HILL_DEPTH = 28;
export const HILL_PARALLAX = 0.15;
