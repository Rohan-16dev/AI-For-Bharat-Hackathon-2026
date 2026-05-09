import { SourceRecord } from "../types";
import { PrivacyVault, generateAIContent } from "./geminiService";

/**
 * AI NORMALIZATION ENGINE
 * Uses LLM capabilities to clean messy, heterogeneous department data 
 * into a standardized format for the deterministic logic engine.
 * 
 * COMPLIANCE: Works strictly on synthetic/scrambled data.
 */

export const cleanBusinessData = async (rawRecord: Partial<SourceRecord>): Promise<Partial<SourceRecord>> => {
  try {
    const vault = new PrivacyVault();
    const syntheticRecord = vault.scrambleObject(rawRecord);
    
    const response = await generateAIContent({
      modelName: "gemini-3.1-flash-lite-preview",
      prompt: `You are the Karnataka Government Data Normalizer. 
      Clean the following messy business record into a standard format.
      The data is SCRAMBLED (PII replaced with SYNTHETIC_n tokens).
      
      TASK:
      - Standardize symbols (e.g. "Pvt Ltd" -> "Private Limited").
      - Correct common misspellings in structural address terms.
      
      RECORD: ${JSON.stringify(syntheticRecord)}`,
      systemInstruction: "You are the Karnataka Government Data Normalizer. Clean business records while respecting PII privacy via synthetic tokens."
    });

    const cleanedSynthetic = JSON.parse(response.text || '{}');
    const cleaned = vault.restore(cleanedSynthetic);

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
