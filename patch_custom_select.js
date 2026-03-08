const fs = require('fs');
let code = fs.readFileSync('src/components/CustomSelect.tsx', 'utf8');
code = code.replace(
  /<div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-2xl shadow-fey max-h-60 overflow-auto">/g,
  '<div className="absolute z-50 w-full mt-1 bg-white dark:bg-[#1a1c1e] border border-gray-200 dark:border-gray-700 rounded-2xl shadow-apple-lg max-h-60 overflow-auto p-1.5 flex flex-col gap-0.5">'
);
code = code.replace(
  /<div className="px-4 py-2 text-gray-500 dark:text-gray-400 text-sm">/g,
  '<div className="px-3 py-2 text-gray-500 dark:text-gray-400 text-sm">'
);
code = code.replace(
  /className=\{`\n\s*w-full flex items-center justify-between px-4 py-2 text-left text-sm\n\s*hover:bg-gray-100 dark:hover:bg-gray-600\n\s*focus:bg-gray-100 dark:focus:bg-gray-600 focus:outline-none\n\s*\$\{/g,
  'className={`\\n                    w-full flex items-center justify-between px-3 py-2 text-left text-sm rounded-xl transition-colors\\n                    hover:bg-gray-100 dark:hover:bg-gray-800\\n                    focus:bg-gray-100 dark:focus:bg-gray-800 focus:outline-none\\n                    ${'
);
fs.writeFileSync('src/components/CustomSelect.tsx', code);
