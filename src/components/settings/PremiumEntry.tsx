import { ArrowUpRight, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface PremiumEntryProps {
  isPremium?: boolean;
  onClick: () => void;
  role?: 'menuitem';
}

export function PremiumEntry({ isPremium = false, onClick, role }: PremiumEntryProps) {
  const { t } = useTranslation('userMenu');
  return (
    <button type="button" role={role} className="settings-premium" onClick={onClick}>
      <Sparkles size={18} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{t(isPremium ? 'premiumAccount' : 'upgradeToPremium')}</span>
        <span className="settings-premium-description">{t(isPremium ? 'premiumActiveDescription' : 'premiumDescription')}</span>
      </span>
      <ArrowUpRight size={16} className="shrink-0" aria-hidden="true" />
    </button>
  );
}
