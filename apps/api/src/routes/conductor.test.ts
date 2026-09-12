import { describe, expect, test } from "bun:test";
import { routePlanSchema } from "@grugchug/shared";
import { fixtureRoutePlan } from "../conductor/fixtures";
import { answerStation, askConductor, createPlan, getPlan } from "./conductor";

const answerKeys = /correctIndex|rubric|referenceAnswer/;

function post(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function answer(stationId: string, body: unknown) {
  const req = post(`/api/conductor/stations/${stationId}/answer`, body);
  return answerStation(Object.assign(req, { params: { stationId } }));
}

function firstMcq() {
  const station = fixtureRoutePlan.stations[0];
  const question = station?.questions.find((q) => q.type === "mcq");
  if (!station || question?.type !== "mcq") throw new Error("fixture has no mcq");
  return { station, question };
}

describe("fixtureRoutePlan", () => {
  test("is a valid route plan of four stations, each three mcq and one short", () => {
    expect(routePlanSchema.safeParse(fixtureRoutePlan).success).toBe(true);
    expect(fixtureRoutePlan.stations).toHaveLength(4);
    for (const station of fixtureRoutePlan.stations) {
      expect(station.questions.filter((q) => q.type === "mcq")).toHaveLength(3);
      expect(station.questions.filter((q) => q.type === "short")).toHaveLength(1);
    }
    const minutes = fixtureRoutePlan.stations.reduce((sum, s) => sum + s.estimatedMinutes, 0);
    expect(fixtureRoutePlan.totalEstimatedMinutes).toBe(minutes);
  });
});

describe("createPlan", () => {
  test("rejects a body without material", async () => {
    const res = await createPlan(
      post("/api/conductor/plans", { userId: "u1", availableMinutes: 30 }),
    );
    expect(res.status).toBe(400);
  });

  test("rejects malformed JSON", async () => {
    const res = await createPlan(post("/api/conductor/plans", "{not json"));
    expect(res.status).toBe(400);
  });

  test("returns the route without answer keys", async () => {
    const res = await createPlan(
      post("/api/conductor/plans", {
        userId: "u1",
        availableMinutes: 45,
        material: { kind: "text", text: "Photosynthesis notes" },
      }),
    );
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toMatch(answerKeys);
    expect(JSON.parse(text).userId).toBe("u1");
  });
});

test("getPlan returns the route without answer keys", async () => {
  const res = getPlan();
  expect(res.status).toBe(200);
  expect(await res.text()).not.toMatch(answerKeys);
});

describe("answerStation", () => {
  test("passes a correct mcq answer", async () => {
    const { station, question } = firstMcq();
    const res = await answer(station.id, {
      planId: fixtureRoutePlan.id,
      questionId: question.id,
      answer: { type: "mcq", choiceIndex: question.correctIndex },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ questionId: question.id, score: 1, passed: true });
  });

  test("fails a wrong mcq answer", async () => {
    const { station, question } = firstMcq();
    const wrong = (question.correctIndex + 1) % question.choices.length;
    const res = await answer(station.id, {
      planId: fixtureRoutePlan.id,
      questionId: question.id,
      answer: { type: "mcq", choiceIndex: wrong },
    });
    expect(await res.json()).toMatchObject({ score: 0, passed: false });
  });

  test("rejects an answer whose type does not match the question", async () => {
    const { station, question } = firstMcq();
    const res = await answer(station.id, {
      planId: fixtureRoutePlan.id,
      questionId: question.id,
      answer: { type: "short", text: "hello" },
    });
    expect(res.status).toBe(400);
  });

  test("404s on an unknown station", async () => {
    const res = await answer("nope", {
      planId: fixtureRoutePlan.id,
      questionId: "x",
      answer: { type: "mcq", choiceIndex: 0 },
    });
    expect(res.status).toBe(404);
  });
});

test("askConductor answers a valid question", async () => {
  const res = await askConductor(
    post("/api/conductor/ask", {
      planId: fixtureRoutePlan.id,
      stationId: "st-2",
      question: "Why?",
    }),
  );
  expect(res.status).toBe(200);
  expect(typeof (await res.json()).answer).toBe("string");
});
