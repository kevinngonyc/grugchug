// Hard-coded route plan the conductor serves when no LLM result is available:
// the Phase 1 mock, and later the fallback when every provider fails.
import type { RoutePlan } from "@grugchug/shared";

export const fixtureRoutePlan: RoutePlan = {
  id: "fixture-plan",
  userId: "fixture-user",
  materialHash: "fixture-photosynthesis",
  totalEstimatedMinutes: 42,
  stations: [
    {
      id: "st-1",
      index: 0,
      title: "Light and pigments",
      scope:
        "Where photosynthesis happens (chloroplast, thylakoid, stroma), how chlorophyll a, b and accessory pigments absorb light, absorption spectra, and why leaves look green.",
      estimatedMinutes: 8,
      questions: [
        {
          id: "st-1-q1",
          type: "mcq",
          prompt: "Which wavelengths does chlorophyll absorb least?",
          choices: ["Red", "Blue", "Green", "Violet"],
          correctIndex: 2,
        },
        {
          id: "st-1-q2",
          type: "mcq",
          prompt: "Where are the pigments of the light reactions embedded?",
          choices: ["Stroma", "Thylakoid membrane", "Cell wall", "Cytoplasm"],
          correctIndex: 1,
        },
        {
          id: "st-1-q3",
          type: "mcq",
          prompt: "What is the main role of accessory pigments such as carotenoids?",
          choices: [
            "Store glucose for the night",
            "Widen the range of absorbed light and protect against excess light",
            "Fix carbon dioxide",
            "Break down ATP",
          ],
          correctIndex: 1,
        },
        {
          id: "st-1-q4",
          type: "mcq",
          prompt: "What structure encloses the thylakoids and stroma?",
          choices: ["Cell wall", "Chloroplast", "Mitochondrion", "Nucleus"],
          correctIndex: 1,
        },
        {
          id: "st-1-q5",
          type: "multi",
          prompt: "Select every pigment mentioned as absorbing light for photosynthesis.",
          choices: ["Chlorophyll a", "Chlorophyll b", "Carotenoids", "Melanin"],
          correctIndices: [0, 1, 2],
        },
        {
          id: "st-1-q6",
          type: "multi",
          prompt: "Select all statements that correctly describe chloroplasts.",
          choices: [
            "They contain the thylakoid membranes",
            "They contain the stroma",
            "They are found in every plant cell type without exception",
            "Light absorption happens inside them",
          ],
          correctIndices: [0, 1, 3],
        },
        {
          id: "st-1-q7",
          type: "short",
          prompt: "Explain why most leaves appear green.",
          rubric:
            "Full credit: chlorophyll strongly absorbs red and blue light and absorbs little green, so green is reflected or transmitted and reaches the eye. Partial credit: says chlorophyll reflects green without explaining absorption.",
          referenceAnswer:
            "Chlorophyll absorbs mostly red and blue wavelengths and very little green, so green light is reflected or transmitted, and that is what we see.",
        },
        {
          id: "st-1-q8",
          type: "short",
          prompt: "Why do plants have accessory pigments in addition to chlorophyll?",
          rubric:
            "Full credit: accessory pigments absorb wavelengths chlorophyll absorbs poorly, widening the range of usable light, and can help protect against excess light. Partial credit: only says they absorb other colors of light.",
          referenceAnswer:
            "Accessory pigments like carotenoids absorb wavelengths that chlorophyll does not absorb well, which widens the range of light the plant can use and also helps protect it from excess light.",
        },
      ],
    },
    {
      id: "st-2",
      index: 1,
      title: "Light-dependent reactions",
      scope:
        "Photosystems II and I, splitting of water and release of oxygen, the electron transport chain, the proton gradient and ATP synthase, and the production of ATP and NADPH in the thylakoid membrane.",
      estimatedMinutes: 12,
      questions: [
        {
          id: "st-2-q1",
          type: "mcq",
          prompt: "Where does the oxygen released by photosynthesis come from?",
          choices: ["Carbon dioxide", "Glucose", "Water", "Chlorophyll"],
          correctIndex: 2,
        },
        {
          id: "st-2-q2",
          type: "mcq",
          prompt: "What directly drives ATP synthase in the thylakoid membrane?",
          choices: [
            "A proton gradient across the membrane",
            "Sunlight striking the enzyme",
            "The breakdown of glucose",
            "Carbon dioxide concentration",
          ],
          correctIndex: 0,
        },
        {
          id: "st-2-q3",
          type: "mcq",
          prompt: "Which products of the light reactions are used by the Calvin cycle?",
          choices: [
            "ATP and NADPH",
            "Glucose and oxygen",
            "Carbon dioxide and water",
            "ADP and NADP+",
          ],
          correctIndex: 0,
        },
        {
          id: "st-2-q4",
          type: "short",
          prompt: "Describe what happens to water at photosystem II and why it matters.",
          rubric:
            "Full credit: water is split; its electrons replace those lost by excited chlorophyll in PSII, its protons add to the gradient that powers ATP synthase, and oxygen is released as a byproduct. Partial credit: only says water is split and oxygen is released.",
          referenceAnswer:
            "At photosystem II water is split into electrons, protons and oxygen. The electrons replace those that excited chlorophyll passed down the transport chain, the protons build the gradient that drives ATP synthase, and oxygen is released as a byproduct.",
        },
      ],
    },
    {
      id: "st-3",
      index: 2,
      title: "The Calvin cycle",
      scope:
        "Carbon fixation by RuBisCO, reduction to G3P using ATP and NADPH, regeneration of RuBP, and how many turns build one glucose. Takes place in the stroma.",
      estimatedMinutes: 12,
      questions: [
        {
          id: "st-3-q1",
          type: "mcq",
          prompt: "Which enzyme fixes carbon dioxide in the Calvin cycle?",
          choices: ["ATP synthase", "RuBisCO", "Amylase", "Helicase"],
          correctIndex: 1,
        },
        {
          id: "st-3-q2",
          type: "mcq",
          prompt: "Where in the chloroplast does the Calvin cycle run?",
          choices: ["Thylakoid lumen", "Stroma", "Outer membrane", "Nucleus"],
          correctIndex: 1,
        },
        {
          id: "st-3-q3",
          type: "mcq",
          prompt: "Which three-carbon sugar leaves the cycle to build glucose?",
          choices: ["Pyruvate", "G3P", "Sucrose", "Ribose"],
          correctIndex: 1,
        },
        {
          id: "st-3-q4",
          type: "short",
          prompt:
            "The Calvin cycle is called light-independent, yet it stops in the dark. Explain why.",
          rubric:
            "Full credit: it does not use light directly but consumes ATP and NADPH made by the light reactions, which stop in the dark. Partial credit: gives only one half of that.",
          referenceAnswer:
            "It does not use light directly, but it consumes the ATP and NADPH produced by the light-dependent reactions. In the dark those stop being made, so the cycle runs out of them and stops.",
        },
      ],
    },
    {
      id: "st-4",
      index: 3,
      title: "Limiting factors and adaptations",
      scope:
        "How light intensity, carbon dioxide concentration and temperature limit the rate of photosynthesis, photorespiration, and the C4 and CAM adaptations of plants in hot, dry climates.",
      estimatedMinutes: 10,
      questions: [
        {
          id: "st-4-q1",
          type: "mcq",
          prompt:
            "Raising light intensity no longer raises the rate. What is the most likely cause?",
          choices: [
            "Another factor, such as CO2 or temperature, is now limiting",
            "The chlorophyll has been destroyed",
            "The plant has stopped respiring",
            "Water has stopped being split",
          ],
          correctIndex: 0,
        },
        {
          id: "st-4-q2",
          type: "mcq",
          prompt: "Why does the rate fall at very high temperatures?",
          choices: [
            "Enzymes such as RuBisCO denature or work less well",
            "Light becomes weaker",
            "Carbon dioxide becomes toxic",
            "Chlorophyll turns red",
          ],
          correctIndex: 0,
        },
        {
          id: "st-4-q3",
          type: "mcq",
          prompt: "When do CAM plants open their stomata to take in carbon dioxide?",
          choices: ["Only at midday", "At night", "Never", "Only in winter"],
          correctIndex: 1,
        },
        {
          id: "st-4-q4",
          type: "short",
          prompt: "How do C4 plants reduce photorespiration?",
          rubric:
            "Full credit: CO2 is first fixed into a four-carbon acid in mesophyll cells by PEP carboxylase, carried to bundle-sheath cells and released there, keeping CO2 high around RuBisCO so it rarely binds oxygen. Partial credit: says CO2 is concentrated around RuBisCO without the mechanism.",
          referenceAnswer:
            "C4 plants first fix CO2 into a four-carbon acid in mesophyll cells using PEP carboxylase, which does not bind oxygen. The acid moves into bundle-sheath cells and releases CO2 there, keeping CO2 high around RuBisCO so it rarely binds oxygen.",
        },
      ],
    },
  ],
};
