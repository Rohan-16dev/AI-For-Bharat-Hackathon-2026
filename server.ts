import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import { resolveUBIDs } from "./src/services/ubidService.js";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = parseInt(process.env.PORT ?? "3000", 10);
const FRONTEND_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "http://localhost:5173,http://localhost:3000").split(",");
const API_KEY = process.env.KUBID_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const ai = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;

const app = express();

app.use(helmet());
app.use(express.json({ limit: "200mb" }));
app.use(express.urlencoded({ limit: "200mb", extended: true }));
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || FRONTEND_ORIGINS.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("CORS policy blocked this origin."));
    },
    credentials: true,
  })
);

const verifyApiKey = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!API_KEY) return next();
  const authHeader = req.headers.authorization;
  const token = typeof authHeader === "string" && authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : authHeader;

  if (token === API_KEY) {
    return next();
  }

  return res.status(401).json({ error: "Unauthorized. Missing or invalid API key." });
};

const sanitizePayload = (payload: any): any => {
  if (payload === null || payload === undefined) return payload;
  if (typeof payload === "string") return payload.replace(/[<>`]/g, "");
  if (Array.isArray(payload)) return payload.map(sanitizePayload);
  if (typeof payload === "object") {
    return Object.fromEntries(
      Object.entries(payload).map(([key, value]) => [key, sanitizePayload(value)])
    );
  }
  return payload;
};

app.get("/api/health", (req, res) => {
  res.json({
    status: "Operational",
    system: "KUBID Intelligence Engine",
    version: "2.4.0",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    capabilities: [
      "Sovereign Anchor Resolution",
      "Phonetic Name Matching (Soundex/Metaphone)",
      "Geospatial Conflict Resolution",
      "Activity Heartbeat Analysis",
      "AI Normalization Proxy",
      "Secure API Gateway"
    ],
  });
});

app.get("/api/docs", (req, res) => {
  res.json({
    name: "Karnataka Unified Business Identifier (KUBID) API",
    description: "Secure backend overlay for departmental entity resolution.",
    authentication: API_KEY ? "Bearer token required" : "Optional bearer token in development",
    endpoints: {
      "POST /api/resolve": {
        description: "Resolve raw departmental records into UBIDs using the backend logic engine.",
        payload: {
          records: "Array<SourceRecord>",
          knowledge: "Optional system knowledge state",
          events: "Optional activity event array"
        }
      },
      "POST /api/events": {
        description: "Submit activity events for intelligence ingestion.",
        payload: {
          events: "Array<ActivityEvent>"
        }
      },
      "POST /api/ai/generate": {
        description: "Proxy AI prompts through the secure backend so the Gemini key remains on the server.",
        payload: {
          prompt: "string",
          modelName: "string",
          systemInstruction: "string"
        }
      },
      "POST /api/ai/chat": {
        description: "Secure chat endpoint for the UBID assistant.",
        payload: {
          message: "string",
          history: "Array<{ role: string; parts: { text: string }[] }>"
        }
      }
    },
    testing_command: "curl -X POST http://localhost:3000/api/resolve -H 'Content-Type: application/json' -d '{\"records\":[{\"id\":\"T1\",\"name\":\"Sri Lakshmi Tex\"}] }'"
  });
});

app.post("/api/resolve", verifyApiKey, (req, res) => {
  try {
    const { records, knowledge, events } = sanitizePayload(req.body);

    if (!Array.isArray(records)) {
      return res.status(400).json({
        error: "Invalid input. Expected a JSON object with a 'records' array.",
        hint: "Send { records: [...] } against this endpoint.",
      });
    }

    const result = resolveUBIDs(records, knowledge, events);
    return res.json({
      success: true,
      resolvedCount: result.ubids.length,
      suggestionsCount: result.suggestions.length,
      timestamp: new Date().toISOString(),
      data: result,
    });
  } catch (error: any) {
    console.error("API Resolution Failure:", error);
    return res.status(500).json({ error: "Engine resolution failure.", details: error.message });
  }
});

app.post("/api/events", verifyApiKey, (req, res) => {
  try {
    const { events } = sanitizePayload(req.body);
    if (!Array.isArray(events)) {
      return res.status(400).json({ error: "Events must be sent as an array." });
    }

    return res.json({
      success: true,
      message: "Events ingested for analysis.",
      count: events.length,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

const ensureAiConfigured = () => {
  if (!ai) {
    throw new Error("AI backend is not configured. Set GEMINI_API_KEY in the server environment.");
  }
};

app.post("/api/ai/generate", verifyApiKey, async (req, res) => {
  try {
    ensureAiConfigured();
    const payload = sanitizePayload(req.body);

    if (!payload || (!payload.prompt && !payload.contents)) {
      return res.status(400).json({ error: "Missing prompt or contents for AI generation." });
    }

    const result = await ai.models.generateContent({
      model: payload.modelName || payload.model || "gemini-3.1-flash-lite",
      contents: payload.prompt || payload.contents,
      config: {
        systemInstruction: payload.systemInstruction,
        thinkingConfig: payload.thinkingConfig,
        tools: payload.tools,
        toolConfig: payload.toolConfig,
      },
    });

    return res.json({ success: true, text: result.text, raw: result });
  } catch (error: any) {
    console.error("AI Generation failure:", error);
    return res.status(500).json({ error: error.message || "AI generation failed." });
  }
});

app.post("/api/ai/chat", verifyApiKey, async (req, res) => {
  try {
    ensureAiConfigured();
    const { message, history, systemInstruction } = sanitizePayload(req.body);

    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "Message must be a non-empty string." });
    }

    const chat = ai.chats.create({
      model: "gemini-3.1-flash-lite",
      config: { systemInstruction },
      history: Array.isArray(history) ? history : [],
    });
    const result = await chat.sendMessage({ message });

    return res.json({ success: true, reply: result.text });
  } catch (error: any) {
    console.error("AI Chat failure:", error);
    return res.status(500).json({ error: error.message || "AI chat request failed." });
  }
});

if (process.env.NODE_ENV === "production") {
  const distPath = path.join(process.cwd(), "dist");
  app.use(express.static(distPath));
  app.get("*", (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
} else {
  app.get("/", (req, res) => {
    res.redirect("http://localhost:5173");
  });
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`API Health: http://localhost:${PORT}/api/health`);
  console.log(`API Docs: http://localhost:${PORT}/api/docs`);
  if (!GEMINI_API_KEY) {
    console.warn("Warning: GEMINI_API_KEY is not configured. AI endpoints will fail until it is set.");
  }
});
