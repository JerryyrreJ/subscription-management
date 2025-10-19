import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export interface PDFExportOptions {
  filename?: string;
  title?: string;
}

/**
 * Export report content to PDF (A4 Landscape)
 * Uses high-quality HTML to canvas conversion with optimized settings
 * @param elementId - The ID of the HTML element to export
 * @param options - Export options
 */
export async function exportReportToPDF(
  elementId: string,
  options: PDFExportOptions = {}
): Promise<void> {
  const { filename = 'subscription-report.pdf', title = 'Subscription Analytics Report' } = options;

  try {
    // Get the element to export
    const element = document.getElementById(elementId);
    if (!element) {
      throw new Error(`Element with ID "${elementId}" not found`);
    }

    console.log('Generating PDF...');

    // Temporarily move element to visible area for better rendering
    const originalLeft = element.style.left;
    const originalPosition = element.style.position;
    element.style.left = '0';
    element.style.position = 'absolute';
    element.style.top = '0';
    element.style.zIndex = '9999';

    // Wait for charts to render completely (important for Recharts)
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Capture the element as canvas with very high quality
    const canvas = await html2canvas(element, {
      scale: 2, // Reduced from 3 to 2 for better compatibility
      useCORS: true, // Allow cross-origin images
      logging: true, // Enable logging for debugging
      backgroundColor: '#ffffff', // White background
      width: 1122,
      height: 794,
      windowWidth: 1122,
      windowHeight: 794,
      imageTimeout: 0, // No timeout for image loading
      removeContainer: true, // Clean up after rendering
      onclone: (clonedDoc) => {
        // Ensure the cloned element is visible and positioned correctly
        const clonedElement = clonedDoc.getElementById(elementId);
        if (clonedElement) {
          clonedElement.style.position = 'relative';
          clonedElement.style.left = '0';
          clonedElement.style.top = '0';
          clonedElement.style.visibility = 'visible';
          clonedElement.style.display = 'block';
        }
      },
    });

    // Restore original position
    element.style.left = originalLeft;
    element.style.position = originalPosition;
    element.style.zIndex = '';

    // A4 Landscape dimensions in mm
    const pdfWidth = 297; // A4 landscape width
    const pdfHeight = 210; // A4 landscape height

    // Create PDF in landscape mode
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
      compress: true, // Enable compression for smaller file size
    });

    // Add metadata
    pdf.setProperties({
      title: title,
      subject: 'Subscription Management Report',
      author: 'Subscription Manager',
      creator: 'Subscription Manager App',
      keywords: 'subscription, analytics, report',
    });

    // Calculate image dimensions to fit the page
    const canvasAspectRatio = canvas.width / canvas.height;
    const pdfAspectRatio = pdfWidth / pdfHeight;

    let imgWidth = pdfWidth;
    let imgHeight = pdfHeight;

    // Adjust dimensions to maintain aspect ratio and fit within page
    if (canvasAspectRatio > pdfAspectRatio) {
      // Canvas is wider - fit to width
      imgHeight = pdfWidth / canvasAspectRatio;
    } else {
      // Canvas is taller - fit to height
      imgWidth = pdfHeight * canvasAspectRatio;
    }

    // Center the image on the page
    const xOffset = (pdfWidth - imgWidth) / 2;
    const yOffset = (pdfHeight - imgHeight) / 2;

    // Convert canvas to PNG for better text clarity
    const imgData = canvas.toDataURL('image/png');

    // Add image to PDF (single page, centered)
    pdf.addImage(
      imgData,
      'PNG',
      xOffset,
      yOffset,
      imgWidth,
      imgHeight,
      undefined,
      'FAST' // Use FAST compression for balance between quality and size
    );

    // Save the PDF
    pdf.save(filename);

    console.log('PDF generated successfully');
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
