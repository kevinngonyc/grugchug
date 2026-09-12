// Who this browser is: the browser id from lib/user-id plus a user record on
// the API holding the display name and the avatar that rides this user's
// train. Owns the avatar catalog and the picker UI.
export { AVATARS, avatarUrl, profileOwner } from "./avatars";
export { type ProfileState, useProfile } from "./store";
