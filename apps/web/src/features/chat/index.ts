// Chat. One room, always: the app hands you yours on first load, and an invite
// link is the only way into someone else's. Live messages over a WebSocket,
// history from the API, and — because the socket is also what says you are
// here — the roster of who is in the room right now.
//
// ChatOverlay is the whole visible surface: a bubble in the corner of a study
// session that opens a panel over the scene. Identity is a display name plus a
// server-minted userId kept in localStorage.
//
// Threads cross this boundary, all driven from features/session and all
// one-way: `reportFocus` pushes the study score in, `reportJourney` pushes
// avatar and route progress in, and `useRoster` reads out who to draw a train
// for. Chat itself reads nothing from the rest of the app.

export type { ChatMessage, ChatPresenceMember, ChatRoom } from "@grugchug/shared";
export { joinRoom } from "./api";
export { ChatOverlay } from "./chat-overlay";
export { reportFocus } from "./focus-link";
export type { ChatIdentity } from "./identity";
export {
  clearIdentity,
  defaultDisplayName,
  identityFromMember,
  readIdentity,
  writeIdentity,
} from "./identity";
export { JoinRoomView } from "./join-view";
export type { JourneyStatus } from "./journey-link";
export { reportJourney } from "./journey-link";
export type { ChatLog } from "./message-log";
export { useRoster, useRosterSelfId } from "./roster";
