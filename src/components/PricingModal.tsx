import { X, Check, Sparkles, ArrowRight } from 'lucide-react';
import { config } from '../lib/config';
import { useEffect, useRef, useState } from 'react';
import { redirectToCheckout, getStripePriceId } from '../services/payment';
import { useAuth } from '../contexts/AuthContext';
import { useScrollAnimation } from '../hooks/useScrollAnimation';
import { useTranslation } from 'react-i18next';

interface PricingModalProps {
 isOpen: boolean;
 onClose: () => void;
 onUpgrade?: () => void;
}

interface FeatureItem {
 text: string;
 included: boolean;
}

interface PricingTier {
 name: string;
 price: string;
 period: string;
 description: string;
 features: FeatureItem[];
 highlighted?: boolean;
 supportMode?: boolean;
 buttonText: string;
 buttonAction?: () => void;
}

// Apple-style Feature Card Component
function FeatureCard({ icon, title, description, delay = 0 }: { icon: string; title: string; description: string; delay?: number }) {
 const { ref, isVisible } = useScrollAnimation({ threshold: 0.2, triggerOnce: true });

 return (
 <div
 ref={ref}
 className={`transition-all duration-1000 ${
 isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
 }`}
 style={{ transitionDelay: `${delay}ms` }}
 >
 <div className="text-center px-6 py-8">
 <div className="text-5xl mb-4">{icon}</div>
 <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
 {title}
 </h3>
 <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
 {description}
 </p>
 </div>
 </div>
 );
}

// Refined Pricing Card Component
function PricingCard({ tier, index, isVisible }: { tier: PricingTier; index: number; isVisible: boolean }) {
 const { t } = useTranslation(['pricing']);
 const isSupportMode = Boolean(tier.supportMode);

 return (
 <div
 className={`relative transition-all duration-1000 ${
 isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
 }`}
 style={{ transitionDelay: `${400 + index * 100}ms` }}
 >
 {/* Highlighted badge */}
 {tier.highlighted && (
 <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-10">
 <div className="flex items-center gap-1.5 px-4 py-1.5 bg-gradient-to-r from-slate-700 to-teal-600 rounded-full text-white text-sm font-medium shadow-fey">
 <Sparkles className="w-4 h-4"/>
 {isSupportMode ? t('pricing:badgeSupportOpenSource') : t('pricing:badgeMostPopular')}
 </div>
 </div>
 )}

 <div className={`h-full rounded-3xl p-8 backdrop-blur-xl transition-all duration-300 flex flex-col ${
 tier.highlighted
 ? 'bg-white/95 dark:bg-[#1a1c1e]/95 shadow-apple-xl border-2 border-teal-500/20 dark:border-teal-400/20 hover:shadow-teal-500/20 hover:scale-[1.02]'
 : 'bg-white/80 dark:bg-[#1a1c1e]/80 shadow-apple-lg border border-gray-200/50 dark:border-gray-700/50 hover:shadow-apple-xl hover:scale-[1.01]'
 }`}>
 {/* Header */}
 <div className="text-center mb-8">
 <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2 tracking-tight">
 {tier.name}
 </h3>
 <div className="flex items-baseline justify-center gap-2 mb-4">
 <span className="text-5xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">
 {tier.price}
 </span>
 <span className="text-gray-500 dark:text-gray-400 text-sm">
 / {tier.period}
 </span>
 </div>
 <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
 {tier.description}
 </p>
 </div>

 {/* Features */}
 <ul className="space-y-3 mb-8 flex-1">
 {tier.features.map((feature, idx) => (
 <li
 key={idx}
 className={`flex items-start gap-3 text-sm ${
 feature.included
 ? 'text-gray-700 dark:text-gray-300'
 : 'text-gray-400 dark:text-gray-600 line-through'
 }`}
 >
 <Check className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
 feature.included
 ? tier.highlighted
 ? 'text-teal-600 dark:text-teal-400'
 : 'text-emerald-600 dark:text-emerald-400'
 : 'text-gray-300 dark:text-gray-700'
 }`} />
 <span className="leading-relaxed">{feature.text}</span>
 </li>
 ))}
 </ul>

 {/* CTA Button */}
 <button
 onClick={tier.buttonAction}
 disabled={!tier.buttonAction}
 className={`w-full py-4 px-6 rounded-2xl font-semibold transition-all duration-300 flex items-center justify-center gap-2 group ${
 tier.highlighted
 ? 'bg-gradient-to-r from-slate-700 to-teal-600 hover:from-slate-800 hover:to-teal-700 text-white shadow-fey hover:shadow-apple-lg hover:scale-105'
 : 'bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white'
 } ${!tier.buttonAction ? 'opacity-50 cursor-not-allowed' : ''}`}
 >
 <span>{tier.buttonText}</span>
 {tier.buttonAction && (
 <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform"/>
 )}
 </button>
 </div>
 </div>
 );
}

export function PricingModal({ isOpen, onClose, onUpgrade }: PricingModalProps) {
 const { t } = useTranslation(['pricing']);
 const containerRef = useRef<HTMLDivElement>(null);
 const [isVisible, setIsVisible] = useState(false);
 const [isProcessing, setIsProcessing] = useState(false);
 const { user } = useAuth();
 const authenticatedUser = config.features.authentication ? user : null;

 // 当模态框打开时，滚动到顶部并触发动画
 useEffect(() => {
 if (isOpen) {
 if (containerRef.current) {
 containerRef.current.scrollTop = 0;
 }
 // 延迟一点触发动画，确保 DOM 已渲染
 setTimeout(() => setIsVisible(true), 50);
 } else {
 setIsVisible(false);
 }
 }, [isOpen]);

 // 处理支付流程
 const handlePayment = async () => {
 if (!config.features.payment) {
 alert(t('pricing:paymentNotConfigured'));
 return;
 }

 setIsProcessing(true);

 try {
 const priceId = getStripePriceId();

 await redirectToCheckout({
 priceId,
 userId: authenticatedUser?.id,
 userEmail: authenticatedUser?.email,
 });
 } catch (error) {
 console.error('Payment error:', error);
 alert(t('pricing:paymentFailed'));
 setIsProcessing(false);
 }
 };

 if (!isOpen) return null;

 // 根据是否有云同步功能决定显示Premium还是Support Developer
 const isCloudSyncAvailable = config.features.cloudSync;

 const pricingTiers: PricingTier[] = isCloudSyncAvailable
 ? [
 // 有云同步配置 - 显示Premium付费版本
 {
 name: t('pricing:openSourceName'),
 price: t('pricing:freePrice'),
 period: t('pricing:foreverPeriod'),
 description: t('pricing:openSourceCloudDescription'),
 features: [
 { text: t('pricing:featureUnlimitedSubscriptions'), included: true },
 { text: t('pricing:featureMultiCurrencySupport'), included: true },
 { text: t('pricing:featureLocalDataStorage'), included: true },
 { text: t('pricing:featureImportExportData'), included: true },
 { text: t('pricing:featureCustomCategories'), included: true },
 { text: t('pricing:featureDarkMode'), included: true },
 { text: t('pricing:featureAdvancedAnalytics'), included: false },
 { text: t('pricing:featurePdfExport'), included: false },
 { text: t('pricing:featureCloudBackupSync'), included: false },
 { text: t('pricing:featureNotificationReminders'), included: false },
 ],
 buttonText: t('pricing:getStarted'),
 buttonAction: onClose,
 },
 {
 name: t('pricing:premiumName'),
 price: '$6',
 period: t('pricing:lifetimePeriod'),
 description: t('pricing:premiumDescription'),
 features: [
 { text: t('pricing:featureEverythingInOpenSource'), included: true },
 { text: t('pricing:featureAdvancedAnalyticsReports'), included: true },
 { text: t('pricing:featureCloudBackupMultiDevice'), included: true },
 { text: t('pricing:featureRenewalNotifications'), included: true },
 { text: t('pricing:featurePdfExportBeta'), included: true },
 { text: t('pricing:featurePrioritySupport'), included: true },
 { text: t('pricing:featureFuturePremiumFeatures'), included: true },
 ],
 highlighted: true,
 buttonText: config.features.payment ? (isProcessing ? t('pricing:processing') : t('pricing:upgradeNow')) : t('pricing:paymentNotAvailable'),
 buttonAction: config.features.payment ? handlePayment : undefined,
 },
 ]
 : [
 // 无云同步配置 - 显示Support Developer捐赠版本
 {
 name: t('pricing:openSourceName'),
 price: t('pricing:freePrice'),
 period: t('pricing:foreverPeriod'),
 description: t('pricing:openSourceSupportDescription'),
 features: [
 { text: t('pricing:featureUnlimitedSubscriptions'), included: true },
 { text: t('pricing:featureMultiCurrencySupport'), included: true },
 { text: t('pricing:featureAdvancedAnalytics'), included: true },
 { text: t('pricing:featurePdfExportBeta'), included: true },
 { text: t('pricing:featureLocalStorage'), included: true },
 { text: t('pricing:featureImportExport'), included: true },
 { text: t('pricing:featureCustomCategories'), included: true },
 { text: t('pricing:featureNotificationReminders'), included: true },
 { text: t('pricing:featureDarkMode'), included: true },
 { text: t('pricing:featureOpenSourceGithub'), included: true },
 ],
 buttonText: t('pricing:getStarted'),
 buttonAction: onClose,
 },
 {
 name: t('pricing:supportDeveloperName'),
 price: '$6',
 period: t('pricing:oneTimePeriod'),
 description: t('pricing:supportDeveloperDescription'),
 features: [
 { text: t('pricing:featureSupportOpenSourceDevelopment'), included: true },
 { text: t('pricing:featureAllFeaturesRemainFree'), included: true },
 { text: t('pricing:featureHelpMaintainProject'), included: true },
 { text: t('pricing:featureFundNewFeatures'), included: true },
 { text: t('pricing:featureSponsorBadgeOptional'), included: true },
 { text: t('pricing:featurePersonalThankYou'), included: true },
 ],
 highlighted: true,
 supportMode: true,
 buttonText: config.features.payment ? (isProcessing ? t('pricing:processing') : t('pricing:supportProject')) : t('pricing:paymentNotAvailable'),
 buttonAction: config.features.payment ? handlePayment : undefined,
 },
 ];

 return (
 <div
 ref={containerRef}
 className="fixed inset-0 bg-gradient-to-b from-gray-50 via-white to-gray-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 z-50 overflow-y-auto"
 onClick={(e) => {
 if (e.target === e.currentTarget) {
 onClose();
 }
 }}
 >
 <div className="min-h-screen px-4 py-12 sm:py-20">
 <div className="max-w-7xl mx-auto">
 {/* Close Button - Apple style */}
 <button
 onClick={onClose}
 className="fixed top-6 right-6 sm:top-8 sm:right-8 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gray-200/80 hover:bg-gray-300/80 dark:bg-[#1a1c1e]/80 dark:hover:bg-gray-700/80 backdrop-blur-xl transition-all flex items-center justify-center group z-10 shadow-fey hover:shadow-apple-lg hover:scale-105"
 aria-label={t('pricing:closeAria')}
 >
 <X className="w-5 h-5 sm:w-6 sm:h-6 text-gray-700 dark:text-gray-300 group-hover:rotate-90 transition-transform duration-300"/>
 </button>

 {/* Hero Section - Apple minimalist style */}
 <div
 className={`text-center mb-16 sm:mb-24 transition-all duration-1000 ${
 isVisible
 ? 'opacity-100 translate-y-0'
 : 'opacity-0 translate-y-10'
 }`}
 >
 <h1 className="text-5xl sm:text-7xl lg:text-8xl font-bold mb-6 bg-gradient-to-b from-gray-900 via-gray-800 to-gray-600 dark:from-white dark:via-gray-100 dark:to-gray-400 bg-clip-text text-transparent tracking-tight">
 {isCloudSyncAvailable ? t('pricing:heroTopCloud') : t('pricing:heroTopSupport')}
 <br />
 {isCloudSyncAvailable ? t('pricing:heroBottomCloud') : t('pricing:heroBottomSupport')}
 </h1>
 <p className="text-xl sm:text-2xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto leading-relaxed font-light">
 {isCloudSyncAvailable
 ? t('pricing:heroSubtitleCloud')
 : t('pricing:heroSubtitleSupport')}
 </p>
 </div>

 {/* Large Price Display - Refined */}
 <div
 className={`flex items-center justify-center mb-16 sm:mb-24 transition-all duration-1000 delay-200 ${
 isVisible
 ? 'opacity-100 scale-100'
 : 'opacity-0 scale-95'
 }`}
 >
 <div className="relative">
 {/* Subtle Glow */}
 <div className="absolute inset-0 bg-gradient-to-r from-teal-500/10 via-emerald-500/10 to-cyan-500/10 blur-3xl"></div>

 <div className="relative text-center">
 <div className="text-[100px] sm:text-[160px] lg:text-[200px] font-bold leading-none tracking-tighter">
 <span className="bg-gradient-to-br from-gray-900 via-gray-700 to-gray-500 dark:from-white dark:via-gray-200 dark:to-gray-400 bg-clip-text text-transparent">
 6
 </span>
 </div>
 <div className="text-2xl sm:text-3xl text-gray-500 dark:text-gray-500 mt-4 font-light">
 {t('pricing:priceDisplay')}
 </div>
 </div>
 </div>
 </div>

 {/* Feature Highlights - Apple style */}
 <div
 className={`mb-20 sm:mb-32 transition-all duration-1000 delay-300 ${
 isVisible
 ? 'opacity-100 translate-y-0'
 : 'opacity-0 translate-y-10'
 }`}
 >
 <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
 <FeatureCard
 icon="📊"
 title={t('pricing:featureAnalyticsTitle')}
 description={t('pricing:featureAnalyticsDescription')}
 delay={100}
 />
 <FeatureCard
 icon="☁️"
 title={t('pricing:featureCloudSyncTitle')}
 description={t('pricing:featureCloudSyncDescription')}
 delay={200}
 />
 <FeatureCard
 icon="🔔"
 title={t('pricing:featureRemindersTitle')}
 description={t('pricing:featureRemindersDescription')}
 delay={300}
 />
 </div>
 </div>

 {/* Pricing Cards */}
 <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto mb-16 sm:mb-24">
 {pricingTiers.map((tier, index) => (
 <PricingCard
 key={tier.name}
 tier={tier}
 index={index}
 isVisible={isVisible}
 />
 ))}
 </div>

 {/* Footer Note */}
 <div
 className={`text-center text-sm text-gray-500 dark:text-gray-500 max-w-2xl mx-auto transition-all duration-1000 delay-600 ${
 isVisible
 ? 'opacity-100 translate-y-0'
 : 'opacity-0 translate-y-10'
 }`}
 >
 <p className="leading-relaxed">
 {isCloudSyncAvailable
 ? t('pricing:footerCloud')
 : t('pricing:footerSupport')}
 </p>
 </div>
 </div>
 </div>
 </div>
 );
}
