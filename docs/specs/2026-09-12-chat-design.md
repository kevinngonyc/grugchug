# Chat — design

Date: 2026-09-12

## What this is

One room, and the people in it. Opening the app puts you in your own room;
opening someone's invite link moves you into theirs. There is no picker, no
room list and no code to type, so the whole surface is a name field, an invite
link, and the conversation — the first two pinned to the top because they are
the only two things you ever do to a room.

Everyone connected is drawn as a train in the lane beside yours, running at the
speed of their own study score. That is the point of the room: you can see who
is riding with you and how it is going for them.

## What this is deliberately not

- **No room management.** No naming, leaving, renaming or listing. You are in
  the room you last entered, and the link is what moves you.
- **No friends or contacts.** The room is the only relationship.
- **No stored presence.** Who is here is the set of open sockets and nothing
  else: no last-seen, no online/offline, no "typing…", no member table.
- **No world sync.** Presence carries a name and a score. Nobody's phase,
  station or position on the track crosses the wire.

## One room

A `chatMembers` row's `joinedAt` is when that membership last came in through
an invite link, and the room you are in is simply the most recent of those. So:

- First load: you have no membership, so one room is created with you in it.
- Following a link: your membership in that room is inserted or re-entered,
  which makes it the newest, which makes it your room.
- Following an old link again: the same, so it moves you back.

Rooms are never deleted, and the one you drifted away from is still there with
your old membership in it — unreachable unless someone sends you its link
again. That is the cost of not having a picker, and it is worth it.

The name has no gate in front of it. A first visit is given one (`Rider 4821`)
so the room, the socket and the train can exist before anyone has typed
anything, and the field at the top of the chat is the only thing that changes
it. Renaming updates the membership and the roster from that moment; messages
already sent keep the name they were sent under, because the name is
denormalized onto them.

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

### Presence

The hub keeps the open sockets per room, and that set *is* the roster. Nothing
is stored, so closing the tab removes you and a server restart empties every
room. Any change — arrival, departure, rename, a new focus score — broadcasts
the whole roster, not a diff: it is a handful of people, and a client that
reconnects mid-change should not have to reconcile anything. It goes out socket
by socket rather than through the topic, because `ws.publish` skips the sender
and the person who just arrived is exactly who needs it.

A rider is one open socket, not one person. Two tabs of a browser share a
stored `userId`, so keying the roster by it folds them into a single entry and
each tab sees a room containing only itself — no arrival, no train, nothing to
regroup for, which is exactly what local testing looks like. The server names
each socket on `ready`; the client finds itself in the roster by that name
rather than by stored identity, which any other tab can overwrite underneath
it.

### Focus, and the trains

Each rider's 0..1 study score rides along on the roster, so the browser can
draw everyone's train. The direction is strict — `features/session` pushes the
score into chat with `reportFocus()`, and chat carries it; chat never reads the
efficiency store itself. The client throttles to one frame every two seconds
and only when the score has actually moved, and the server lets focus frames
skip the message rate limiter since they never touch the database.

On screen, every lane scrolls with the local train, which is what keeps the
rails and scenery from sliding against each other. A friend's train integrates
its own speed on top of that, so the difference between two scores shows up as
a gap along the track — ahead if they are more locked in than you, behind if
they are not. Nothing caps that gap. Someone who studies harder than you for
ten minutes really is a long way up the line, so their train runs out of the
frame and keeps going; holding them at the edge would mean owing them the
distance back the moment they slowed down. Four friends get lanes; past that
the room is still in the chat but not on the track.

The gap is only telling you something while the two trains disagree about
speed. Once they agree it is just where they happened to end up, so it eases
shut: a friend who vanished during a bad stretch is back inside the frame
within a minute of matching your pace, arriving at a walk rather than a jump.

Anyone joining is a fresh start for the sitting: **the focus score drops to
zero for everyone in the room**, to be earned back. Nobody is a hundred metres
up the line on credit from before the newcomer arrived. Every client sees the
same arrival and does the same thing, so the whole party drops together, and
the trains slow to a crawl on their own because speed is only ever the score.

Zeroing has to hold the sources down rather than forget them. Forgetting every
signal leaves the score at *neutral*, not nothing, and attention opens at
whatever it sees next — so a reading a second later would put the score
straight back where it was. Held at zero, attention folds *up* from the floor
at its own half-life: about a minute of eyes on the screen to earn half of it
back. That is what makes it something to climb out of rather than a flicker.

Their trains are also lined up level again, so they do not arrive to find
everyone strung out over a kilometre and mostly off screen. That costs no
visible jump — a train far enough out for it to matter is off screen while it
happens, and one close enough to see moves a few metres.

A join is a fact about people, so it is a `userId` that was not in the previous
roster: a rename or a new score is not one. Everything else is — a stranger, a
friend who closed the tab an hour ago, a socket that dropped and came back.
From inside the room those are the same event, and the line regroups for all of
them. Each roster is compared with the one before it, the empty one a dropped
socket leaves included, which is what makes a reconnect count.

A train that has left the picture is replaced by an arrowhead at the edge of
it, pointing the way it went — forward and green for someone pulling away,
back and amber for someone dropping off. The marker is not a world position: it
measures the camera frustum every frame and sits just inside whichever edge it
finds, so resizing the window moves it rather than letting it slide out of
view. What counts as "off screen" comes out of the same measurement, so a
narrower window turns a visible train into an arrow without the train having
moved at all.

It says direction and nothing else. The distance is knowable — the gap is a
real number — but "they are somewhere off that way" is what a glance at a
study scene can use, and a live count of metres would be a number to watch
instead of the work.

### Delivery

The hub subscribes each socket to `chat:room:<roomId>`. On a send it persists
first, then publishes the stored message to the topic — the server's row is
what everyone renders, so ordering is the same on every screen. The sender is
not in that publish: they get a separate copy carrying their own `clientId`,
which lets the client swap out its optimistic bubble instead of showing the
message twice.

A per-connection token bucket (15 burst, 2/s sustained) covers everything that
writes to the database — messages and renames. Focus reports are not in it:
they are throttled by the client and cost one broadcast to a handful of
sockets.

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
  With the link as the only way in, that is also the only thing to guard.
- Display names are unverified. Two members can pick the same one.

Non-members get `404`, never `403`, so whether a room id exists is not probeable
by a stranger. That is the only thing the current model is actually good for.

When real auth lands it replaces this wholesale: `userId` becomes the account
id, the header becomes a session cookie, and the invite code becomes an
invitation addressed to an account. Nothing else in the design has to move.

## Deferred

- Editing and deleting messages; the merge already tolerates a message id being
  rewritten, but nothing produces that yet.
- Leaving a room, removing a member, rotating an invite code. "Leave" is
  currently "get a new room of your own", which nothing offers.
- Choosing your own sprite: it is derived from the `userId` so that you look
  the same on everyone's screen, and there is no way to pick.
- Attachments, reactions, unread counts, notifications.
- Scaling past one server process: topics are per-process, so a second instance
  would need Redis pub/sub or a change stream in front of the hub.
