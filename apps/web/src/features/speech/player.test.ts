import { beforeEach, describe, expect, test } from "bun:test";
import type { TrainState } from "@grugchug/shared";
import { useWorld } from "@/features/world";
import { speechDuration } from "./duration";
import { type AudioLike, createSpeechPlayer } from "./player";

const local: TrainState = {
  id: "local",
  owner: { name: "You", spriteUrl: "/characters/poku.png" },
  phase: "running",
  efficiency: 0.5,
  lane: 0,
};

const friend: TrainState = { ...local, id: "friend", lane: 1 };

class FakeAudio implements AudioLike {
  url: string;
  paused = false;
  disposed = false;
  playCalls = 0;
  rejectPlay = false;
  private listeners: Record<"ended" | "error", (() => void)[]> = { ended: [], error: [] };

  constructor(url: string) {
    this.url = url;
  }
  play(): Promise<void> {
    this.playCalls++;
    return this.rejectPlay ? Promise.reject(new Error("autoplay blocked")) : Promise.resolve();
  }
  pause(): void {
    this.paused = true;
  }
  addEventListener(type: "ended" | "error", listener: () => void): void {
    this.listeners[type].push(listener);
  }
  dispose(): void {
    this.disposed = true;
  }
  fire(type: "ended" | "error"): void {
    for (const l of this.listeners[type]) l();
  }
}

type Scheduled = { id: number; fn: () => void; ms: number };

function fakeTimers() {
  let next = 1;
  const pending: Scheduled[] = [];
  return {
    pending,
    setTimeout: (fn: () => void, ms: number): unknown => {
      const id = next++;
      pending.push({ id, fn, ms });
      return id;
    },
    clearTimeout: (handle: unknown): void => {
      const i = pending.findIndex((p) => p.id === handle);
      if (i >= 0) pending.splice(i, 1);
    },
    runAll(): void {
      for (const p of pending.splice(0)) p.fn();
    },
  };
}

function setup(opts: { rejectPlay?: boolean } = {}) {
  const audios: FakeAudio[] = [];
  const timers = fakeTimers();
  const player = createSpeechPlayer({
    createAudio: (url) => {
      const audio = new FakeAudio(url);
      audio.rejectPlay = opts.rejectPlay ?? false;
      audios.push(audio);
      return audio;
    },
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
  });
  return { audios, timers, player };
}

// Lets a rejected play() settle its catch handler.
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

const speechOf = (id: string) => useWorld.getState().trains[id]?.speech;

beforeEach(() => {
  useWorld.setState({ trains: {}, localTrainId: null });
  useWorld.getState().addTrain(local);
  useWorld.getState().setLocalTrainId("local");
});

describe("createSpeechPlayer", () => {
  test("plays a clip and clears the speech when it ends", () => {
    const { audios, player } = setup();
    player.start();
    useWorld.getState().say("local", "All aboard!", "/voices/1.mp3");
    expect(audios).toHaveLength(1);
    expect(audios[0]?.url).toBe("/voices/1.mp3");
    expect(audios[0]?.playCalls).toBe(1);
    expect(speechOf("local")?.text).toBe("All aboard!");
    audios[0]?.fire("ended");
    expect(speechOf("local")).toBeUndefined();
  });

  test("a rejected play falls back to the text timer", async () => {
    const { timers, player } = setup({ rejectPlay: true });
    player.start();
    useWorld.getState().say("local", "Hi", "/voices/1.mp3");
    await flush();
    expect(timers.pending).toHaveLength(1);
    expect(timers.pending[0]?.ms).toBe(speechDuration("Hi"));
    expect(speechOf("local")?.text).toBe("Hi");
    timers.runAll();
    expect(speechOf("local")).toBeUndefined();
  });

  test("ended clears the fallback timer after a rejected play", async () => {
    const { audios, timers, player } = setup({ rejectPlay: true });
    player.start();
    useWorld.getState().say("local", "Hi", "/voices/1.mp3");
    await flush();
    expect(timers.pending).toHaveLength(1);
    audios[0]?.fire("ended");
    expect(speechOf("local")).toBeUndefined();
    expect(timers.pending).toHaveLength(0);
    player.stop();
  });

  test("unavailable audio falls back to text without losing the utterance", () => {
    const timers = fakeTimers();
    const player = createSpeechPlayer({
      createAudio: () => {
        throw new Error("Web Audio unavailable");
      },
      setTimeout: timers.setTimeout,
      clearTimeout: timers.clearTimeout,
    });
    player.start();
    useWorld.getState().say("local", "Hi", "/voices/1.mp3");
    expect(speechOf("local")?.text).toBe("Hi");
    expect(timers.pending).toHaveLength(1);
    timers.runAll();
    expect(speechOf("local")).toBeUndefined();
    player.stop();
  });

  test("a clip that errors falls back to the text timer once", async () => {
    const { audios, timers, player } = setup({ rejectPlay: true });
    player.start();
    useWorld.getState().say("local", "Hi", "/voices/broken.mp3");
    audios[0]?.fire("error");
    await flush();
    expect(timers.pending).toHaveLength(1);
  });

  test("a line without a clip clears after speechDuration", () => {
    const { audios, timers, player } = setup();
    player.start();
    useWorld.getState().say("local", "Hi");
    expect(audios).toHaveLength(0);
    expect(timers.pending[0]?.ms).toBe(speechDuration("Hi"));
    timers.runAll();
    expect(speechOf("local")).toBeUndefined();
  });

  test("a second say on the same train stops the first clip", () => {
    const { audios, player } = setup();
    player.start();
    useWorld.getState().say("local", "one", "/voices/1.mp3");
    useWorld.getState().say("local", "two", "/voices/2.mp3");
    expect(audios[0]?.paused).toBe(true);
    expect(audios[0]?.disposed).toBe(true);
    audios[0]?.fire("ended");
    expect(speechOf("local")?.text).toBe("two");
    audios[1]?.fire("ended");
    expect(speechOf("local")).toBeUndefined();
  });

  test("plays clips only for the local train; a friend's line is timed like text", () => {
    const { audios, timers, player } = setup();
    useWorld.getState().addTrain(friend);
    useWorld.getState().setLocalTrainId("local");
    player.start();
    useWorld.getState().say("friend", "Hello there", "/voices/f.mp3");
    expect(audios).toHaveLength(0);
    expect(timers.pending).toHaveLength(1);
    expect(timers.pending[0]?.ms).toBe(speechDuration("Hello there"));
    timers.runAll();
    expect(speechOf("friend")).toBeUndefined();
  });

  test("does not replay an utterance it has already seen", () => {
    const { audios, timers, player } = setup();
    useWorld.getState().setLocalTrainId("local");
    player.start();
    useWorld.getState().say("local", "Hello there", "/voices/1.mp3");
    const speech = speechOf("local");
    audios[0]?.fire("ended");
    expect(speechOf("local")).toBeUndefined();
    // A snapshot re-delivers a friend's train carrying the same line.
    useWorld.getState().applySnapshot({ trains: { friend: { ...friend, speech } } });
    expect(speechOf("friend")?.id).toBe(speech?.id);
    expect(audios).toHaveLength(1);
    expect(timers.pending).toHaveLength(0);
  });

  test("a train removed mid-line stops its clip", () => {
    const { audios, player } = setup();
    player.start();
    useWorld.getState().say("local", "one", "/voices/1.mp3");
    useWorld.getState().removeTrain("local");
    expect(audios[0]?.paused).toBe(true);
    expect(audios[0]?.disposed).toBe(true);
  });

  test("stop pauses clips, clears their speech, and stops listening", () => {
    const { audios, player } = setup();
    player.start();
    useWorld.getState().say("local", "one", "/voices/1.mp3");
    player.stop();
    expect(audios[0]?.paused).toBe(true);
    expect(audios[0]?.disposed).toBe(true);
    expect(speechOf("local")).toBeUndefined();
    useWorld.getState().say("local", "two", "/voices/2.mp3");
    expect(audios).toHaveLength(1);
  });

  test("start picks up speech that is already in the store", () => {
    const { audios, player } = setup();
    useWorld.getState().say("local", "one", "/voices/1.mp3");
    player.start();
    expect(audios).toHaveLength(1);
  });
});
