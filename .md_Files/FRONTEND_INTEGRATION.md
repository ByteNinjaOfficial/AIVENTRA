# Frontend Integration Guide - ForensiAI

## 🎯 Quick Integration Steps

### 1. Base URL Configuration

In your Next.js frontend, set the API base URL:

```javascript
// lib/api-client.ts or similar
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export const apiClient = {
  async post(endpoint, body) {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return response.json();
  },
  
  async get(endpoint) {
    const response = await fetch(`${API_BASE_URL}${endpoint}`);
    return response.json();
  }
};
```

### 2. Create Case

```javascript
// Create investigation case
const createCase = async (caseData) => {
  const response = await apiClient.post('/cases', {
    victim_name: caseData.victimName,
    incident_location: caseData.location,
    incident_date: caseData.date,
    notes: caseData.notes
  });
  
  return response; // Contains: id, case_id, status, risk_level, etc.
};
```

### 3. Upload Evidence

```javascript
// Upload evidence file
const uploadEvidence = async (caseId, file, fileType) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('file_type', fileType); // 'autopsy', 'cctv', 'gps', etc.
  
  const response = await fetch(
    `${API_BASE_URL}/cases/${caseId}/upload`,
    {
      method: 'POST',
      body: formData
    }
  );
  
  return response.json();
};
```

### 4. Start Analysis

```javascript
// Trigger forensic analysis pipeline
const startAnalysis = async (caseId, todInput) => {
  const response = await apiClient.post(
    `/cases/${caseId}/analyze`,
    {
      body_temperature: todInput.bodyTemp,
      ambient_temperature: todInput.ambientTemp,
      rigor_stage: todInput.rigorStage
    }
  );
  
  return response; // { status: 'processing', ... }
};
```

### 5. Poll for Results

```javascript
// Poll until analysis is complete
const pollResults = async (caseId, maxAttempts = 120) => {
  for (let i = 0; i < maxAttempts; i++) {
    const response = await apiClient.get(`/cases/${caseId}/results`);
    
    if (response.status === 'complete') {
      return response;
    }
    
    // Wait 5 seconds before next poll
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  
  throw new Error('Analysis timeout');
};
```

### 6. Get Timeline

```javascript
// Fetch reconstructed timeline
const getTimeline = async (caseId) => {
  const response = await apiClient.get(`/cases/${caseId}/timeline`);
  
  // response.events is array of timeline events
  return response.events.map(event => ({
    timestamp: event.timestamp,
    source: event.source,
    event: event.event,
    severity: event.severity
  }));
};
```

### 7. Get Final Report

```javascript
// Fetch comprehensive investigation report
const getReport = async (caseId) => {
  const response = await apiClient.get(`/cases/${caseId}/report`);
  
  return {
    caseId: response.case_id,
    victim: response.victim_name,
    location: response.incident_location,
    date: response.incident_date,
    summary: response.summary,
    causeOfDeath: response.cause_of_death,
    injuries: response.injuries,
    timeline: response.timeline,
    riskLevel: response.risk_level,
    riskScore: response.risk_score,
    flags: response.flags,
    recommendations: response.recommendations
  };
};
```

## 📊 Complete Workflow Example

```javascript
// Complete investigation workflow
async function runInvestigation() {
  try {
    // Step 1: Create case
    const newCase = await createCase({
      victimName: 'Jane Doe',
      location: '456 Oak Avenue',
      date: '2024-05-09',
      notes: 'Traffic incident investigation'
    });
    
    const caseId = newCase.case_id;
    console.log('Case created:', caseId);
    
    // Step 2: Upload autopsy report
    const autopsyFile = document.getElementById('autopsy-upload').files[0];
    await uploadEvidence(caseId, autopsyFile, 'autopsy');
    console.log('Autopsy report uploaded');
    
    // Step 3: Upload CCTV data (if available)
    const cctvFile = document.getElementById('cctv-upload').files[0];
    if (cctvFile) {
      await uploadEvidence(caseId, cctvFile, 'cctv');
      console.log('CCTV data uploaded');
    }
    
    // Step 4: Start analysis with TOD parameters
    await startAnalysis(caseId, {
      bodyTemp: 31.5,
      ambientTemp: 22,
      rigorStage: 'moderate'
    });
    console.log('Analysis started');
    
    // Step 5: Poll for completion (show progress bar)
    while (true) {
      const status = await apiClient.get(`/cases/${caseId}/results`);
      
      if (status.status === 'complete') {
        console.log('Analysis complete!');
        break;
      }
      
      // Update UI with "Processing..." status
      updateProgressUI(status);
      
      await new Promise(r => setTimeout(r, 3000));
    }
    
    // Step 6: Fetch timeline
    const timeline = await getTimeline(caseId);
    displayTimeline(timeline);
    
    // Step 7: Fetch final report
    const report = await getReport(caseId);
    displayReport(report);
    
  } catch (error) {
    console.error('Investigation failed:', error);
    showErrorMessage(error.message);
  }
}
```

## 🎨 UI Component Integration

### Case Creation Form

```typescript
interface CreateCaseForm {
  victimName: string;
  incidentLocation: string;
  incidentDate: string;
  notes?: string;
}

// Send to backend
POST /cases
```

### Evidence Upload Component

```typescript
interface EvidenceUpload {
  caseId: string;
  file: File;
  fileType: 'autopsy' | 'cctv' | 'gps' | 'metadata' | 'image';
}

// Send to backend
POST /cases/{caseId}/upload
```

### Analysis Parameters Form

```typescript
interface AnalysisParameters {
  bodyTemperature?: number;      // Celsius
  ambientTemperature?: number;   // Celsius
  rigorStage?: 'early' | 'moderate' | 'full';
}

// Send to backend
POST /cases/{caseId}/analyze
```

## 🔄 Status Polling Strategy

```javascript
// Recommended polling implementation
async function pollWithBackoff(caseId) {
  const maxAttempts = 120; // 10 minutes with 5s intervals
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    const { status } = await apiClient.get(`/cases/${caseId}/results`);
    
    switch (status) {
      case 'processing':
        // Still running - wait and retry
        console.log(`[${attempts}/${maxAttempts}] Still processing...`);
        await sleep(5000);
        attempts++;
        break;
        
      case 'complete':
        // Analysis done - fetch results
        return await getReport(caseId);
        
      case 'failed':
        throw new Error('Analysis pipeline failed');
        
      default:
        throw new Error(`Unknown status: ${status}`);
    }
  }
  
  throw new Error('Analysis timeout - exceeded 10 minutes');
}
```

## 📱 React Hook Example

```typescript
// useForensicAnalysis.ts
import { useState, useCallback } from 'react';

export function useForensicAnalysis() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [case, setCase] = useState(null);
  const [report, setReport] = useState(null);
  
  const createCase = useCallback(async (data) => {
    setLoading(true);
    try {
      const result = await apiClient.post('/cases', data);
      setCase(result);
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);
  
  const startAnalysis = useCallback(async (caseId, todData) => {
    setLoading(true);
    try {
      // Start analysis
      await apiClient.post(`/cases/${caseId}/analyze`, todData);
      
      // Poll for results
      let status = 'processing';
      while (status !== 'complete') {
        const result = await apiClient.get(`/cases/${caseId}/results`);
        status = result.status;
        
        if (status !== 'complete') {
          await new Promise(r => setTimeout(r, 5000));
        }
      }
      
      // Fetch report
      const reportData = await apiClient.get(`/cases/${caseId}/report`);
      setReport(reportData);
      
      return reportData;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);
  
  return { createCase, startAnalysis, loading, error, case: case, report };
}

// Usage in component
function InvestigationPage() {
  const { createCase, startAnalysis, loading, report } = useForensicAnalysis();
  
  return (
    <div>
      {loading && <LoadingSpinner />}
      {report && <ReportDisplay report={report} />}
    </div>
  );
}
```

## ⚙️ Environment Configuration

Add to Next.js `.env.local`:

```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Then use:

```javascript
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
```

## 🚀 Deployment Notes

### Local Development
- Backend: http://localhost:8000
- Frontend: http://localhost:3000
- Both run simultaneously

### Production
- Backend deployed to API server
- Frontend deployed to static host
- Update `NEXT_PUBLIC_API_URL` to production API URL
- Ensure CORS headers match production domain

## ✅ Testing Integration

```bash
# Test backend health
curl http://localhost:8000/health

# Test CORS from frontend
fetch('http://localhost:8000/health')
  .then(r => r.json())
  .then(console.log)
```

## 📚 Full API Documentation

Available at: **http://localhost:8000/docs**

Interactive Swagger UI for all endpoints with try-it-out functionality.

---

**Backend is ready! Connect your frontend and go! 🚀**
