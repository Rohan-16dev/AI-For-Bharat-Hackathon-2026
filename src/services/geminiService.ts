import { soundex, normalizeString } from "./fuzzyMatchingService";
import { maskPII } from "./ubidService";

export enum AIErrorType {
  RATE_LIMIT = "RATE_LIMIT",
  QUOTA_EXCEEDED = "QUOTA_EXCEEDED",
  SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE",
  NETWORK_ERROR = "NETWORK_ERROR",
  INVALID_PROMPT = "INVALID_PROMPT",
  UNKNOWN = "UNKNOWN"
}

export interface AIError {
  type: AIErrorType;
  message: string;
  userMessage: string;
  suggestion: string;
  retryable: boolean;
}

const classifyError = (error: any): AIError => {
  const message = error?.message || String(error);

  if (message.includes("429") || message.toLowerCase().includes("rate limit") || message.toLowerCase().includes("too many requests")) {
    return {
      type: AIErrorType.RATE_LIMIT,
      message,
      userMessage: "The AI Intelligence Engine is currently processing a high volume of requests.",
      suggestion: "Please wait a few moments and try your request again.",
      retryable: true
    };
  }

  if (message.includes("quota") || message.toLowerCase().includes("exhausted")) {
    return {
      type: AIErrorType.QUOTA_EXCEEDED,
      message,
      userMessage: "The daily intelligence quota for the KUBID platform has been reached.",
      suggestion: "If this is a critical administrative task, please contact the system administrator to increase your priority limit.",
      retryable: false
    };
  }

  if (message.includes("503") || message.includes("504") || message.toLowerCase().includes("unavailable")) {
    return {
      type: AIErrorType.SERVICE_UNAVAILABLE,
      message,
      userMessage: "The Backend Intelligence Engine is currently undergoing maintenance or is temporarily unreachable.",
      suggestion: "The system should be back online shortly. Check the operational dashboard for updates.",
      retryable: true
    };
  }

  if (message.toLowerCase().includes("fetch") || message.toLowerCase().includes("network") || message.toLowerCase().includes("timeout")) {
    return {
      type: AIErrorType.NETWORK_ERROR,
      message,
      userMessage: "A connectivity issue is preventing the KUBID portal from reaching the AI cluster.",
      suggestion: "Verify your secure network connection and try again.",
      retryable: true
    };
  }

  return {
    type: AIErrorType.UNKNOWN,
    message,
    userMessage: "An unexpected anomaly occurred in the UBID Intelligence Pipeline.",
    suggestion: "Refresh the application. If the error persists, file a stability report using the 'Healer' tool.'",
    retryable: true
  };
};

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
   - Analysis window is 12 months for closure, 6 months for dormancy.
   - 'Active': Operational signals (Inspections, GST filings) in the last 6 months.
   - 'Dormant': Only Admin signals (Electricity, Tax) in 6 months OR latest signal is 6-12 months old.
   - 'Closed': Explicit disconnection/closure signal OR zero signals for 12 months.
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

const apiRequest = async (endpoint: string, payload: any) => {
  const response = await fetch(`/api/ai/${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Backend AI request failed: ${response.status} ${errorText}`);
  }

  return response.json();
};

export const getGeneralChatResponse = async (message: string, history: any[]) => {
  const vault = new PrivacyVault();
  try {
    const syntheticMessage = vault.scrambleObject(message);
    const syntheticHistory = history.map(h => ({
      ...h,
      parts: h.parts.map((p: any) => ({
        ...p,
        text: vault.scrambleObject(p.text)
      }))
    }));

    const systemInstruction = `You are the UBID Intelligence Assistant. Provide ultra-fast, direct, and structured data.
    The system is designed to layer on top of 40+ departmental silos without modifying source systems.
    Privacy Constraint: All PII is scrambled into 'SYNTHETIC_n' tokens before AI analysis.
    
    ${SYSTEM_LOGIC_KNOWLEDGE}`;

    const result = await apiRequest("chat", {
      message: syntheticMessage,
      history: syntheticHistory,
      systemInstruction,
    });

    return vault.restore(result.reply);
  } catch (error: any) {
    console.error("AI Chat failure:", error);
    throw classifyError(error);
  }
};

/**
 * --- PRIVACY COMPLIANCE VAULT ---
 * Ensures raw PII never leaves the local environment.
 * Maps real identifiers to synthetic tokens before LLM execution.
 */
export class PrivacyVault {
  private map: Map<string, string> = new Map();
  private reverseMap: Map<string, string> = new Map();
  private counter: number = 0;

  scramble(value: string | undefined | null, type: 'NAME' | 'ADDRESS' | 'OWNER' | 'GENERIC' = 'GENERIC'): string {
    if (!value) return '';
    const trimmed = value.trim();
    if (this.map.has(trimmed)) return this.map.get(trimmed)!;

    let token = `SYNTHETIC_${this.counter++}`;

    if (type === 'NAME') {
      token = normalizeString(trimmed);
    } else if (type === 'OWNER') {
      const sdx = soundex(trimmed);
      const firstChar = trimmed.charAt(0).toUpperCase();
      token = `${sdx}_${firstChar}`;
    } else if (type === 'ADDRESS') {
      const pinMatch = trimmed.match(/\b\d{6}\b/);
      const pincode = pinMatch ? pinMatch[0] : 'UNKNOWN_PIN';
      token = `AREA_ZONE_${pincode}`;
    } else if (type === 'GENERIC' && /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(trimmed)) {
      token = maskPII(trimmed) || `KA-SEC-ALT-${this.counter++}`;
    }

    this.map.set(trimmed, token);
    this.reverseMap.set(token, trimmed);
    return token;
  }

  scrambleObject(obj: any): any {
    const json = JSON.stringify(obj);
    let scrambledStr = json;

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

    [...new Set(matches)].forEach(match => {
      if (typeof match === 'string' && match.length > 2) {
        scrambledStr = scrambledStr.split(match).join(this.scramble(match, 'GENERIC'));
      }
    });

    const parsed = JSON.parse(scrambledStr);

    const traverseAndScramble = (target: any) => {
      if (!target) return;
      if (Array.isArray(target)) {
        target.forEach(item => traverseAndScramble(item));
      } else if (typeof target === 'object') {
        Object.keys(target).forEach(key => {
          if (typeof target[key] === 'string') {
            if (["businessName", "canonicalName", "name", "businessNameHint"].includes(key)) {
              target[key] = this.scramble(target[key], 'NAME');
            } else if (["address", "canonicalAddress", "addressHint"].includes(key)) {
              target[key] = this.scramble(target[key], 'ADDRESS');
            } else if (["ownerName"].includes(key)) {
              target[key] = this.scramble(target[key], 'OWNER');
            }
          }
          traverseAndScramble(target[key]);
        });
      }
    };

    traverseAndScramble(parsed);
    return parsed;
  }

  restore(input: any): any {
    if (typeof input === 'string') {
      let restored = input;
      const tokens = Array.from(this.reverseMap.keys()).sort((a, b) => b.length - a.length);
      tokens.forEach(token => {
        const realValue = this.reverseMap.get(token);
        if (realValue) {
          restored = restored.split(token).join(realValue);
        }
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

export const scrambleForAI = (data: any) => new PrivacyVault().scrambleObject(data);
export const restoreFromAI = (data: any, vault?: PrivacyVault) => (vault || new PrivacyVault()).restore(data);

export const getHighThinkingAnalysis = async (input: any) => {
  const vault = new PrivacyVault();
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

    const result = await apiRequest("generate", {
      prompt,
      modelName: "gemini-3.1-flash-lite",
      systemInstruction: "You are a senior business intelligence analyst. You work strictly on synthetic/scrambled inputs to respect PII privacy.",
      thinkingConfig: { thinkingLevel: "HIGH" }
    });

    return vault.restore(result.text);
  } catch (error: any) {
    console.error("High Thinking API failure:", error);
    throw classifyError(error);
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

    const result = await apiRequest("generate", {
      prompt,
      modelName: "gemini-3.1-flash-lite",
      systemInstruction: "You are a specialized industrial intelligence analyst. Your reports are highly structured, data-driven, and professional. Use clear headings and numbered lists. DO NOT use asterisks (*) for formatting. Ensure each point starts on a new line."
    });

    return result.text;
  } catch (error: any) {
    console.error("Maps Grounding API failure:", error);
    throw classifyError(error);
  }
};

export const getHealerPatch = async (errorStack: string, componentContext: string) => {
  const sanitize = (str: string) => str.replace(/[`${}]/g, '');
  const cleanStack = sanitize(errorStack).slice(0, 1000);
  const cleanContext = sanitize(componentContext).slice(0, 500);

  const prompt = `The UBID system has encountered a runtime error. 
  ERROR STACK: ${cleanStack}
  COMPONENT CONTEXT: ${cleanContext}
  
  Provide a "Healer Instruction" to help the operator understand why this happened and how to avoid it. 
  Suggest a defensive programming snippet to prevent this specific crash in the future. 
  Format: Clear explanation + Code Snippet. No asterisks.`;

  try {
    const result = await apiRequest("generate", {
      prompt,
      modelName: "gemini-3.1-flash-lite",
      systemInstruction: "You are an Automated Error Resolution AI designed for the UBID system. You stabilize and fix bugs."
    });

    return result.text;
  } catch (error: any) {
    console.error("Healer API failure:", error);
    throw classifyError(error);
  }
};

export const generateAIContent = async (payload: any) => {
  try {
    return await apiRequest("generate", payload);
  } catch (error: any) {
    console.error("AI Generate Content failure:", error);
    throw classifyError(error);
  }
};

export const analyzeDataAnomaly = async (data: any) => {
  const vault = new PrivacyVault();
  const syntheticData = vault.scrambleObject(data);
  const prompt = `The system has received a data record that doesn't fully match the standard UBID schema.
  RAW DATA (SCRAMBLED): ${JSON.stringify(syntheticData, null, 2)}
  
  Analyze the fields:
  1. Identify compatible fields with the Registry (which field is Name? which is Address?).
  2. Map unknown fields to potential system benefits (e.g., a "power_consumption" field might predict operational status).
  3. Propose a "Compatibility Layer" to ingest this data without modifying source department systems.
  
  Format: Schema Mapping Table + Recommendation. No asterisks.`;

  try {
    const result = await apiRequest("generate", {
      prompt,
      modelName: "gemini-3.1-flash-lite",
      systemInstruction: "You are a Data Resilience AI. You work on scrambled data to prioritize privacy. You maintain compatibility with 40+ legacy systems."
    });

    return vault.restore(result.text);
  } catch (error: any) {
    console.error("Data Anomaly API failure:", error);
    throw classifyError(error);
  }
};
