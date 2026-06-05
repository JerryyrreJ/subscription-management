# Quick Start: PDF Generation Testing

## 🚀 Test Locally (Recommended)

### Step 1: Install Netlify CLI
```bash
npm install -g netlify-cli
```

### Step 2: Start Dev Server
```bash
netlify dev
```

This will:
- Start Vite on port 5173
- Start Netlify Functions
- Proxy everything through http://localhost:8888

### Step 3: Test PDF Generation
1. Open **http://localhost:8888** (NOT port 5173!)
2. Add some test subscriptions if you don't have any
3. Click "Advanced Report" button in the header
4. Wait for report to load
5. Click "Export PDF Report" button
6. PDF should download within 3-5 seconds

### Expected Behavior
- ✅ Button shows "Generating PDF..." with spinner
- ✅ Console logs: "Rendering React component to HTML..."
- ✅ Console logs: "Sending HTML to PDF generation service..."
- ✅ Console logs: "PDF generated successfully, downloading..."
- ✅ PDF file downloads automatically

### Troubleshooting Local Testing

**Issue**: Port 8888 already in use
```bash
# Kill the process using port 8888
lsof -ti:8888 | xargs kill -9
netlify dev
```

**Issue**: Function fails with "Chromium not found"
```bash
# Reinstall Chromium package
npm install @sparticuz/chromium
```

**Issue**: PDF generation times out
- Check Netlify Function logs in terminal
- First generation may take 5-10 seconds (cold start)
- Subsequent generations should be 1-3 seconds

## 📦 Deploy to Production

### Step 1: Commit Changes
```bash
git add .
git commit -m "Upgrade PDF generation to Playwright"
git push
```

### Step 2: Wait for Netlify Build
- Go to your Netlify dashboard
- Wait for build to complete (~2-3 minutes)
- Check build logs for any errors

### Step 3: Test in Production
1. Open your production URL
2. Navigate to Advanced Report
3. Click "Export PDF Report"
4. Verify PDF downloads correctly

## 🔍 Verify Installation

### Check Dependencies
```bash
npm list playwright-core @sparticuz/chromium
```

Expected output:
```
├── @sparticuz/chromium@...
└── playwright-core@...
```

### Check Files Exist
```bash
ls -la netlify/functions/generate-pdf.ts
ls -la src/utils/renderToHTML.ts
ls -la src/utils/pdfExport.ts
```

### Test Build
```bash
npm run build
```

Should complete without errors.

## 📝 Common Commands

```bash
# Local development (Vite only - NO FUNCTIONS)
npm run dev

# Local development (WITH FUNCTIONS) - RECOMMENDED
netlify dev

# Build for production
npm run build

# Preview production build
npm run preview

# Check for linting errors
npm run lint
```

## 🎯 Quick Checklist

Before testing:
- [ ] `playwright-core` installed
- [ ] `@sparticuz/chromium` installed
- [ ] Old dependencies removed (`jspdf`, `html2canvas`)
- [ ] `netlify dev` running
- [ ] Accessing http://localhost:8888 (not 5173)

If PDF generation fails:
1. Check console for error messages
2. Check terminal for Netlify Function logs
3. Verify you're using port 8888
4. Try restarting `netlify dev`
5. Check `PDF_GENERATION_SETUP.md` for detailed troubleshooting

## 💡 Pro Tips

- **Always use `netlify dev`** for testing functions locally
- **Cold start** may take 3-5 seconds, this is normal
- **Check function logs** in terminal for debugging
- **PDF size** should be 200-500KB typically
- **Generation time** should be 1-3 seconds after cold start

## 🆘 Need Help?

1. Check `PDF_GENERATION_SETUP.md` for detailed setup
2. Check `PDF_GENERATION_SUMMARY.md` for architecture overview
3. Check Netlify Function logs for specific errors
4. Verify all dependencies are installed correctly

---

**Ready to test?** Run `netlify dev` and open http://localhost:8888! 🎉
