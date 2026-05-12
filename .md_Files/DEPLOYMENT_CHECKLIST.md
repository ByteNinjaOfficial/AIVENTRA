# ✅ FORENSIAI DEPLOYMENT CHECKLIST

## Phase 1: Pre-Deployment (5 minutes)

- [ ] Clone/download ForensiAI repository
- [ ] Navigate to backend directory: `cd backend`
- [ ] Read QUICK_REFERENCE.md (5 min overview)
- [ ] Read SETUP.md (detailed instructions)
- [ ] Verify Python 3.8+ installed: `python --version`

## Phase 2: Environment Setup (5 minutes)

- [ ] Create virtual environment: `python -m venv venv`
- [ ] Activate virtual environment:
  - Windows: `venv\Scripts\activate`
  - macOS/Linux: `source venv/bin/activate`
- [ ] Upgrade pip: `pip install --upgrade pip`
- [ ] Install requirements: `pip install -r requirements.txt`
- [ ] Verify FastAPI installed: `pip list | grep fastapi`

## Phase 3: Configuration (3 minutes)

- [ ] Get Featherless API key from https://featherless.ai
- [ ] Copy template: `cp .env.example .env`
- [ ] Edit .env file:
  ```
  FEATHERLESS_API_KEY=your_api_key_here
  FEATHERLESS_BASE_URL=https://api.featherless.ai/v1
  MODEL_NAME=Qwen/Qwen2.5-7B-Instruct
  DATABASE_URL=sqlite:///./forensiai.db
  SQL_ECHO=false
  UPLOAD_DIR=uploads
  ENV=development
  DEBUG=true
  FRONTEND_URL=http://localhost:3000
  ```
- [ ] Save .env file

## Phase 4: Database Initialization (1 minute)

- [ ] Verify .env is configured correctly
- [ ] First run will auto-initialize SQLite database
- [ ] Confirm no errors during startup

## Phase 5: Backend Startup (2 minutes)

- [ ] Start backend: `python main.py`
- [ ] Verify output shows:
  ```
  ✓ Database initialized
  ✓ Upload directory ready
  ✓ Backend ready!
  ✓ API Docs: http://localhost:8000/docs
  ```
- [ ] No errors should appear

## Phase 6: Verification (3 minutes)

### Health Check
- [ ] Open browser: http://localhost:8000/docs
- [ ] See interactive API documentation (Swagger UI)
- [ ] Click "Try it out" on GET /health
- [ ] Execute and see: `{"status": "healthy", ...}`

### Test API
- [ ] Test endpoint: `curl http://localhost:8000/health`
- [ ] Should receive 200 response with JSON

## Phase 7: Quick Functional Test (5 minutes)

### Create Test Case
- [ ] Use http://localhost:8000/docs
- [ ] POST /cases with:
  ```json
  {
    "victim_name": "Test Subject",
    "incident_location": "Test Location",
    "incident_date": "2024-05-09",
    "notes": "Test case"
  }
  ```
- [ ] Copy returned `case_id`

### List Cases
- [ ] GET /cases
- [ ] Verify test case appears in list

### Get Case Details
- [ ] GET /cases/{case_id}
- [ ] Verify case information matches

## Phase 8: Evidence Upload Test (3 minutes)

### Create Test Evidence File
- [ ] Create file: `test_autopsy.txt`
- [ ] Add sample autopsy text:
  ```
  AUTOPSY REPORT
  Victim: Test Subject
  Cause of Death: Under Investigation
  Injuries: None observed
  Toxicology: None detected
  ```

### Upload Evidence
- [ ] Use http://localhost:8000/docs
- [ ] POST /cases/{case_id}/upload with:
  - file: test_autopsy.txt
  - file_type: autopsy
- [ ] Should get 200 response

### List Evidence
- [ ] GET /cases/{case_id}/evidence
- [ ] Verify file appears in list

## Phase 9: Analysis Pipeline Test (30 seconds setup)

### Trigger Analysis
- [ ] POST /cases/{case_id}/analyze with:
  ```json
  {
    "body_temperature": 31.5,
    "ambient_temperature": 22,
    "rigor_stage": "moderate"
  }
  ```
- [ ] Should get response: `{"status": "processing", ...}`

### Monitor Progress
- [ ] GET /cases/{case_id}/results (first check)
- [ ] Should return: `{"status": "processing", ...}`
- [ ] Wait 10-20 seconds
- [ ] GET /cases/{case_id}/results (second check)
- [ ] Should eventually return: `{"status": "complete", ...}`

## Phase 10: Results Verification (2 minutes)

### Get Timeline
- [ ] GET /cases/{case_id}/timeline
- [ ] Should return array of timeline events
- [ ] Verify events have timestamps and descriptions

### Get Report
- [ ] GET /cases/{case_id}/report
- [ ] Should return comprehensive report with:
  - Case information
  - Cause of death analysis
  - Timeline events
  - Risk assessment
  - Recommendations

## Phase 11: Frontend Integration (5 minutes)

- [ ] Set frontend API URL: `http://localhost:8000`
- [ ] In Next.js .env.local:
  ```
  NEXT_PUBLIC_API_URL=http://localhost:8000
  ```
- [ ] Verify frontend can:
  - [ ] Reach http://localhost:8000/health
  - [ ] Make POST request to create case
  - [ ] Upload files to backend
  - [ ] Trigger analysis
  - [ ] Fetch results

## Phase 12: Final Verification

- [ ] Backend running at http://localhost:8000
- [ ] API docs accessible at http://localhost:8000/docs
- [ ] Database file exists: forensiai.db
- [ ] Uploads directory exists: uploads/
- [ ] No error messages in console
- [ ] Health check passes
- [ ] Can create cases
- [ ] Can upload evidence
- [ ] Can trigger analysis
- [ ] Can retrieve reports
- [ ] CORS enabled for frontend
- [ ] All 8+ endpoints functional

## 🚀 DEPLOYMENT COMPLETE!

Your ForensiAI backend is:
- ✅ Fully configured
- ✅ Database initialized
- ✅ All endpoints working
- ✅ Ready for production
- ✅ Connected to Featherless AI
- ✅ Ready for frontend integration

---

## 📊 EXPECTED RESPONSE TIMES

| Operation | Time | Notes |
|-----------|------|-------|
| Health check | < 100ms | Instant |
| Create case | < 200ms | Synchronous |
| Upload file | < 500ms | Depends on file size |
| Start analysis | < 100ms | Returns immediately |
| Check status (pending) | < 100ms | Quick check |
| First analysis complete | 30-120s | First run slower |
| Fetch report | < 500ms | Database query |

## 🛠️ TROUBLESHOOTING QUICK FIXES

### Backend won't start?
```bash
# Verify Python version
python --version

# Reinstall requirements
pip install -r requirements.txt

# Check for syntax errors
python -m py_compile main.py
```

### Port 8000 in use?
```bash
# Find process
lsof -i :8000  # macOS/Linux
netstat -ano | findstr :8000  # Windows

# Kill process or use different port
uvicorn main:app --port 8001
```

### Featherless API failing?
```bash
# Verify .env has correct key
cat .env  # or type .env (Windows)

# Backend has fallback mode - service still works
# Check logs for actual error
```

### CORS errors from frontend?
- Backend auto-handles localhost:3000
- If different port, edit main.py CORS middleware
- Restart backend after changes

### Database issues?
```bash
# Delete and recreate
rm forensiai.db  # or del forensiai.db (Windows)
python main.py
```

---

## 📞 SUPPORT CONTACTS

**Can't find something?** Check these files in order:
1. backend/QUICK_REFERENCE.md (5-minute overview)
2. backend/SETUP.md (detailed setup guide)
3. backend/README.md (complete documentation)
4. backend/FRONTEND_INTEGRATION.md (frontend guide)
5. http://localhost:8000/docs (interactive API docs)

---

## ✨ DEPLOYMENT SUCCESS INDICATORS

You'll know deployment is successful when:

1. ✅ `python main.py` runs without errors
2. ✅ http://localhost:8000/health returns 200 OK
3. ✅ http://localhost:8000/docs shows API documentation
4. ✅ Can create cases via POST /cases
5. ✅ Can upload evidence via POST /upload
6. ✅ Can start analysis via POST /analyze
7. ✅ Can fetch results via GET /results
8. ✅ Frontend can reach backend at http://localhost:8000

---

## 🎯 NEXT STEPS AFTER DEPLOYMENT

1. **Start building your Next.js frontend**
   - Use http://localhost:8000 as API base URL
   - Follow backend/FRONTEND_INTEGRATION.md

2. **Create demo cases with real data**
   - Upload actual autopsy reports (PDFs)
   - Add CCTV/GPS data (CSVs)
   - Test full analysis pipeline

3. **Customize risk rules**
   - Edit services/risk_engine.py
   - Add your own investigation rules

4. **Extend for production**
   - Switch to PostgreSQL for scale
   - Add authentication (JWT)
   - Implement rate limiting
   - Add comprehensive logging

---

**YOU'RE READY FOR THE HACKATHON! 🚀**

```bash
# One command to get started:
cd backend && python main.py
```

Then visit: http://localhost:8000/docs

Good luck! 🎉
