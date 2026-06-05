# PDF Generation Setup Guide

This document explains the new PDF generation system using Playwright and Netlify Functions.

## Architecture

The PDF generation system consists of three main components:

1. **Frontend** (`src/utils/pdfExport.ts`): Renders React components to HTML using React SSR
2. **Netlify Function** (`netlify/functions/generate-pdf.ts`): Uses Playwright to convert HTML to PDF
3. **Serverless Chromium** (`@sparticuz/chromium`): Optimized Chromium binary for AWS Lambda/Netlify

### Workflow

```
React Component → SSR to HTML → Netlify Function → Playwright + Chromium → PDF
```

## Dependencies

- `playwright-core`: Playwright browser automation (without bundled browsers)
- `@sparticuz/chromium`: Serverless-optimized Chromium binary
- `react-dom`: For server-side rendering

## Local Development

### Testing the PDF Generation Locally

To test PDF generation locally, you need to:

1. **Install Netlify CLI** (if not already installed):
   ```bash
   npm install -g netlify-cli
   ```

2. **Run Netlify Dev Server**:
   ```bash
   netlify dev
   ```

   This will:
   - Start the Vite dev server on port 5173
   - Start Netlify Functions on `/.netlify/functions/*`
   - Proxy everything through localhost:8888

3. **Access the App**:
   - Open http://localhost:8888 (not port 5173!)
   - Navigate to Advanced Report
   - Click "Export PDF Report"

### Important Notes for Local Testing

- **DO NOT** use `npm run dev` for testing PDF generation
- You MUST use `netlify dev` to test Netlify Functions locally
- The function endpoint is `/.netlify/functions/generate-pdf`

## Deployment to Netlify

### Environment Configuration

No additional environment variables are required for PDF generation. The system uses:
- `@sparticuz/chromium` package which downloads Chromium on-demand
- Netlify's Node.js 18 runtime

### Build Configuration

The `netlify.toml` file is already configured:

```toml
[build]
  command = "npm run build"
  publish = "dist"
  functions = "netlify/functions"

[build.environment]
  NODE_VERSION = "18"
```

### Deploy Steps

1. **Commit Changes**:
   ```bash
   git add .
   git commit -m "Add Playwright-based PDF generation"
   git push
   ```

2. **Netlify Auto-Deploy**:
   - Netlify will automatically detect the push and start building
   - The build process will install all dependencies including `@sparticuz/chromium`
   - Netlify Functions will be deployed automatically

3. **Verify Deployment**:
   - Go to your Netlify dashboard
   - Check build logs for any errors
   - Test PDF generation in production

## Troubleshooting

### Issue: "Failed to generate PDF"

**Possible Causes**:
1. Netlify Function timeout (default: 10 seconds, max: 26 seconds for Pro)
2. Memory limit exceeded
3. Chromium binary not found

**Solutions**:
1. Increase function timeout in `netlify.toml`:
   ```toml
   [functions]
     timeout = 26
   ```

2. Optimize PDF template to reduce complexity
3. Check Netlify function logs for detailed error messages

### Issue: "Chromium executable not found"

**Solution**: Ensure `@sparticuz/chromium` is installed correctly:
```bash
npm install @sparticuz/chromium
```

### Issue: PDF generation works locally but fails on Netlify

**Possible Causes**:
1. Different Node.js versions
2. Missing dependencies
3. Memory constraints

**Solution**: Check Netlify build logs and ensure all dependencies are installed

## Performance Considerations

- **Cold Start**: First PDF generation may take 3-5 seconds (Chromium initialization)
- **Warm Start**: Subsequent requests are faster (1-2 seconds)
- **File Size**: Generated PDFs are typically 200-500KB
- **Function Duration**: Typically 2-4 seconds per PDF

## Future Improvements

- [ ] Add caching for frequently generated reports
- [ ] Implement progress indicators for long-running PDF generation
- [ ] Add support for multi-page reports
- [ ] Optimize Chromium startup time with warm containers
- [ ] Add PDF customization options (font size, colors, etc.)

## Comparison: Old vs New System

| Feature | Old (html2canvas) | New (Playwright) |
|---------|-------------------|------------------|
| **Quality** | Medium (raster) | High (vector) |
| **Consistency** | Variable | Exact |
| **Performance** | ~5 seconds | ~3 seconds |
| **Bundle Size** | +200KB | 0KB (serverless) |
| **Maintenance** | Manual positioning | Automatic layout |
| **Browser Support** | All | All (serverless) |

## References

- [Playwright Documentation](https://playwright.dev/)
- [@sparticuz/chromium](https://github.com/Sparticuz/chromium)
- [Netlify Functions](https://docs.netlify.com/functions/overview/)
- [React Server Components](https://react.dev/reference/react-dom/server)
