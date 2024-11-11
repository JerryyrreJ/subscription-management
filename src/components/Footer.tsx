import { version } from '../../package.json';

export function Footer() {
  const currentYear = new Date().getFullYear();
  
  return (
    <footer className="fixed bottom-0 left-0 right-0 bg-gray-50 py-4 border-t border-gray-100">
      <p className="text-center text-[11px] text-gray-400">
        © {currentYear} Subscription Manager. Made with Jerry Lu
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
  );
} 