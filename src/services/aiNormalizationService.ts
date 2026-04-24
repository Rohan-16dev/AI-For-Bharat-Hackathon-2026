import { GoogleGenAI } from "@google/genai";
import { SourceRecord } from "../types";
import { scrambleForAI, restoreFromAI } from "./geminiService";

/**
 * AI NORMALIZATION ENGINE
 * Uses LLM capabilities to clean messy, heterogeneous department data 
 * into a standardized format for the deterministic logic engine.
 * 
 * COMPLIANCE: Works strictly on synthetic/scrambled data.
 */

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export const cleanBusinessData = async (rawRecord: Partial<SourceRecord>): Promise<Partial<SourceRecord>> => {
  try {
    const syntheticRecord = scrambleForAI(rawRecord);
    
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite-preview",
      contents: `You are the Karnataka Government Data Normalizer. 
      Clean the following messy business record into a standard format.
      The data is SCRAMBLED (PII replaced with SYNTHETIC_n tokens).
      
      TASK:
      - Standardize symbols (e.g. "Pvt Ltd" -> "Private Limited").
      - Correct common misspellings in structural address terms.
      
      RECORD: ${JSON.stringify(syntheticRecord)}`,
      config: {
        responseMimeType: "application/json"
      }
    });

    const cleanedSynthetic = JSON.parse(response.text || '{}');
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
