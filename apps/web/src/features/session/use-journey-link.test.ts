// syncJourney rather than the hook: the hook is just a subscribe/unsubscribe
// wrapper around it (see study-drive.test.ts and use-party-trains.test.ts for
// the same split elsewhere in this app). @/features/chat is mocked so no
// socket work happens; the mock is captured from the real module and restored
// in afterAll so a test file that runs after this one still gets the real
// reportJourney (mock.module patches the module registry for the whole
// process, not just this file).
import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

// Snapshot the exports before mocking: the module namespace has live bindings
// that Bun updates when mock.module replaces a re-export.
const realChat = { ...(await import("@/features/chat")) };
const reportJourney = mock<typeof realChat.reportJourney>();

mock.module("@/features/chat", () => ({ ...realChat, reportJourney }));

const { syncJourney } = await import("./use-journey-link");
const { useStudySession } = await import("@/features/conductor");
const { useProfile } = await import("@/features/profile");

afterAll(() => {
  mock.module("@/features/chat", () => realChat);
});

const plan = { stations: [{}, {}] } as never;

beforeEach(() => {
  useStudySession.setState({ mode: "idle", stationIndex: 0, plan: null });
  useProfile.setState({ user: null, status: "idle" });
});

afterEach(() => {
  reportJourney.mockClear();
});

describe("syncJourney", () => {
  test("reports the rider's avatar and where they are on their route", () => {
    useStudySession.setState({ mode: "counting", stationIndex: 0, plan });
    useProfile.setState({ user: { avatar: "doug" } as never });

    syncJourney();

    expect(reportJourney).toHaveBeenCalledWith({
      avatar: "doug",
      journey: { state: "studying", station: { index: 1, total: 2 } },
    });
  });

  test("falls back to the default avatar without a profile", () => {
    useStudySession.setState({ mode: "counting", stationIndex: 0, plan });

    syncJourney();

    expect(reportJourney).toHaveBeenCalledWith({
      avatar: "poku",
      journey: { state: "studying", station: { index: 1, total: 2 } },
    });
  });
});
