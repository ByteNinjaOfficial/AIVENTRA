# ForensiAI SETUP INSTRUCTIONS

## STEP 1: Get Your Featherless API Key

ForensiAI uses Featherless AI for running the Qwen2.5-7B model locally.

### Quick Setup:

1. Go to: https://featherless.ai
2. Sign up / Log in
3. Navigate to API Keys section
4. Copy your API key

Example key format:
```
featherless_sk_abcdef123456789...
```

## STEP 2: Configure Backend

### Windows:
```bash
cd backend
cp .env.example .env
# Edit .env with your text editor
# Find: FEATHERLESS_API_KEY=your_featherless_api_key_here
# Replace with your actual API key
```

### macOS/Linux:
```bash
cd backend
cp .env.example .env
nano .env  # or vim .env
# Add your FEATHERLESS_API_KEY
```

## STEP 3: Install Dependencies

```bash
cd backend
python -m venv venv

# Windows:
venv\Scripts\activate

# macOS/Linux:
source venv/bin/activate

pip install -r requirements.txt
```

## STEP 4: Start Backend

### Option A: Quick Start (Windows)
```bash
cd backend
start.bat
```

### Option B: Quick Start (macOS/Linux)
```bash
cd backend
chmod +x start.sh
./start.sh
```

### Option C: Manual Start
```bash
cd backend
python main.py
```

## STEP 5: Verify Backend is Running

Open browser: **http://localhost:8000/docs**

You should see the interactive API documentation.

## STEP 6: Test with Sample Request

### Using cURL:
```bash
curl http://localhost:8000/health
```

### Using Python:
```python
import requests
response = requests.get("http://localhost:8000/health")
print(response.json())
```

### Expected Response:
```json
{
  "status": "healthy",
  "service": "ForensiAI Backend",
  "version": "1.0.0"
}
```

## STEP 7: Create Your First Case

### Using API Docs (Recommended):
1. Go to http://localhost:8000/docs
2. Click "Try it out" on POST /cases
3. Enter sample data:
```json
{
  "victim_name": "John Doe",
  "incident_location": "123 Main Street",
  "incident_date": "2024-05-09",
  "notes": "Test case for demo"
}
```
4. Click "Execute"
5. Copy the `case_id` from response

### Using cURL:
```bash
curl -X POST http://localhost:8000/cases \
  -H "Content-Type: application/json" \
  -d '{
    "victim_name": "John Doe",
    "incident_location": "123 Main Street",
    "incident_date": "2024-05-09",
    "notes": "Test case"
  }'
```

## STEP 8: Upload Sample Evidence

Create a sample autopsy report (simple text file):

**autopsy_report.txt:**
```
AUTOPSY REPORT
==============

Victim: John Doe
Age: 45
Gender: Male

FINDINGS:
- Multiple blunt force injuries to head and torso
- Severe contusions indicating violent trauma
- Evidence of defensive wounds on hands
- Toxicology: Presence of alcohol (0.15%)

CAUSE OF DEATH:
Traumatic brain injury secondary to blunt force trauma

CONCLUSION:
Deceased died from injuries sustained in violent confrontation.
```

Upload using API Docs or cURL:

```bash
curl -X POST http://localhost:8000/cases/CASE-abc123/upload \
  -F "file=@autopsy_report.txt" \
  -F "file_type=autopsy"
```

## STEP 9: Start Analysis

```bash
curl -X POST http://localhost:8000/cases/CASE-abc123/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "body_temperature": 31.2,
    "ambient_temperature": 24,
    "rigor_stage": "moderate"
  }'
```

Response:
```json
{
  "status": "processing",
  "case_id": "CASE-abc123",
  "message": "Forensic analysis pipeline started..."
}
```

## STEP 10: Poll for Results

```bash
curl http://localhost:8000/cases/CASE-abc123/results
```

Check every 5-10 seconds until you see:
```json
{
  "status": "complete",
  "case_id": "CASE-abc123",
  "results_ready": true
}
```

## STEP 11: Get Full Report

```bash
curl http://localhost:8000/cases/CASE-abc123/report
```

This returns comprehensive investigation report with:
- Case information
- Autopsy findings
- Timeline reconstruction
- Risk assessment
- Recommendations

## STEP 12: Connect Frontend

ForensiAI Next.js frontend should:

1. Configure API URL: `http://localhost:8000`
2. Make requests as documented
3. Poll `/results` endpoint for analysis status
4. Display report from `/report` endpoint

## Troubleshooting

### Backend won't start
- Check Python version: `python --version` (need 3.8+)
- Verify dependencies: `pip list | grep fastapi`
- Check port 8000 is free: `lsof -i :8000` (macOS/Linux)

### Featherless API key error
- Double-check key is correct in .env
- Ensure no extra spaces or quotes
- Restart backend after editing .env

### CORS errors from frontend
- Backend automatically handles localhost:3000
- If frontend on different port, edit main.py CORS settings

### Analysis takes too long
- First run initializes models (may take 1-2 mins)
- Subsequent runs are faster
- Check logs for actual errors

### Database errors
- Delete `forensiai.db` and restart
- This will create fresh database

## Environment Variables Explained

```
# Your Featherless API credentials
FEATHERLESS_API_KEY=your_key_here              # REQUIRED
FEATHERLESS_BASE_URL=https://api.featherless.ai/v1

# Model to use
MODEL_NAME=Qwen/Qwen2.5-7B-Instruct            # Best for forensics

# SQLite database location
DATABASE_URL=sqlite:///./forensiai.db
SQL_ECHO=false                                  # Show SQLAlchemy SQL logs

# File uploads
UPLOAD_DIR=uploads                              # Local directory
MAX_UPLOAD_SIZE_MB=50                          # Max file size

# Development settings
ENV=development                                # development|production
DEBUG=true                                     # Enable debug logging

# Frontend URL
FRONTEND_URL=http://localhost:3000             # For CORS
```

## File Type Reference

When uploading evidence, use these file_type values:

- **autopsy** - Autopsy reports (PDF, TXT)
- **cctv** - CCTV logs and video metadata (CSV, JSON)
- **gps** - GPS tracking data (CSV, JSON)
- **metadata** - Mobile phone / device metadata (JSON, CSV)
- **image** - Scene photos or other images

## API Quick Reference

```
POST   /cases                   Create case
GET    /cases                   List cases
GET    /cases/{id}              Get case details
PUT    /cases/{id}              Update case
POST   /cases/{id}/upload       Upload evidence
GET    /cases/{id}/evidence     List evidence
POST   /cases/{id}/analyze      Start analysis
GET    /cases/{id}/results      Check analysis status
GET    /cases/{id}/timeline     Get timeline
GET    /cases/{id}/report       Get final report
GET    /health                  Health check
GET    /                        Root/docs
```

## Support

Backend is production-ready for:
- ✅ Local deployment (no K8s, Docker optional)
- ✅ Multi-case handling
- ✅ Parallel evidence uploads
- ✅ Real-time analysis status
- ✅ Comprehensive reporting
- ✅ Extensible architecture

For questions, check API documentation at: **http://localhost:8000/docs**

---

**YOU'RE READY TO RUN FORENSIAI! 🚀**

Next step: Connect your Next.js frontend!
