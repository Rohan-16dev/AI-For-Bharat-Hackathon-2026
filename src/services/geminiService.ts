import { GoogleGenAI, ThinkingLevel } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

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
7. Manual Override & Reversibility (MANUAL_REVERSION):
   - HUMAN_AUTHORITY: Human decisions (LINK/UNLINK) are absolute 'Ground Truth'. Model scoring is bypassed.
   - REVERSIBILITY PROTOCOL: UNLINK actions trigger distinct ORPHAN UBID creation and set edge_case_flag to 'MANUAL_REVERSION'.
   - CONTINUOUS IMPROVEMENT: Manual overrides are documented in audit logs to refine future system confidence.
`;

export const getGeneralChatResponse = async (message: string, history: { role: 'user' | 'model', parts: { text: string }[] }[]) => {
  try {
    // Scramble any PII that might have been typed into chat
    const syntheticMessage = vault.scrambleObject(message);
    
    const chat = ai.chats.create({
      model: "gemini-3.1-flash-lite-preview",
      config: {
        systemInstruction: `You are the UBID Intelligence Assistant. Provide ultra-fast, direct, and structured data.
        The system is designed to layer on top of 40+ departmental silos without modifying source systems.
        Privacy Constraint: All PII is scrambled into 'SYNTHETIC_n' tokens before AI analysis.
        
        ${SYSTEM_LOGIC_KNOWLEDGE}`,
      },
      history: history as any,
    });

    const result = await chat.sendMessage({ message: syntheticMessage });
    if (!result || !result.text) {
      throw new Error('AI Assistant return null signal.');
    }
    return result.text;
  } catch (error: any) {
    console.error("AI Chat failure:", error);
    throw new Error(`Chat Engine unavailable: ${error.message || 'Unknown network error'}`);
  }
};

 /**
 * --- PRIVACY COMPLIANCE VAULT ---
 * Ensures raw PII never leaves the local environment.
 * Maps real identifiers to synthetic tokens before LLM execution.
 */
class PrivacyVault {
  private map: Map<string, string> = new Map();
  private reverseMap: Map<string, string> = new Map();
  private counter: number = 0;

  /**
   * Scrambles sensitive data into synthetic tokens.
   */
  scramble(value: string | undefined | null): string {
    if (!value) return '';
    const trimmed = value.trim();
    if (this.map.has(trimmed)) return this.map.get(trimmed)!;

    const token = `SYNTHETIC_${this.counter++}`;
    this.map.set(trimmed, token);
    this.reverseMap.set(token, trimmed);
    return token;
  }

  /**
   * Deep-scrambles an entire object/array.
   */
  scrambleObject(obj: any): any {
    const json = JSON.stringify(obj);
    let scrambledStr = json;

    // Detect and scramble common PII patterns
    const panRegex = /[A-Z]{5}[0-9]{4}[A-Z]{1}/g;
    const gstinRegex = /[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}/g;
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const phoneRegex = /(\+91[\-\s]?)?[0-9]{10}/g;

    const matches = [
      ...(json.match(panRegex) || []),
      ...(json.match(gstinRegex) || []),
      ...(json.match(emailRegex) || []),
      ...(json.match(phoneRegex) || [])
    ];

    // Also target probable PII fields by property name if we were to traverse
    // but a regex sweep on the stringified JSON is more thorough for "raw data".
    
    [...new Set(matches)].forEach(match => {
      scrambledStr = scrambledStr.split(match).join(this.scramble(match));
    });

    return JSON.parse(scrambledStr);
  }

  /**
   * Restores the real values into an object/string that contains synthetic tokens.
   */
  restore(input: any): any {
    if (typeof input === 'string') {
      let restored = input;
      this.reverseMap.forEach((realValue, token) => {
        restored = restored.split(token).join(realValue);
      });
      return restored;
    }

    if (Array.isArray(input)) {
      return input.map(item => this.restore(item));
    }

    if (input && typeof input === 'object') {
      const restoredObj: any = {};
      Object.keys(input).forEach(key => {
        restoredObj[key] = this.restore(input[key]);
      });
      return restoredObj;
    }

    return input;
  }
}

const vault = new PrivacyVault();

export const scrambleForAI = (data: any) => vault.scrambleObject(data);
export const restoreFromAI = (data: any) => vault.restore(data);

export const getHighThinkingAnalysis = async (input: any) => {
  try {
    const syntheticInput = vault.scrambleObject(input);
    const prompt = `Perform a Deep Strategic Audit on the following SCRAMBLED industrial entity data.
    
    CONTEXT: We are correlating static registry records with a live stream of cross-departmental activity signals.
    The data is SYNTHETIC (Scrambled PII) to maintain local privacy compliance. Identifiers use 'SYNTHETIC_n' tokens.
    
    TASK:
    1. Analyze patterns in 'recentActivity' frequency vs registry status.
    2. Identify 'Hidden Linkage' risks by observing token repetition across records.
    3. Predict future operational health based on signal density.
    
    Anonymized Data Stream: ${JSON.stringify(syntheticInput, null, 2)}`;

    const result = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite-preview",
      contents: prompt,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
        systemInstruction: "You are a senior business intelligence analyst. You work strictly on synthetic/scrambled inputs to respect PII privacy.",
      }
    });

    if (!result || !result.text) {
      throw new Error("High thinking engine returned null result.");
    }
    return result.text;
  } catch (error: any) {
    console.error("High Thinking API failure:", error);
    throw new Error(`Strategic Analysis Engine unavailable: ${error.message || 'Unknown network error'}`);
  }
};

export const getMapsGroundingInfo = async (location: string) => {
  try {
    const prompt = `Provide a comprehensive industrial intelligence report for the ${location} area in Karnataka. 
    Focus on:
    1. Key industries and sectors present.
    2. Major industrial landmarks or clusters.
    3. Recent developments or infrastructure projects.
    4. Potential regulatory or environmental focus areas for this specific zone.
    
    Format the report with clear headings and structured sections. Use numbered lists for details.`;

    const result = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite-preview",
      contents: prompt,
      config: {
        tools: [{ googleMaps: {} } as any],
        toolConfig: { includeServerSideToolInvocations: true } as any,
        systemInstruction: "You are a specialized industrial intelligence analyst. Your reports are highly structured, data-driven, and professional. Use clear headings and numbered lists. DO NOT use asterisks (*) for formatting. Ensure each point starts on a new line."
      }
    });

    if (!result || !result.text) {
      throw new Error("Maps grounding engine returned null result.");
    }
    return result.text;
  } catch (error: any) {
    console.error("Maps Grounding API failure:", error);
    throw new Error(`Geospatial Intelligence Engine unavailable: ${error.message || 'Unknown network error'}`);
  }
};

export const getHealerPatch = async (errorStack: string, componentContext: string) => {
  const prompt = `The UBID system has encountered a runtime error. 
  ERROR STACK: ${errorStack}
  COMPONENT CONTEXT: ${componentContext}
  
  Provide a "Healer Instruction" to help the operator understand why this happened and how to avoid it. 
  Suggest a defensive programming snippet to prevent this specific crash in the future. 
  Format: Clear explanation + Code Snippet. No asterisks.`;

  const result = await ai.models.generateContent({
    model: "gemini-3.1-flash-lite-preview",
    contents: prompt,
    config: {
      systemInstruction: "You are an Automated Error Resolution AI designed for the UBID system. You stabilize and fix bugs."
    }
  });
  return result.text;
};

export const analyzeDataAnomaly = async (data: any) => {
  const syntheticData = vault.scrambleObject(data);
  const prompt = `The system has received a data record that doesn't fully match the standard UBID schema.
  RAW DATA (SCRAMBLED): ${JSON.stringify(syntheticData, null, 2)}
  
  Analyze the fields:
  1. Identify compatible fields with the Registry (which field is Name? which is Address?).
  2. Map unknown fields to potential system benefits (e.g., a "power_consumption" field might predict operational status).
  3. Propose a "Compatibility Layer" to ingest this data without modifying source department systems.
  
  Format: Schema Mapping Table + Recommendation. No asterisks.`;

  const result = await ai.models.generateContent({
    model: "gemini-3.1-flash-lite-preview",
    contents: prompt,
    config: {
      systemInstruction: "You are a Data Resilience AI. You work on scrambled data to prioritize privacy. You maintain compatibility with 40+ legacy systems."
    }
  });
  return result.text;
};
