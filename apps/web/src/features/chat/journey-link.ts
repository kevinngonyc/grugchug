// One-way pipe for where you are on your route: features/session pushes it in,
// the live socket carries it out to the room. Changes are rare, so there is no
// throttle, only de-duplication; a fresh socket is told the current status.
import type { AvatarId, Journey } from "@grugchug/shared";

export type JourneyStatus = { avatar: AvatarId; journey: Journey };

type JourneySink = (status: JourneyStatus) => void;

let sink: JourneySink | null = null;
let last: JourneyStatus | null = null;

/** The open socket registers itself here; null on disconnect. */
export function setJourneySink(next: JourneySink | null): void {
  sink = next;
  if (sink && last) sink(last);
}

export function reportJourney(status: JourneyStatus): void {
  if (last && JSON.stringify(last) === JSON.stringify(status)) return;
  last = status;
  sink?.(status);
}
