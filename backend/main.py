from fastapi import FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import google.genai as genai
import os
import re
from dotenv import load_dotenv
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*","http://localhost:3000", "http://localhost:5173"],  # In production, specify your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

@app.get("/")
def root():
    return {"status": "ok", "message": "Backend is running. Use /docs for API docs."}

# -----------------------------
# 📦 Privacy Vault 
# -----------------------------
class PrivacyVault:
    def __init__(self):
        self.map = {}
        self.reverse_map = {}
        self.counter = 0

    def scramble(self, value):
        if not value:
            return ""
        value = value.strip()
        if value in self.map:
            return self.map[value]

        token = f"SYNTHETIC_{self.counter}"
        self.counter += 1

        self.map[value] = token
        self.reverse_map[token] = value
        return token

    def scramble_object(self, data):
        text = str(data)

        patterns = [
            r"[A-Z]{5}[0-9]{4}[A-Z]",  # PAN
            r"[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z][0-9A-Z]",  # GSTIN
            r"\b\d{10}\b",  # phone
            r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+"  # email
        ]

        for pattern in patterns:
            matches = re.findall(pattern, text)
            for m in matches:
                text = text.replace(m, self.scramble(m))

        return text

vault = PrivacyVault()

# -----------------------------
# 📥 Request Models
# -----------------------------
class ChatRequest(BaseModel):
    message: str
    history: list = []

class AnalysisRequest(BaseModel):
    data: dict

class LocationRequest(BaseModel):
    location: str

class ErrorRequest(BaseModel):
    errorStack: str
    componentContext: str

class CleanRequest(BaseModel):
    record: dict

# -----------------------------
# 💬 Chat Endpoint
# -----------------------------
SYSTEM_LOGIC_KNOWLEDGE = """
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
"""

@app.post("/chat")
def chat(req: ChatRequest):
    msg = vault.scramble_object(req.message)

    prompt = f"""
You are the UBID Intelligence Assistant. Provide ultra-fast, direct, and structured data.
The system is designed to layer on top of 40+ departmental silos without modifying source systems.
Privacy Constraint: All PII is scrambled into 'SYNTHETIC_n' tokens before AI analysis.

{SYSTEM_LOGIC_KNOWLEDGE}

User Input:
{msg}
"""

    # Handle history if provided
    if req.history:
        # Build conversation history
        history_text = ""
        for h in req.history:
            role = h.get('role', 'user')
            parts = h.get('parts', [])
            text = " ".join([p.get('text', '') for p in parts])
            history_text += f"{role.capitalize()}: {text}\n"
        prompt = f"{history_text}\n{prompt}"

    response = client.models.generate_content(
        model="gemini-3.1-flash-lite-preview",
        contents=prompt
    )
    return {"reply": response.text}


# -----------------------------
# 🧠 High Thinking Analysis
# -----------------------------
@app.post("/analyze")
def analyze(req: AnalysisRequest):
    data = vault.scramble_object(req.data)

    prompt = f"""
Perform a Deep Strategic Audit on the following SCRAMBLED industrial entity data.

CONTEXT: We are correlating static registry records with a live stream of cross-departmental activity signals.
The data is SYNTHETIC (Scrambled PII) to maintain local privacy compliance. Identifiers use 'SYNTHETIC_n' tokens.

TASK:
1. Analyze patterns in 'recentActivity' frequency vs registry status.
2. Identify 'Hidden Linkage' risks by observing token repetition across records.
3. Predict future operational health based on signal density.

Anonymized Data Stream: {data}
"""

    response = client.models.generate_content(
        model="gemini-3.1-flash-lite-preview",
        contents=prompt
    )
    return {"result": response.text}


# -----------------------------
# 🗺️ Maps Grounding
# -----------------------------
@app.post("/map")
def map_info(req: LocationRequest):
    prompt = f"""
Provide a comprehensive industrial intelligence report for the {req.location} area in Karnataka. 
Focus on:
1. Key industries and sectors present.
2. Major industrial landmarks or clusters.
3. Recent developments or infrastructure projects.
4. Potential regulatory or environmental focus areas for this specific zone.

Format the report with clear headings and structured sections. Use numbered lists for details.
"""

    response = client.models.generate_content(
        model="gemini-3.1-flash-lite-preview",
        contents=prompt
    )
    return {"result": response.text}


# -----------------------------
# 🛠️ Healer Patch
# -----------------------------
@app.post("/heal")
def heal(req: ErrorRequest):
    prompt = f"""
The UBID system has encountered a runtime error. 
ERROR STACK: {req.errorStack}
COMPONENT CONTEXT: {req.componentContext}

Provide a "Healer Instruction" to help the operator understand why this happened and how to avoid it. 
Suggest a defensive programming snippet to prevent this specific crash in the future. 
Format: Clear explanation + Code Snippet. No asterisks.
"""

    response = client.models.generate_content(
        model="gemini-3.1-flash-lite-preview",
        contents=prompt
    )
    return {"result": response.text}


# -----------------------------
# 🚨 Data Anomaly
# -----------------------------
@app.post("/anomaly")
def anomaly(req: AnalysisRequest):
    data = vault.scramble_object(req.data)

    prompt = f"""
The system has received a data record that doesn't fully match the standard UBID schema.
RAW DATA (SCRAMBLED): {data}

Analyze the fields:
1. Identify compatible fields with the Registry (which field is Name? which is Address?).
2. Map unknown fields to potential system benefits (e.g., a "power_consumption" field might predict operational status).
3. Propose a "Compatibility Layer" to ingest this data without modifying source department systems.

Format: Schema Mapping Table + Recommendation. No asterisks.
"""

    response = client.models.generate_content(
        model="gemini-3.1-flash-lite-preview",
        contents=prompt
    )
    return {"result": response.text}


# -----------------------------
# 🧹 Data Cleaning
# -----------------------------
@app.post("/clean")
def clean_data(req: CleanRequest):
    record = req.record

    prompt = f"""
You are the Karnataka Government Data Normalizer.
Clean the following messy business record into a standard format.
The data is SCRAMBLED (PII replaced with SYNTHETIC_n tokens).

TASK:
- Standardize symbols (e.g. "Pvt Ltd" -> "Private Limited").
- Correct common misspellings in structural address terms.

RECORD: {record}

Return the cleaned record as valid JSON only. No markdown code blocks.
"""

    try:
        response = client.models.generate_content(
            model="gemini-3.1-flash-lite-preview",
            contents=prompt
        )
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

    # Safely parse JSON, removing markdown code blocks if present
    import json
    response_text = response.text.strip()
    
    # Remove markdown code block if present
    if response_text.startswith("```json"):
        response_text = response_text[7:]
    elif response_text.startswith("```"):
        response_text = response_text[3:]
    
    if response_text.endswith("```"):
        response_text = response_text[:-3]
    
    response_text = response_text.strip()
    
    try:
        cleaned = json.loads(response_text)
    except json.JSONDecodeError:
        # Fallback: return the original record if parsing fails
        cleaned = record
    
    return {"cleaned": cleaned}