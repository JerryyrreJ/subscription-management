import { X, Check, ArrowRight, Sparkles } from 'lucide-react';
import { config } from '../lib/config';
import { useEffect, useRef, useState } from 'react';
import { redirectToCheckout } from '../services/payment';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';

interface PricingModalProps {
 isOpen: boolean;
 onClose: () => void;
 onUpgrade?: () => void;
}

const LIFETIME_PRICE = '$9';

export function PricingModal({ isOpen, onClose, onUpgrade }: PricingModalProps) {
 const { t } = useTranslation(['pricing']);
 const containerRef = useRef<HTMLDivElement>(null);
 const [isVisible, setIsVisible] = useState(false);
 const [isProcessing, setIsProcessing] = useState(false);
 const { session, userProfile } = useAuth();

 useEffect(() => {
 if (isOpen) {
 if (containerRef.current) {
 containerRef.current.scrollTop = 0;
 }
 setTimeout(() => setIsVisible(true), 50);
 } else {
 setIsVisible(false);
 }
 }, [isOpen]);

 const handlePayment = async () => {
 if (!config.features.payment) {
 alert(t('pricing:paymentNotConfigured'));
 return;
 }

 if (config.features.cloudSync && !session?.access_token) {
 onUpgrade?.();
 return;
 }

 setIsProcessing(true);

 try {
 await redirectToCheckout(session?.access_token);
 } catch (error) {
 console.error('Payment error:', error);
 alert(t('pricing:paymentFailed'));
 setIsProcessing(false);
 }
 };

 if (!isOpen) return null;

 const isCloudSyncAvailable = config.features.cloudSync;
 const alreadyPremium = Boolean(userProfile?.is_premium);

 const freeFeatures = isCloudSyncAvailable
 ? [
 t('pricing:featureUnlimitedSubscriptions'),
 t('pricing:featureMultiCurrencySupport'),
 t('pricing:featureCloudBackupSync'),
 t('pricing:featureNotificationReminders'),
 t('pricing:featureBasicStats'),
 t('pricing:featureImportExportData'),
 t('pricing:featureAiFreeQuota'),
 ]
 : [
 t('pricing:featureUnlimitedSubscriptions'),
 t('pricing:featureMultiCurrencySupport'),
 t('pricing:featureAdvancedAnalytics'),
 t('pricing:featurePdfExport'),
 t('pricing:featureLocalStorage'),
 t('pricing:featureImportExport'),
 t('pricing:featureNotificationReminders'),
 t('pricing:featureOpenSourceGithub'),
 ];

 const premiumFeatures = isCloudSyncAvailable
 ? [
 t('pricing:featureEverythingInFree'),
 t('pricing:featureAiPremiumQuota'),
 t('pricing:featureAdvancedAnalyticsReports'),
 t('pricing:featurePdfExport'),
 ]
 : [
 t('pricing:featureSupportOpenSourceDevelopment'),
 t('pricing:featureAllFeaturesRemainFree'),
 t('pricing:featureHelpMaintainProject'),
 t('pricing:featureFundNewFeatures'),
 ];

 const premiumCta = !config.features.payment
 ? t('pricing:paymentNotAvailable')
 : isProcessing
 ? t('pricing:processing')
 : alreadyPremium
 ? t('pricing:alreadyPremium')
 : isCloudSyncAvailable
 ? t('pricing:upgradeNow')
 : t('pricing:supportProject');

 return (
 <div
 ref={containerRef}
 className="fixed inset-0 bg-gradient-to-b from-slate-50 via-white to-teal-50/40 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 z-50 overflow-y-auto"
 onClick={(e) => {
 if (e.target === e.currentTarget) {
 onClose();
 }
 }}
 >
 <div className="min-h-screen px-4 py-12 sm:py-16">
 <div className="max-w-4xl mx-auto">
 <button
 onClick={onClose}
 className="fixed top-6 right-6 sm:top-8 sm:right-8 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gray-200/80 hover:bg-gray-300/80 dark:bg-[#1a1c1e]/80 dark:hover:bg-gray-700/80 backdrop-blur-xl transition-all flex items-center justify-center group z-10 shadow-fey hover:shadow-apple-lg hover:scale-105"
 aria-label={t('pricing:closeAria')}
 >
 <X className="w-5 h-5 sm:w-6 sm:h-6 text-gray-700 dark:text-gray-300 group-hover:rotate-90 transition-transform duration-300"/>
 </button>

 <div
 className={`text-center mb-10 sm:mb-14 transition-all duration-700 ${
 isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
 }`}
 >
 <p className="text-sm font-medium tracking-wide text-teal-700 dark:text-teal-400 mb-3">
 {t('pricing:productName')}
 </p>
 <h1 className="text-3xl sm:text-5xl font-bold text-gray-900 dark:text-white tracking-tight mb-4">
 {isCloudSyncAvailable ? t('pricing:heroTitleCloud') : t('pricing:heroTitleSupport')}
 </h1>
 <p className="text-base sm:text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto leading-relaxed">
 {isCloudSyncAvailable ? t('pricing:heroSubtitleCloud') : t('pricing:heroSubtitleSupport')}
 </p>
 </div>

 {isCloudSyncAvailable && (
 <div
 className={`grid sm:grid-cols-2 gap-4 max-w-2xl mx-auto mb-10 sm:mb-12 transition-all duration-700 delay-100 ${
 isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
 }`}
 >
 <div className="rounded-3xl border border-teal-500/20 bg-white/80 dark:bg-[#1a1c1e]/80 backdrop-blur-xl p-5 text-left">
 <div className="flex items-center gap-2 text-teal-700 dark:text-teal-400 mb-2">
 <Sparkles className="w-4 h-4" />
 <h2 className="font-semibold">{t('pricing:sellAiTitle')}</h2>
 </div>
 <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
 {t('pricing:sellAiDescription')}
 </p>
 </div>
 <div className="rounded-3xl border border-gray-200/60 dark:border-gray-700/60 bg-white/80 dark:bg-[#1a1c1e]/80 backdrop-blur-xl p-5 text-left">
 <h2 className="font-semibold text-gray-900 dark:text-white mb-2">
 {t('pricing:sellReportTitle')}
 </h2>
 <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
 {t('pricing:sellReportDescription')}
 </p>
 </div>
 </div>
 )}

 <div
 className={`text-center mb-10 sm:mb-12 transition-all duration-700 delay-150 ${
 isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
 }`}
 >
 <div className="inline-flex items-baseline gap-2">
 <span className="text-6xl sm:text-7xl font-bold tracking-tight text-gray-900 dark:text-white">
 {LIFETIME_PRICE}
 </span>
 <span className="text-base text-gray-500 dark:text-gray-400">
 {isCloudSyncAvailable ? t('pricing:lifetimeOnce') : t('pricing:oneTimePeriod')}
 </span>
 </div>
 <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
 {isCloudSyncAvailable ? t('pricing:lifetimeNote') : t('pricing:supportPriceNote')}
 </p>
 </div>

 <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto mb-10 sm:mb-14">
 <div
 className={`rounded-3xl p-7 backdrop-blur-xl border border-gray-200/50 dark:border-gray-700/50 bg-white/80 dark:bg-[#1a1c1e]/80 shadow-apple-lg transition-all duration-700 delay-200 ${
 isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
 }`}
 >
 <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-1">
 {isCloudSyncAvailable ? t('pricing:freeName') : t('pricing:openSourceName')}
 </h3>
 <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
 {isCloudSyncAvailable ? t('pricing:freeDescription') : t('pricing:openSourceSupportDescription')}
 </p>
 <p className="text-3xl font-bold text-gray-900 dark:text-white mb-6">
 {t('pricing:freePrice')}
 <span className="ml-2 text-sm font-normal text-gray-500">/ {t('pricing:foreverPeriod')}</span>
 </p>
 <ul className="space-y-3 mb-8">
 {freeFeatures.map((text) => (
 <li key={text} className="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-300">
 <Check className="w-5 h-5 flex-shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
 <span className="leading-relaxed">{text}</span>
 </li>
 ))}
 </ul>
 <button
 onClick={onClose}
 className="w-full py-3.5 px-6 rounded-2xl font-semibold bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white transition-all"
 >
 {t('pricing:getStarted')}
 </button>
 </div>

 <div
 className={`relative rounded-3xl p-7 backdrop-blur-xl border-2 border-teal-500/25 dark:border-teal-400/25 bg-white/95 dark:bg-[#1a1c1e]/95 shadow-apple-xl transition-all duration-700 delay-300 ${
 isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
 }`}
 >
 <div className="absolute -top-3 left-1/2 -translate-x-1/2">
 <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium text-white bg-gradient-to-r from-slate-700 to-teal-600 shadow-fey">
 <Sparkles className="w-3.5 h-3.5" />
 {isCloudSyncAvailable ? t('pricing:badgeMostPopular') : t('pricing:badgeSupportOpenSource')}
 </span>
 </div>
 <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-1 mt-2">
 {isCloudSyncAvailable ? t('pricing:premiumName') : t('pricing:supportDeveloperName')}
 </h3>
 <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
 {isCloudSyncAvailable ? t('pricing:premiumDescription') : t('pricing:supportDeveloperDescription')}
 </p>
 <p className="text-3xl font-bold text-gray-900 dark:text-white mb-6">
 {LIFETIME_PRICE}
 <span className="ml-2 text-sm font-normal text-gray-500">
 / {isCloudSyncAvailable ? t('pricing:lifetimePeriod') : t('pricing:oneTimePeriod')}
 </span>
 </p>
 <ul className="space-y-3 mb-8">
 {premiumFeatures.map((text) => (
 <li key={text} className="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-300">
 <Check className="w-5 h-5 flex-shrink-0 mt-0.5 text-teal-600 dark:text-teal-400" />
 <span className="leading-relaxed">{text}</span>
 </li>
 ))}
 </ul>
 <button
 onClick={config.features.payment && !alreadyPremium ? handlePayment : undefined}
 disabled={!config.features.payment || alreadyPremium || isProcessing}
 className={`w-full py-3.5 px-6 rounded-2xl font-semibold transition-all flex items-center justify-center gap-2 group ${
 alreadyPremium || !config.features.payment
 ? 'bg-gray-100 dark:bg-gray-700 text-gray-500 cursor-not-allowed'
 : 'bg-gradient-to-r from-slate-700 to-teal-600 hover:from-slate-800 hover:to-teal-700 text-white shadow-fey hover:shadow-apple-lg'
 }`}
 >
 <span>{premiumCta}</span>
 {config.features.payment && !alreadyPremium && (
 <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform"/>
 )}
 </button>
 </div>
 </div>

 <p
 className={`text-center text-sm text-gray-500 dark:text-gray-500 max-w-2xl mx-auto leading-relaxed transition-all duration-700 delay-500 ${
 isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
 }`}
 >
 {isCloudSyncAvailable ? t('pricing:footerCloud') : t('pricing:footerSupport')}
 </p>
 </div>
 </div>
 </div>
 );
}
