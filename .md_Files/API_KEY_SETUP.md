# 🔑 WHERE TO ADD YOUR FEATHERLESS API KEY

## Quick Answer

Your Featherless API key goes in the `.env` file at this line:

```
FEATHERLESS_API_KEY=your_api_key_here
```

Replace `your_api_key_here` with your actual API key from https://featherless.ai

---

## Step-by-Step Instructions

### 1. Get Your API Key

1. Go to: **https://featherless.ai**
2. Sign up or Log in
3. Navigate to your API Keys section
4. Copy your API key (looks like: `featherless_sk_abc123def456...`)

### 2. Open the .env File

```bash
# Navigate to backend directory
cd backend

# Open .env file with your text editor
# Windows: Open in Notepad, VS Code, etc.
# macOS/Linux: nano .env or vim .env
```

### 3. Find the Line

Look for this line in the `.env` file:

```
FEATHERLESS_API_KEY=your_featherless_api_key_here
```

### 4. Replace with Your Key

```
FEATHERLESS_API_KEY=featherless_sk_your_actual_key_here
```

### 5. Save the File

- Windows: `Ctrl+S`
- macOS/Linux: `Ctrl+S` or `:wq` (in vim)

### 6. Restart Backend

```bash
python main.py
```

---

## Example

**Before:**
```
FEATHERLESS_API_KEY=your_featherless_api_key_here
```

**After:**
```
FEATHERLESS_API_KEY=featherless_sk_abcd1234efgh5678ijkl9012mnop
```

---

## How the Backend Uses It

The backend uses your API key to:

1. **Authenticate** with Featherless AI API
2. **Run the Qwen2.5-7B model** for:
   - Autopsy report analysis
   - Evidence correlation detection
   - Investigation summaries

---

## If You Don't Have a Key Yet

1. Visit: https://featherless.ai
2. Sign up (free)
3. Get your API key from dashboard
4. Use it in .env

---

## Testing Your Setup

Once configured, test with:

```bash
# Health check
curl http://localhost:8000/health

# Should return:
# {"status": "healthy", "service": "ForensiAI Backend", ...}
```

---

## Common Issues

### "Invalid API Key"
- Double-check the key is copied correctly
- Ensure no extra spaces or quotes
- Restart backend after updating .env

### "Connection refused"
- Verify Featherless is working at https://featherless.ai
- Check your internet connection
- Backend has fallback mode - will work anyway

### Still not working?
- See backend/README.md for troubleshooting
- Check logs when running `python main.py`

---

## Alternative: Mock Mode (No API Key)

If you don't have a Featherless API key, the backend still works:

- Leave `FEATHERLESS_API_KEY=your_featherless_api_key_here`
- Backend will use fallback responses
- All endpoints functional
- Realistic mock forensic outputs

---

## That's It! 🎉

Your backend is ready to use once you add the API key!

```bash
cd backend && python main.py
```

Visit: http://localhost:8000/docs

---

**Questions?** Check backend/README.md or backend/SETUP.md
