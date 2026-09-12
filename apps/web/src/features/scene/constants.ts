// One scene unit is one metre. Numbers marked "measured" come from the glb
// bounds in docs/plans/2026-09-11-train-world.md.

// Kit models travel along their local +z. The world scrolls along screen +x,
// so every kit model is wrapped in a group with this rotation. Flip the sign
// if the locomotive turns out to face backwards.
export const KIT_ROTATION_Y = Math.PI / 2;

// Lanes sit one behind another, further from the camera, with the trains abreast.
export const LANE_SPACING = 4; // metres deeper into the screen per lane

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

// Speech. The bubble's tail sits this far above the sprite's centre. drei
// scales the bubble by BUBBLE_DISTANCE_FACTOR / (2 * tan(fov/2) * distance);
// with the closer camera this keeps the bubble readable locally and a
// little smaller on farther lanes. Tune by eye in the dev panel.
export const BUBBLE_OFFSET: [number, number, number] = [0, CHARACTER_SIZE[1] / 2 + 0.15, 0];
// Sit just above the conductor's head (sprite top is CHARACTER_SIZE[1] / 2).
export const TIMER_LABEL_OFFSET: [number, number, number] = [0, CHARACTER_SIZE[1] / 2 + 0.12, 0];
export const BUBBLE_DISTANCE_FACTOR = 8;
// The conductor bobs while its train has speech.
export const BOB_AMPLITUDE = 0.1; // metres
export const BOB_FREQUENCY = 9; // radians per second, about 1.4 bobs a second
export const BOB_EASE = 6; // per second; how quickly the bob fades in and out
// Nobody stands perfectly still: every sprite keeps a slow, shallow bob when
// its train has nothing to say, as a fraction of the speaking amplitude.
export const IDLE_BOB_FRACTION = 0.3;
export const IDLE_BOB_FREQUENCY = 3.4; // radians per second, a quicker breath

// A clickable sprite grows slightly under the pointer — the whole hover hint.
export const HOVER_SCALE = 1.09;

// Voice level and distance falloff, in the same metres as the scene.
export const VOICE_GAIN = 0.35;
export const VOICE_REF_DISTANCE = 10;
export const VOICE_ROLLOFF = 1.2;
export const VOICE_RESUME_TIMEOUT_MS = 1000;

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

// Rendering resolution in device pixels per CSS pixel. Starts sharp; drei's
// PerformanceMonitor drops it to the floor when the frame rate sags (on a
// Retina laptop that is over half the pixels) and restores it on recovery.
export const DPR_MAX = 1.5;
export const DPR_MIN = 1;

// Camera: moved along the same viewing direction for a closer train view.
export const CAMERA_POSITION: [number, number, number] = [-1.4, 4.4, -10];
export const CAMERA_LOOK_AT: [number, number, number] = [-1.4, 1.2, 1];
export const CAMERA_FOV = 35;

// Conductor close-up: the camera eases here when the conductor panel opens,
// framing the conductor (near CONDUCTOR_OFFSET) large on the left of the
// frame so the study panel reads as filling the right. Tune by eye.
export const CONDUCTOR_CAMERA_POSITION: [number, number, number] = [-0.9, 2.5, -2.6];
export const CONDUCTOR_CAMERA_LOOK_AT: [number, number, number] = [-0.6, 2.0, 0];
export const CAMERA_EASE = 3.5; // per second, same idiom as BOB_EASE

// Sky and hills
export const SKY_COLOR = "#bfe3ff";
export const HILL_DEPTH = 28;
export const HILL_PARALLAX = 0.15;
