import { ReactElement } from 'react';
import { renderToHTML } from './renderToHTML';

export interface PDFExportOptions {
  filename?: string;
  title?: string;
  pageConfig?: {
    size?: 'A3' | 'A4' | 'A5' | 'letter' | 'legal';
    orientation?: 'portrait' | 'landscape';
  };
}

/**
 * Export a React component to PDF using server-side rendering
 * This method provides high-quality, consistent PDF output by using Playwright/Chromium
 * @param component - The React component to export
 * @param options - Export options
 */
export async function exportReportToPDF(
  component: ReactElement,
  options: PDFExportOptions = {}
): Promise<void> {
  const {
    filename = 'subscription-report.pdf',
    pageConfig = { size: 'A4', orientation: 'landscape' },
  } = options;

  try {
    console.log('Rendering React component to HTML...');

    // Render React component to HTML string
    const htmlContent = renderToHTML(component);

    console.log('Sending HTML to PDF generation service...');

    // Call Netlify Function to generate PDF
    const response = await fetch('/.netlify/functions/generate-pdf', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        html: htmlContent,
        pageConfig,
        filename,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to generate PDF');
    }

    console.log('PDF generated successfully, downloading...');

    // Get PDF blob from response
    const blob = await response.blob();

    // Create download link and trigger download
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    console.log('PDF downloaded successfully');
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw error;
  }
}

/**
 * Generate filename with current date
 */
export function generatePDFFilename(baseName: string = 'subscription-report'): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');

  return `${baseName}-${year}${month}${day}-${hours}${minutes}.pdf`;
}
