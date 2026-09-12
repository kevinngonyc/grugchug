// Who this browser is: the browser id from lib/user-id plus a user record on
// the API holding the display name and the avatar that rides this user's
// train. Owns the avatar catalog and the picker UI.

export { AvatarDialog } from "./avatar-dialog";
export { AvatarPicker } from "./avatar-picker";
export { useAvatarPickerUi } from "./avatar-picker-ui";
export { AVATARS, avatarUrl, DEFAULT_AVATAR, profileOwner } from "./avatars";
export { type ProfileState, useProfile } from "./store";
