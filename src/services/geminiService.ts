import { GoogleGenerativeAI, Content } from "@google/generative-ai";

const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
if (!apiKey) {
  throw new Error('VITE_GEMINI_API_KEY environment variable is required');
}
const genAI = new GoogleGenerativeAI(apiKey);

const SYSTEM_LOGIC_KNOWLEDGE = `
SYSTEM ARCHITECTURE & LOGIC:
1. UBID Format (KA-XXXXXXXX-C): 
   - KA (Namespace): Globally unique Karnataka identifiers.
   - XXXXXXXX (Entropy): 8-char Base36 string (excluding O/I) providing 1.7 trillion possible IDs.
   - C (Reliability): A Mod-36 checksum character for manual input verification.
2. Fuzzy Matching Engine:
   - Uses Levenshtein Distance for strict string similarity.
   - Uses Soundex Phonetic Algorithm to catch spelling variations (e.g., 'Lakshmi' vs 'Laxmi').
   - Normalization removes special characters and expands common industrial abbreviations (Pvt, Ltd, Ind, Rd).
   - Weighted Scoring: Name (50%), Address (30%), PIN Code (20%).
3. Operational Status Inference:
   - Analysis window is 18 months.
   - 'Active': Diverse signals (Inspections, Payments) in the last 6 months.
   - 'Dormant': No activity in 6 months, but historic signals in 6-18 months.
   - 'Closed': Explicit disconnection/closure signal OR zero signals for 18 months.
4. Orphan Signal Resolution:
   - Logic identifies activity records without a parent UBID.
   - Reviewers can 'Merge' to an existing UBID if confidence is high, or 'Project' a new entity.
5. Entity Linkage: One UBID can link multiple source records across departments (Factories, Labour, KSPCB) to create a Triple-A single source of truth.
6. Privacy: PII is anonymized using regex before AI analysis.
`;

export const getGeneralChatResponse = async (message: string, history: Content[]) => {
  try {
    const model = genAI.getGenerativeModel({
      model: "models/gemini-3.1-flash-lite-preview",
      systemInstruction: `You are the UBID Intelligence Assistant. Provide ultra-fast, direct, and structured technical data. 
        ${SYSTEM_LOGIC_KNOWLEDGE}
        STRICT RULES:
        1. NO introductory or closing pleasantries.
        2. Use numbered lists ONLY. 
        3. One fact per line. 
        4. Max 5 lines per response.
        5. No bolding or markdown headers beyond lists.`,
    });

    const formattedHistory = (history || [])
    .filter(msg => msg.role === "user" || msg.role === "model");

    // Ensure first message is always 'user'
    if (formattedHistory.length > 0 && formattedHistory[0].role !== "user") {
      formattedHistory.shift();
    }

    const chat = model.startChat({
      history: formattedHistory,
    });

    const result = await chat.sendMessage(message);
    if (!result || !result.response || !result.response.text()) {
      throw new Error('Gemini API returned an empty response');
    }
    return result.response.text();
  } catch (error) {
    console.error('Error in Gemini API call:', error);
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Gemini API error: ${message}`);
  }
};

/**
 * Anonymizes PII (Name, Address, PAN, GSTIN) from UBID data for LLM analysis.
 */
const anonymizeData = (data: any): any => {
  const json = JSON.stringify(data);
  // Replace sensitive patterns with synthetic placeholders
  return JSON.parse(json.replace(/[A-Z]{5}[0-9]{4}[A-Z]{1}/g, 'PLACEHOLDER_PAN') // PAN
    .replace(/[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}/g, 'PLACEHOLDER_GSTIN') // GSTIN
    .replace(/plot|no\.|street|road|area|phase|stage|cross|park|layout/gi, (match) => match) // Keep structural address terms
    .replace(/[A-Z][a-z]+(?=\s[A-Z][a-z]+)/g, 'SyntheticEntity') // Replace capitalized names with Generic
  );
};

export const getHighThinkingAnalysis = async (input: any) => {
  const anonymized = anonymizeData(input);
  const prompt = `Perform a Deep Strategic Audit on the following industrial entity data.
  
  CONTEXT: We are correlating static registry records with a live stream of cross-departmental activity signals.
  
  TASK:
  1. Analyze the 'entity' registry details for inconsistencies (PAN/GSTIN/Status).
  2. Cross-reference with the 'recentActivity' timeline. Identify if the timeline supports or contradicts the current registry status.
  3. Identify 'Hidden Linkage' risks (e.g., similar addresses or overlapping signals).
  4. Predict future operational health based on signal frequency.
  
  IMPORTANT: Focus on temporal sequences and cross-silo patterns.
  
  Anonymized Data Stream: ${JSON.stringify(anonymized, null, 2)}`;

  const model = genAI.getGenerativeModel({
    model: "models/gemini-3.1-flash-lite-preview",
    systemInstruction: "You are a senior business intelligence analyst specializing in regulatory compliance and entity resolution. Provide deep, high-thinking analysis.",
  });

  const result = await model.generateContent(prompt);
  return result.response.text();
};

export const getMapsGroundingInfo = async (location: string) => {
  const prompt = `Provide a comprehensive industrial intelligence report for the ${location} area in Karnataka. 
  Focus on:
  1. Key industries and sectors present.
  2. Major industrial landmarks or clusters.
  3. Recent developments or infrastructure projects.
  4. Potential regulatory or environmental focus areas for this specific zone.
  
  Format the report with clear headings and structured sections. Use numbered lists for details.`;

  const model = genAI.getGenerativeModel({
    model: "models/gemini-3.1-flash-lite-preview",
    systemInstruction: "You are a specialized industrial intelligence analyst. Your reports are highly structured, data-driven, and professional. Use clear headings and numbered lists. DO NOT use asterisks (*) for formatting. Ensure each point starts on a new line."
  });

  const result = await model.generateContent(prompt);
  return result.response.text();
};

export const getHealerPatch = async (errorStack: string, componentContext: string) => {
  const prompt = `The UBID system has encountered a runtime error. 
  ERROR STACK: ${errorStack}
  COMPONENT CONTEXT: ${componentContext}
  
  Provide a "Healer Instruction" to help the operator understand why this happened and how to avoid it. 
  Suggest a defensive programming snippet to prevent this specific crash in the future. 
  Format: Clear explanation + Code Snippet. No asterisks.`;

  const model = genAI.getGenerativeModel({
    model: "models/gemini-3.1-flash-lite-preview",
    systemInstruction: "You are an Automated Error Resolution AI designed for the UBID system. You stabilize and fix bugs."
  });

  const result = await model.generateContent(prompt);
  return result.response.text();
};

export const analyzeDataAnomaly = async (data: any) => {
  const prompt = `The system has received a data record that doesn't fully match the standard UBID schema.
  RAW DATA: ${JSON.stringify(data, null, 2)}
  
  Analyze the fields:
  1. Identify compatible fields with the Registry (which field is Name? which is Address?).
  2. Map unknown fields to potential system benefits (e.g., a "power_consumption" field might predict operational status).
  3. Propose a "Compatibility Layer" to ingest this data.
  
  Format: Schema Mapping Table + Recommendation. No asterisks.`;

  const model = genAI.getGenerativeModel({
    model: "models/gemini-3.1-flash-lite-preview",
    systemInstruction: "You are a Data Resilience AI. You make the system compatible with any environment-specific data formats."
  });

  const result = await model.generateContent(prompt);
  return result.response.text();
};
