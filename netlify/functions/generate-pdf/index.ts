import { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import { chromium } from 'playwright-core';
import chromiumPkg from '@sparticuz/chromium';

interface GeneratePDFRequest {
  html: string;
  pageConfig?: {
    size?: 'A3' | 'A4' | 'A5' | 'letter' | 'legal';
    orientation?: 'portrait' | 'landscape';
  };
  filename?: string;
}

export const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const body: GeneratePDFRequest = JSON.parse(event.body || '{}');
    const { html, pageConfig = {}, filename = 'report.pdf' } = body;

    if (!html) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'HTML content is required' }),
      };
    }

    console.log('Generating PDF with config:', pageConfig);

    // Get Chromium executable path for serverless environment
    const executablePath = await chromiumPkg.executablePath();

    // Launch Chromium browser with serverless-optimized settings
    const browser = await chromium.launch({
      args: chromiumPkg.args,
      executablePath: executablePath,
      headless: chromiumPkg.headless,
    });

    try {
      const page = await browser.newPage();

      // Set content with base URL for relative paths
      await page.setContent(html, {
        waitUntil: 'networkidle',
      });

      // Generate PDF with configuration
      const pdfBuffer = await page.pdf({
        printBackground: true,
        format: pageConfig.size || 'A4',
        landscape: pageConfig.orientation === 'landscape',
        margin: {
          top: '0',
          right: '0',
          bottom: '0',
          left: '0',
        },
      });

      await browser.close();

      // Return PDF as base64
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
        body: pdfBuffer.toString('base64'),
        isBase64Encoded: true,
      };
    } catch (error) {
      await browser.close();
      throw error;
    }
  } catch (error) {
    console.error('PDF generation error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to generate PDF',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
};
