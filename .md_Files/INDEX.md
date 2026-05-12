# 📋 ForensiAI Project Index

## 🎯 START HERE

1. **Read**: [QUICK_REFERENCE.md](QUICK_REFERENCE.md) (5 min)
2. **Setup**: Follow [backend/SETUP.md](backend/SETUP.md) (10 min)
3. **Run**: Execute `cd backend && python main.py`
4. **Access**: http://localhost:8000/docs
5. **Integrate**: Read [backend/FRONTEND_INTEGRATION.md](backend/FRONTEND_INTEGRATION.md)

---

## 📚 DOCUMENTATION STRUCTURE

### Project Level
```
├── QUICK_REFERENCE.md              ← START HERE (5 min)
├── BUILD_SUMMARY.md                Complete project overview
└── INDEX.md                        This file
```

### Backend
```
backend/
├── README.md                       Backend features & APIs
├── SETUP.md                        Installation & configuration
├── FRONTEND_INTEGRATION.md         Frontend connection guide
├── main.py                         Main FastAPI application
├── config.py                       Configuration management
├── database.py                     Database setup
├── models.py                       SQLAlchemy models (6 tables)
├── requirements.txt                Python dependencies
└── .env.example                    Environment template
```

---

## 🗂️ BACKEND FILE STRUCTURE

### Application Core (4 files)
```
main.py              FastAPI application with route setup
config.py            Pydantic settings & configuration
database.py          SQLAlchemy engine, session, models base
models.py            Database models (6 tables)
```

### Routes (6 modules, 8+ endpoints)
```
routes/
├── cases.py         POST/GET/PUT /cases
├── upload.py        POST /cases/{id}/upload
├── analysis.py      POST /cases/{id}/analyze (main pipeline)
├── results.py       GET /cases/{id}/results, /report
├── timeline.py      GET /cases/{id}/timeline
└── reports.py       GET /health, GET /
```

### AI Agents (3 CrewAI modules)
```
agents/
├── autopsy_agent.py       Analyze autopsy reports
├── correlation_agent.py   Find suspicious patterns
└── summary_agent.py       Generate investigation summary
```

### Services (7 business logic modules)
```
services/
├── pdf_parser.py          Extract text from PDF files
├── csv_parser.py          Parse CSV/tabular data
├── metadata_parser.py     Extract JSON metadata
├── timeline_engine.py     Reconstruct investigation timeline (deterministic)
├── tod_calculator.py      Calculate time of death (deterministic)
├── risk_engine.py         Assess investigation risk (deterministic)
└── report_generator.py    Generate final investigation report
```

### Data Models (4 Pydantic schemas)
```
schemas/
├── case_schema.py         Case CRUD operations
├── evidence_schema.py     Evidence upload & retrieval
├── result_schema.py       Timeline & report responses
└── tod_schema.py          Time of Death input/output
```

### Utilities (2 modules)
```
utils/
├── logger.py              Structured logging
└── helpers.py             Helper functions (UUID, JSON, timestamps)
```

### Configuration
```
requirements.txt           All Python dependencies
.env.example              Environment variables template
start.bat                 Windows startup script
start.sh                  macOS/Linux startup script
```

---

## 🚀 QUICK START COMMANDS

### Setup (One-time)
```bash
cd backend
python -m venv venv
venv\Scripts\activate  # Windows
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your FEATHERLESS_API_KEY
```

### Run Backend
```bash
cd backend
python main.py
```

### Access API
```
Browser: http://localhost:8000/docs
cURL:    curl http://localhost:8000/health
```

---

## 📡 API ENDPOINTS REFERENCE

### Case Management (4 endpoints)
```
POST   /cases                    Create case
GET    /cases                    List all cases
GET    /cases/{case_id}          Get case details
PUT    /cases/{case_id}          Update case notes
```

### Evidence Management (2 endpoints)
```
POST   /cases/{case_id}/upload   Upload evidence file
GET    /cases/{case_id}/evidence List evidence files
```

### Analysis (1 endpoint)
```
POST   /cases/{case_id}/analyze  Start forensic analysis pipeline
```

### Results (3 endpoints)
```
GET    /cases/{case_id}/results  Check analysis status
GET    /cases/{case_id}/timeline Get reconstructed timeline
GET    /cases/{case_id}/report   Get final investigation report
```

### Health (2 endpoints)
```
GET    /health                   Health check
GET    /                         API root & documentation link
```

---

## 🔄 ANALYSIS PIPELINE (8 Stages)

```
1. PARSE EVIDENCE
   ├─ PDF extraction (pdfplumber)
   ├─ CSV parsing (pandas)
   └─ JSON metadata extraction

2. NORMALIZE DATA
   └─ Standardize timestamps, formats

3. TIME OF DEATH ENGINE (DETERMINISTIC)
   ├─ Algor mortis calculation
   ├─ Rigor mortis stage analysis
   └─ Confidence scoring

4. TIMELINE RECONSTRUCTION (DETERMINISTIC)
   ├─ Remove duplicates
   ├─ Sort chronologically
   ├─ Merge related events
   └─ Generate unified timeline

5. AUTOPSY AGENT (CrewAI)
   ├─ Analyze autopsy report text
   ├─ Extract injuries
   ├─ Extract toxicology
   └─ Determine cause of death

6. CORRELATION AGENT (CrewAI)
   ├─ Analyze evidence correlations
   ├─ Identify anomalies
   └─ Detect suspicious patterns

7. RISK ENGINE (DETERMINISTIC)
   ├─ Evaluate 8 risk rules
   ├─ Calculate risk score
   └─ Classify risk level (LOW/MEDIUM/HIGH)

8. SUMMARY AGENT (CrewAI)
   ├─ Generate investigation summary
   ├─ Provide recommendations
   └─ Synthesize findings

OUTPUT: Complete investigation report with timeline, risk assessment, and AI insights
```

---

## 💾 DATABASE SCHEMA

### Case Table
```
- id (PK)
- case_id (unique)
- victim_name
- incident_location
- incident_date
- notes
- status (pending/processing/completed/failed)
- risk_level (LOW/MEDIUM/HIGH)
- risk_score (0-100)
- created_at, updated_at
```

### Evidence Table
```
- id (PK)
- case_id (FK)
- file_type (autopsy/cctv/gps/metadata/image)
- file_name
- file_path
- processed (boolean)
- uploaded_at
```

### TimelineEvent Table
```
- id (PK)
- case_id (FK)
- timestamp
- source (cctv/gps/metadata/autopsy/ai)
- event
- severity (low/medium/high)
- metadata_json
- created_at
```

### AIResult Table
```
- id (PK)
- case_id (FK)
- agent_name (autopsy_agent/correlation_agent/summary_agent)
- result_json
- created_at
```

### RiskFlag Table
```
- id (PK)
- case_id (FK)
- flag_name
- description
- score
- created_at
```

---

## 🔐 FRONTEND INTEGRATION

### Base URL
```javascript
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
```

### Example: Create Case
```javascript
const response = await fetch(`${API_BASE}/cases`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    victim_name: 'John Doe',
    incident_location: '123 Main St',
    incident_date: '2024-05-09'
  })
});
const newCase = await response.json();
```

### Example: Start Analysis
```javascript
await fetch(`${API_BASE}/cases/${caseId}/analyze`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    body_temperature: 31.5,
    ambient_temperature: 22,
    rigor_stage: 'moderate'
  })
});
```

### Example: Poll Results
```javascript
let complete = false;
while (!complete) {
  const res = await fetch(`${API_BASE}/cases/${caseId}/results`);
  const status = await res.json();
  if (status.status === 'complete') complete = true;
  else await new Promise(r => setTimeout(r, 5000)); // Wait 5s
}
```

See [backend/FRONTEND_INTEGRATION.md](backend/FRONTEND_INTEGRATION.md) for complete guide!

---

## ⚙️ CONFIGURATION

### Environment Variables
```
FEATHERLESS_API_KEY     Your API key from https://featherless.ai
FEATHERLESS_BASE_URL    API endpoint (default: https://api.featherless.ai/v1)
MODEL_NAME              LLM to use (default: Qwen/Qwen2.5-7B-Instruct)
DATABASE_URL            SQLite path (default: sqlite:///./forensiai.db)
UPLOAD_DIR              Upload directory (default: uploads)
MAX_UPLOAD_SIZE_MB      Max file size (default: 50)
ENV                     Environment (development/production)
DEBUG                   Debug mode (true/false)
FRONTEND_URL            Frontend URL for CORS
```

---

## 📦 DEPENDENCIES

### Core
- **fastapi** - Web framework
- **uvicorn** - ASGI server
- **sqlalchemy** - ORM
- **pydantic** - Data validation

### AI/ML
- **crewai** - Agent orchestration
- **litellm** - LLM interface
- **pydantic** - Data models

### File Processing
- **pdfplumber** - PDF extraction
- **pandas** - Data manipulation

### Utilities
- **python-dotenv** - Environment variables
- **python-multipart** - File uploads
- **aiofiles** - Async file operations
- **requests** - HTTP client

---

## 🧪 TESTING

### Health Check
```bash
curl http://localhost:8000/health
```

### API Documentation
```
http://localhost:8000/docs
```

### Test Workflow
See [backend/SETUP.md](backend/SETUP.md) for complete testing guide!

---

## 🐛 TROUBLESHOOTING

### Issue: Port 8000 in use
**Solution**: Use different port or kill existing process
```bash
lsof -i :8000 | grep LISTEN | awk '{print $2}' | xargs kill -9
# or use different port:
uvicorn main:app --port 8001
```

### Issue: Missing dependencies
**Solution**: Reinstall requirements
```bash
pip install --upgrade -r requirements.txt
```

### Issue: Database locked
**Solution**: Delete and recreate database
```bash
rm forensiai.db
python main.py
```

### Issue: Featherless API fails
**Solution**: Check key in .env, backend has fallback mode

See [backend/README.md](backend/README.md) for more troubleshooting!

---

## 📞 SUPPORT RESOURCES

| Resource | Link/Location |
|----------|--|
| API Documentation (Interactive) | http://localhost:8000/docs |
| Backend README | backend/README.md |
| Setup Guide | backend/SETUP.md |
| Frontend Integration | backend/FRONTEND_INTEGRATION.md |
| Build Summary | BUILD_SUMMARY.md |
| Quick Reference | QUICK_REFERENCE.md |
| This Index | INDEX.md |

---

## ✅ PROJECT STATUS

- ✅ Backend fully implemented (31 Python files)
- ✅ All 8+ API endpoints working
- ✅ Database models defined and initialized
- ✅ 3 CrewAI agents implemented
- ✅ 7 service engines for forensic analysis
- ✅ Comprehensive documentation
- ✅ Frontend integration guide
- ✅ Error handling & fallbacks
- ✅ Ready for production deployment

---

## 🚀 DEPLOYMENT CHECKLIST

- [ ] Install Python 3.8+
- [ ] Create virtual environment
- [ ] Install dependencies from requirements.txt
- [ ] Copy .env.example to .env
- [ ] Add Featherless API key to .env
- [ ] Start backend: `python main.py`
- [ ] Verify API at http://localhost:8000/docs
- [ ] Connect frontend to http://localhost:8000
- [ ] Test case creation and evidence upload
- [ ] Test analysis pipeline
- [ ] Verify report generation

---

## 🎯 NEXT STEPS

1. **Read [QUICK_REFERENCE.md](QUICK_REFERENCE.md)** (5 minutes)
2. **Follow [backend/SETUP.md](backend/SETUP.md)** (10 minutes)
3. **Start backend**: `python main.py`
4. **Read [backend/FRONTEND_INTEGRATION.md](backend/FRONTEND_INTEGRATION.md)**
5. **Connect your Next.js frontend**

---

**ForensiAI Backend - Ready for Production! 🚀**

Built for 24-hour hackathon deployment. All systems operational.

Last Updated: 2024-05-09
