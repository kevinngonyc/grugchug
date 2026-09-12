# Chat — design

Date: 2026-09-12

## What this is

Text chat in rooms. You create a room, you get an invite code and a link, and
anyone you send it to can join by picking a display name. Messages are live for
everyone in the room and are kept, so history is there when you come back.

## What this is deliberately not

- **No presence.** No online/offline dots, no "typing…", no member list
  alongside the log. Who is in the room is not something the UI reports.
- **No friends or contacts.** The room is the only relationship.
- **No shared study data.** Chat never reads gaze, typing or session state, and
  nothing reads chat. The two halves of the app do not touch.

Each of those is a room-shaped extension if it is wanted later, but none is
needed for "invite someone and talk to them", so none is here.

## Shape

```
browser ──HTTP /api/chat/*────> Bun.serve routes ──> MongoDB
    └────WS /api/chat/ws──────> hub, one topic per room
```

History is HTTP; live delivery is a WebSocket. The two are independent on
purpose: the socket dropping degrades the room to "messages you already have",
and reconnecting re-pulls history, which merges idempotently rather than
duplicating.

### Collections

| Collection | `_id` | Notes |
|---|---|---|
| `chatRooms` | room id | unique index on `inviteCode` |
| `chatMembers` | `roomId:userId` | re-joining upserts and refreshes the display name |
| `chatMessages` | message id | index on `(roomId, createdAt, _id)` |

Paging walks back by `(createdAt, _id)` rather than by timestamp alone, so two
messages written in the same millisecond cannot straddle a page boundary and
lose one.

### Delivery

The hub subscribes each socket to `chat:room:<roomId>`. On a send it persists
first, then publishes the stored message to the topic — the server's row is
what everyone renders, so ordering is the same on every screen. The sender is
not in that publish: they get a separate copy carrying their own `clientId`,
which lets the client swap out its optimistic bubble instead of showing the
message twice.

A per-connection token bucket (15 burst, 2/s sustained) keeps one client from
flooding a room.

## Identity, and what it is not

The repo has no auth, and this feature does not add one. On first create or
join the server mints a 32-character random `userId`, hands it back, and the
browser keeps it in `localStorage` with the display name. It travels in the
`CHAT_USER_HEADER` header on HTTP and as a query parameter on the WebSocket
handshake, which cannot carry headers.

That string is unguessable, so in practice it behaves like a bearer token. It
is **not authentication**:

- Anyone who obtains the string is that user, and nothing rotates it.
- Clearing site data loses the identity, and with it every room, since there is
  no other way to prove who you were.
- An invite code is permanent and unrevocable: there is no way to remove a
  member or rotate a room's code, so a code that leaks means the room leaks.
- Display names are unverified. Two members can pick the same one.

Non-members get `404`, never `403`, so whether a room id exists is not probeable
by a stranger. That is the only thing the current model is actually good for.

When real auth lands it replaces this wholesale: `userId` becomes the account
id, the header becomes a session cookie, and the invite code becomes an
invitation addressed to an account. Nothing else in the design has to move.

## Deferred

- Editing and deleting messages; the merge already tolerates a message id being
  rewritten, but nothing produces that yet.
- Leaving a room, removing a member, rotating an invite code.
- Attachments, reactions, unread counts, notifications.
- Scaling past one server process: topics are per-process, so a second instance
  would need Redis pub/sub or a change stream in front of the hub.
