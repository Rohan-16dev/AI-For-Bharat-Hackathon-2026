import { SourceRecord } from "../types";
import { scrambleForAI, restoreFromAI } from "./geminiService";

/**
 * AI NORMALIZATION ENGINE
 * Uses LLM capabilities to clean messy, heterogeneous department data
 * into a standardized format for the deterministic logic engine.
 *
 * COMPLIANCE: Works strictly on synthetic/scrambled data.
 */

export const cleanBusinessData = async (rawRecord: Partial<SourceRecord>): Promise<Partial<SourceRecord>> => {
  try {
    const syntheticRecord = scrambleForAI(rawRecord);

    const response = await fetch("http://127.0.0.1:8000/clean", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ record: syntheticRecord })
    });

    if (!response.ok) {
      throw new Error('AI Normalization failed');
    }
    const data = await response.json();
    const cleanedSynthetic = data.cleaned;
    const cleaned = restoreFromAI(cleanedSynthetic);

    return {
      ...rawRecord,
      ...cleaned,
      isAiCleaned: true
    };
  } catch (error) {
    console.warn("AI Normalization failed, falling back to deterministic processing.", error);
    return rawRecord;
  }
};
