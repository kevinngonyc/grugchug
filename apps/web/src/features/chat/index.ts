// Chat. Rooms you create and invite people into by link or code, with live
// messages over a WebSocket and history from the API. Identity here is a
// display name plus a server-minted userId kept in localStorage; there is no
// friends list and no presence, and this feature owns no session metrics.

export type { ChatMessage, ChatRoom } from "@grugchug/shared";
export { ChatRoomView } from "./chat-room-view";
export { ChatRoomsView } from "./chat-rooms-view";
export type { ChatIdentity } from "./identity";
export { clearIdentity, readIdentity } from "./identity";
export { JoinRoomView } from "./join-room-view";
export type { ChatLog } from "./message-log";
