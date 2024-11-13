import { version } from '../../package.json';

export function Footer() {
  const currentYear = new Date().getFullYear();
  
  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 h-24 bg-gradient-to-b from-transparent to-gray-50 pointer-events-none" />
      
      <footer className="fixed bottom-0 left-0 right-0 backdrop-blur-sm bg-gray-50/80 py-4 border-t border-gray-100/50">
        <p className="text-center text-[11px] text-gray-400">
          © {currentYear} Subscription Manager. Made by Jerry Lu
          <a 
            href="https://github.com/JerryyrreJ/subscription-management/tree/main" 
            target="_blank" 
            rel="noopener noreferrer"
            className="inline-flex items-center ml-1 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg 
              viewBox="0 0 16 16" 
              className="w-[11px] h-[11px] translate-y-[1px]" 
              fill="currentColor"
            >
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
          </a>
          <br />
          <span className="text-[10px]">
            All data is stored locally and never leaves your device
          </span>
          <br />
          <span className="text-[10px] text-gray-300">
            Version {version}
          </span>
        </p>
      </footer>
    </>
  );
} 