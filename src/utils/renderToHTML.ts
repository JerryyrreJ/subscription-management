import { renderToString } from 'react-dom/server';
import { ReactElement } from 'react';

/**
 * Render a React component to a complete HTML document string
 * This is designed for server-side rendering and PDF generation
 */
export function renderToHTML(component: ReactElement): string {
  // Render the React component to HTML string
  const componentHTML = renderToString(component);

  // Wrap in a complete HTML document with all necessary styles
  const fullHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Subscription Analytics Report</title>
  <style>
    /* Reset and base styles */
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    /* Page layout for A4 Landscape */
    @page {
      size: A4 landscape;
      margin: 0;
    }

    /* Ensure content fits on page */
    html, body {
      width: 297mm;
      height: 210mm;
      margin: 0;
      padding: 0;
      overflow: hidden;
    }

    /* Embedded Tailwind-like utility classes */
    .bg-white { background-color: #ffffff; }
    .text-gray-600 { color: #4b5563; }
    .text-gray-700 { color: #374151; }
    .text-gray-900 { color: #111827; }
    .font-semibold { font-weight: 600; }
    .font-bold { font-weight: 700; }
    .rounded-lg { border-radius: 0.5rem; }
    .rounded-xl { border-radius: 0.75rem; }
    .shadow-sm { box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05); }

    /* Layout utilities */
    .absolute { position: absolute; }
    .relative { position: relative; }
    .flex { display: flex; }
    .items-center { align-items: center; }
    .justify-between { justify-content: space-between; }
    .gap-2 { gap: 0.5rem; }
    .gap-4 { gap: 1rem; }

    /* Gradient backgrounds */
    .bg-gradient-to-r {
      background-image: linear-gradient(to right, var(--tw-gradient-stops));
    }
    .from-purple-600 { --tw-gradient-from: #9333ea; --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to, rgb(147 51 234 / 0)); }
    .to-pink-600 { --tw-gradient-to: #db2777; }

    /* Gradient text */
    .bg-clip-text {
      -webkit-background-clip: text;
      background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    /* Ensure SVG elements render properly */
    svg {
      display: block;
    }

    /* Recharts specific fixes for PDF rendering */
    .recharts-wrapper {
      font-family: system-ui, -apple-system, sans-serif !important;
    }

    .recharts-surface {
      overflow: visible !important;
    }

    .recharts-legend-wrapper {
      position: relative !important;
    }

    /* Print-specific styles */
    @media print {
      body {
        print-color-adjust: exact;
        -webkit-print-color-adjust: exact;
      }
    }
  </style>
</head>
<body>
  ${componentHTML}
</body>
</html>
  `.trim();

  return fullHTML;
}
