# main.py
import os
import time
import io
import base64
import json
import re
from typing import List, Optional, Dict
from datetime import datetime, timedelta

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from PyPDF2 import PdfReader  # pip install PyPDF2

try:
    from openai import OpenAI
except Exception:
    OpenAI = None

# ----------------------------
# Configuration
# ----------------------------
PPLX_API_KEY = os.getenv("PPLX_API_KEY")
PPLX_BASE_URL = os.getenv("PPLX_BASE_URL", "https://api.perplexity.ai")
DEFAULT_MODEL = os.getenv("DEFAULT_MODEL", "sonar-pro")

# In-memory storage for feedback (in production, use a database)
feedback_storage = []

# ----------------------------
# Pydantic models
# ----------------------------
class DenialData(BaseModel):
    claim_id: str
    payer: str
    patient_name: Optional[str] = None
    dos: Optional[str] = None
    billed_amount: Optional[float] = None
    denial_reason_text: Optional[str] = None
    denial_codes: List[str] = Field(default_factory=list)
    cpt_codes: List[str] = Field(default_factory=list)
    icd_codes: List[str] = Field(default_factory=list)

class AnalysisResult(BaseModel):
    root_cause: List[str] = Field(default_factory=lambda: ["Unknown denial cause"])
    action_required: List[str] = Field(default_factory=lambda: ["Review claim details"])
    appeal_potential: str = "low"
    billing_action: str = "review"

class DeepAnalysisResult(BaseModel):
    root_cause_detailed: List[Dict[str, str]] = Field(default_factory=list)
    immediate_actions: List[str] = Field(default_factory=list)
    documentation_required: List[str] = Field(default_factory=list)
    appeal_strategy: str = "standard"
    success_probability: int = 50
    timeline_estimate: str = "30-45 days"
    regulatory_references: List[str] = Field(default_factory=list)
    reimbursement_impact: Dict[str, str] = Field(default_factory=dict)
    next_steps: List[str] = Field(default_factory=list)

class AppealLetterResult(BaseModel):
    letter_content: str
    supporting_points: List[str] = Field(default_factory=list)
    required_attachments: List[str] = Field(default_factory=list)
    submission_deadline: Optional[str] = None
    follow_up_date: Optional[str] = None

class QuickAnalysisRequest(BaseModel):
    denial_data: DenialData
    model: Optional[str] = None

class DeepAnalysisRequest(BaseModel):
    denial_data: DenialData
    provider_info: Optional[Dict[str, str]] = Field(default_factory=dict)
    model: Optional[str] = None

class AppealLetterRequest(BaseModel):
    denial_data: DenialData
    provider_info: Dict[str, str]
    appeal_type: Optional[str] = "first_level"
    model: Optional[str] = None

class FeedbackRequest(BaseModel):
    endpoint_used: str
    claim_id: Optional[str] = None
    rating: int = Field(..., ge=1, le=5)
    comments: Optional[str] = None
    user_type: Optional[str] = "billing_specialist"

class QuickAnalysisResponse(BaseModel):
    claim_id: str
    analysis: AnalysisResult
    codes_analyzed: List[str] = Field(default_factory=list)
    timestamp: int

class DeepAnalysisResponse(BaseModel):
    claim_id: str
    analysis: DeepAnalysisResult
    codes_analyzed: List[str] = Field(default_factory=list)
    confidence_score: int = 75
    timestamp: int

class AppealLetterResponse(BaseModel):
    claim_id: str
    appeal_letter: AppealLetterResult
    generation_timestamp: int

class FeedbackResponse(BaseModel):
    message: str
    feedback_id: int
    timestamp: int

class FileUploadResponse(BaseModel):
    extracted_denials: List[DenialData] = Field(default_factory=list)
    processing_notes: List[str] = Field(default_factory=list)

# ----------------------------
# AI client helper
# ----------------------------
def get_client():
    if not PPLX_API_KEY or OpenAI is None:
        return None
    return OpenAI(api_key=PPLX_API_KEY, base_url=PPLX_BASE_URL)

# ----------------------------
# FEEDBACK UTILIZATION FUNCTIONS
# ----------------------------
def get_feedback_insights(endpoint: str) -> Dict[str, str]:
    """
    Analyze stored feedback to generate insights for improving AI responses
    """
    if not feedback_storage:
        return {}

    # Filter feedback for specific endpoint
    endpoint_feedback = [f for f in feedback_storage if f["endpoint_used"] == endpoint]
    
    if not endpoint_feedback:
        return {}

    # Calculate average rating
    total_rating = sum(f["rating"] for f in endpoint_feedback)
    avg_rating = total_rating / len(endpoint_feedback)
    
    # Collect common issues from low-rated feedback (1-2 stars)
    low_rated_comments = [f["comments"] for f in endpoint_feedback 
                         if f["rating"] <= 2 and f["comments"]]
    
    # Collect positive feedback from high-rated responses (4-5 stars)
    high_rated_comments = [f["comments"] for f in endpoint_feedback 
                          if f["rating"] >= 4 and f["comments"]]

    insights = {
        "avg_rating": f"{avg_rating:.1f}",
        "total_feedback": str(len(endpoint_feedback)),
        "improvement_areas": ", ".join(low_rated_comments[-3:]) if low_rated_comments else "",
        "successful_patterns": ", ".join(high_rated_comments[-3:]) if high_rated_comments else ""
    }
    
    return insights

def enhance_prompt_with_feedback(base_prompt: str, endpoint: str) -> str:
    """
    Dynamically enhance AI prompts based on user feedback patterns
    """
    insights = get_feedback_insights(endpoint)
    
    if not insights:
        return base_prompt

    # Add feedback-driven improvements to prompt
    feedback_enhancement = f"""

IMPORTANT: Based on user feedback (avg rating: {insights.get('avg_rating', 'N/A')}/5 from {insights.get('total_feedback', '0')} users):

AVOID these common issues: {insights.get('improvement_areas', 'No specific issues identified')}

EMPHASIZE these successful approaches: {insights.get('successful_patterns', 'No specific patterns identified')}

Ensure your response addresses user expectations and avoids previously reported problems.
"""
    
    return base_prompt + feedback_enhancement

# ----------------------------
# PDF/Text extraction
# ----------------------------
def extract_text_from_file(file_bytes: bytes, filename: str) -> str:
    """
    Extract plain text from PDF or text file
    """
    text = ""
    if filename.lower().endswith(".pdf"):
        try:
            reader = PdfReader(io.BytesIO(file_bytes))
            for page in reader.pages:
                page_text = page.extract_text()
                if page_text:
                    text += page_text + "\n"
        except Exception:
            text = ""
    else:
        try:
            text = file_bytes.decode("utf-8", errors="ignore")
        except Exception:
            text = ""
    return text[:4000]

# ----------------------------
# ENHANCED AI ANALYSIS FUNCTIONS WITH FEEDBACK UTILIZATION
# ----------------------------
def call_ai_analysis(denial: DenialData, model: Optional[str] = None) -> AnalysisResult:
    if not denial.denial_reason_text:
        return AnalysisResult()

    client = get_client()
    if not client:
        return AnalysisResult()

    chosen_model = model or DEFAULT_MODEL

    # Base prompt
    base_prompt = f"""
You are a medical billing expert. Analyze the following claim denial.

Claim ID: {denial.claim_id}
Payer: {denial.payer}

File/EOB content (plain text):
{denial.denial_reason_text}

Tasks:
1. Extract all CARC/RARC denial codes.
2. Extract CPT codes.
3. Extract ICD-10 codes.
4. Determine root cause (2-3 short reasons, ≤8 words each).
5. Suggest immediate actions required (2-3, ≤8 words each).
6. Assess appeal potential: high | medium | low.
7. Suggest billing action: rebill | appeal | write_off | patient_bill | review.

Return STRICT JSON ONLY with keys:
- "root_cause": array
- "action_required": array
- "appeal_potential": string
- "billing_action": string
- "denial_codes": array
- "cpt_codes": array
- "icd_codes": array
"""

    # Enhance prompt with feedback insights - FIXED: Removed citation references
    enhanced_prompt = enhance_prompt_with_feedback(base_prompt, "quick-analysis")

    try:
        response = client.chat.completions.create(
            model=chosen_model,
            messages=[
                {"role": "system", "content": "You are a medical billing expert. Provide concise, actionable JSON only. Learn from user feedback to improve accuracy."},
                {"role": "user", "content": enhanced_prompt}
            ],
            temperature=0.2,
            max_tokens=600
        )

        raw_json = response.choices[0].message.content
        raw_json = re.sub(r"^``````$", "", raw_json.strip())
        parsed = json.loads(raw_json)

        denial.denial_codes = parsed.get("denial_codes", [])
        denial.cpt_codes = parsed.get("cpt_codes", [])
        denial.icd_codes = parsed.get("icd_codes", [])

        return AnalysisResult(
            root_cause=parsed.get("root_cause", ["Unknown denial cause"])[:3],
            action_required=parsed.get("action_required", ["Review claim details"])[:3],
            appeal_potential=parsed.get("appeal_potential", "medium").lower(),
            billing_action=parsed.get("billing_action", "review").lower()
        )

    except Exception:
        return AnalysisResult()

def call_deep_analysis(denial: DenialData, provider_info: Dict[str, str], model: Optional[str] = None) -> DeepAnalysisResult:
    if not denial.denial_reason_text:
        return DeepAnalysisResult()

    client = get_client()
    if not client:
        return DeepAnalysisResult()

    chosen_model = model or DEFAULT_MODEL

    base_prompt = f"""
You are a senior medical billing consultant. Perform comprehensive denial analysis.

Claim Details:
- Claim ID: {denial.claim_id}
- Payer: {denial.payer}
- Patient: {denial.patient_name or 'N/A'}
- DOS: {denial.dos or 'N/A'}
- Amount: ${denial.billed_amount or 0}

Provider Info:
{json.dumps(provider_info, indent=2)}

Denial Content:
{denial.denial_reason_text}

Provide detailed analysis in JSON format with:
1. "root_cause_detailed": Array of objects with "cause" and "explanation" keys
2. "immediate_actions": Specific actionable steps
3. "documentation_required": Documents needed for appeal
4. "appeal_strategy": aggressive | standard | conservative
5. "success_probability": Integer 0-100
6. "timeline_estimate": Expected resolution timeframe
7. "regulatory_references": Relevant regulations/guidelines
8. "reimbursement_impact": Object with "potential_recovery" and "effort_required"
9. "next_steps": Prioritized action items

Focus on medical necessity, coding accuracy, and payer policies.
"""

    # Enhance with feedback - FIXED: Removed citation references
    enhanced_prompt = enhance_prompt_with_feedback(base_prompt, "deep-analysis")

    try:
        response = client.chat.completions.create(
            model=chosen_model,
            messages=[
                {"role": "system", "content": "You are a senior medical billing consultant. Adapt your analysis based on user feedback to provide maximum value."},
                {"role": "user", "content": enhanced_prompt}
            ],
            temperature=0.1,
            max_tokens=1500
        )

        raw_json = response.choices[0].message.content
        raw_json = re.sub(r"^``````$", "", raw_json.strip())
        parsed = json.loads(raw_json)

        return DeepAnalysisResult(
            root_cause_detailed=parsed.get("root_cause_detailed", [{"cause": "Unknown", "explanation": "Unable to determine"}]),
            immediate_actions=parsed.get("immediate_actions", ["Review claim documentation"]),
            documentation_required=parsed.get("documentation_required", ["Medical records", "Provider notes"]),
            appeal_strategy=parsed.get("appeal_strategy", "standard").lower(),
            success_probability=min(100, max(0, parsed.get("success_probability", 50))),
            timeline_estimate=parsed.get("timeline_estimate", "30-45 days"),
            regulatory_references=parsed.get("regulatory_references", []),
            reimbursement_impact=parsed.get("reimbursement_impact", {"potential_recovery": "Unknown", "effort_required": "Medium"}),
            next_steps=parsed.get("next_steps", ["Gather documentation", "Prepare appeal"])
        )

    except Exception:
        return DeepAnalysisResult()

def generate_appeal_letter(denial: DenialData, provider_info: Dict[str, str], appeal_type: str = "first_level", model: Optional[str] = None) -> AppealLetterResult:
    if not denial.denial_reason_text:
        return AppealLetterResult(letter_content="Unable to generate appeal letter without denial information.")

    client = get_client()
    if not client:
        return AppealLetterResult(letter_content="AI service unavailable. Please draft appeal letter manually.")

    chosen_model = model or DEFAULT_MODEL

    today = datetime.now()
    submission_deadline = (today + timedelta(days=30)).strftime("%B %d, %Y")
    follow_up_date = (today + timedelta(days=45)).strftime("%B %d, %Y")

    base_prompt = f"""
Generate a professional medical billing appeal letter.

Claim Information:
- Claim ID: {denial.claim_id}
- Payer: {denial.payer}
- Patient: {denial.patient_name or '[Patient Name]'}
- DOS: {denial.dos or '[Date of Service]'}
- Amount: ${denial.billed_amount or '[Amount]'}

Provider Information:
{json.dumps(provider_info, indent=2)}

Denial Details:
{denial.denial_reason_text}

Appeal Type: {appeal_type}

Generate a complete professional appeal letter with:
1. Proper business letter format
2. Specific denial reasons addressed
3. Medical necessity justification
4. Relevant coding references
5. Professional, persuasive tone
6. Request for specific action

Return JSON with:
- "letter_content": Complete formatted letter
- "supporting_points": Key arguments made
- "required_attachments": List of documents to include
"""

    # Enhance with feedback - FIXED: Removed citation references
    enhanced_prompt = enhance_prompt_with_feedback(base_prompt, "generate-appeal-letter")

    try:
        response = client.chat.completions.create(
            model=chosen_model,
            messages=[
                {"role": "system", "content": "You are an expert medical billing specialist. Use feedback from previous letters to improve quality and effectiveness."},
                {"role": "user", "content": enhanced_prompt}
            ],
            temperature=0.1,
            max_tokens=2000
        )

        raw_json = response.choices[0].message.content
        raw_json = re.sub(r"^``````$", "", raw_json.strip())
        parsed = json.loads(raw_json)

        return AppealLetterResult(
            letter_content=parsed.get("letter_content", "Unable to generate letter content."),
            supporting_points=parsed.get("supporting_points", ["Medical necessity established", "Proper coding verified"]),
            required_attachments=parsed.get("required_attachments", ["Medical records", "Provider notes", "Coding documentation"]),
            submission_deadline=submission_deadline,
            follow_up_date=follow_up_date
        )

    except Exception:
        return AppealLetterResult(
            letter_content="Error generating appeal letter. Please contact support.",
            supporting_points=["Technical error occurred"],
            required_attachments=["Manual review required"],
            submission_deadline=submission_deadline,
            follow_up_date=follow_up_date
        )

# ----------------------------
# FastAPI app
# ----------------------------
app = FastAPI(title="AI-Powered Medical Billing Analysis API", version="2.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.get("/health")
def health():
    total_feedback = len(feedback_storage)
    avg_rating = sum(f["rating"] for f in feedback_storage) / total_feedback if total_feedback > 0 else 0
    
    return {
        "status": "ok", 
        "ai_enabled": bool(get_client()), 
        "default_model": DEFAULT_MODEL,
        "feedback_system": {
            "total_feedback": total_feedback,
            "average_rating": round(avg_rating, 1),
            "feedback_utilized": True
        },
        "endpoints": [
            "/upload-era",
            "/quick-analysis", 
            "/deep-analysis",
            "/paste-eob",
            "/generate-appeal-letter",
            "/feedback"
        ]
    }

# ----------------------------
# Upload ERA/PDF
# ----------------------------
@app.post("/upload-era", response_model=FileUploadResponse)
async def upload_era_file(file: UploadFile = File(...), payer_name: Optional[str] = Form(None)):
    if not file or not file.filename:
        raise HTTPException(status_code=400, detail="No file uploaded")

    content = await file.read()
    processing_notes: List[str] = []

    extracted_text = extract_text_from_file(content, file.filename)
    if not extracted_text:
        extracted_text = base64.b64encode(content).decode("utf-8")
        processing_notes.append("No text could be extracted; using base64 content.")
    else:
        processing_notes.append("Text successfully extracted from file.")

    denials = [DenialData(
        claim_id="EXTRACTED_FROM_FILE",
        payer=payer_name or "Unknown",
        denial_reason_text=extracted_text
    )]

    return FileUploadResponse(
        extracted_denials=denials,
        processing_notes=processing_notes
    )

@app.post("/quick-analysis", response_model=QuickAnalysisResponse)
def quick_analysis(req: QuickAnalysisRequest):
    denial = req.denial_data
    analysis_result = call_ai_analysis(denial, model=req.model)

    return QuickAnalysisResponse(
        claim_id=denial.claim_id,
        analysis=analysis_result,
        codes_analyzed=denial.denial_codes,
        timestamp=int(time.time())
    )

@app.post("/deep-analysis", response_model=DeepAnalysisResponse)
def deep_analysis(req: DeepAnalysisRequest):
    denial = req.denial_data
    provider_info = req.provider_info or {}
    
    analysis_result = call_deep_analysis(denial, provider_info, model=req.model)
    
    confidence = 75
    if denial.denial_reason_text and len(denial.denial_reason_text) > 200:
        confidence += 10
    if denial.cpt_codes:
        confidence += 5
    if denial.icd_codes:
        confidence += 5
    if provider_info:
        confidence += 5
    
    confidence = min(95, confidence)

    return DeepAnalysisResponse(
        claim_id=denial.claim_id,
        analysis=analysis_result,
        codes_analyzed=denial.denial_codes + denial.cpt_codes + denial.icd_codes,
        confidence_score=confidence,
        timestamp=int(time.time())
    )

@app.post("/paste-eob", response_model=QuickAnalysisResponse)
def analyze_pasted_eob(
    eob_text: str = Form(...),
    claim_id: Optional[str] = Form(None),
    payer: Optional[str] = Form(None),
    model: Optional[str] = Form(None)
):
    if not eob_text.strip():
        raise HTTPException(status_code=400, detail="No text provided")

    denial = DenialData(
        claim_id=claim_id or "PASTED_EOB",
        payer=payer or "Unknown",
        denial_reason_text=eob_text[:4000]
    )

    req = QuickAnalysisRequest(denial_data=denial, model=model)
    return quick_analysis(req)

@app.post("/generate-appeal-letter", response_model=AppealLetterResponse)
def generate_appeal(req: AppealLetterRequest):
    if not req.provider_info:
        raise HTTPException(
            status_code=400, 
            detail="Provider information is required for appeal letter generation"
        )
    
    required_fields = ["provider_name", "address", "phone"]
    missing_fields = [field for field in required_fields if field not in req.provider_info]
    if missing_fields:
        raise HTTPException(
            status_code=400,
            detail=f"Missing required provider information: {', '.join(missing_fields)}"
        )

    appeal_result = generate_appeal_letter(
        denial=req.denial_data,
        provider_info=req.provider_info,
        appeal_type=req.appeal_type,
        model=req.model
    )

    return AppealLetterResponse(
        claim_id=req.denial_data.claim_id,
        appeal_letter=appeal_result,
        generation_timestamp=int(time.time())
    )

@app.post("/feedback", response_model=FeedbackResponse)
def submit_feedback(req: FeedbackRequest):
    if not (1 <= req.rating <= 5):
        raise HTTPException(
            status_code=400,
            detail="Rating must be between 1 and 5 stars"
        )
    
    valid_endpoints = ["quick-analysis", "deep-analysis", "generate-appeal-letter", "paste-eob", "upload-era"]
    if req.endpoint_used not in valid_endpoints:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid endpoint. Must be one of: {', '.join(valid_endpoints)}"
        )

    feedback_id = len(feedback_storage) + 1
    feedback_entry = {
        "id": feedback_id,
        "endpoint_used": req.endpoint_used,
        "claim_id": req.claim_id,
        "rating": req.rating,
        "comments": req.comments,
        "user_type": req.user_type,
        "timestamp": int(time.time()),
        "date_submitted": datetime.now().isoformat()
    }
    
    feedback_storage.append(feedback_entry)

    return FeedbackResponse(
        message=f"Feedback received and will improve future {req.endpoint_used} responses!",
        feedback_id=feedback_id,
        timestamp=int(time.time())
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
