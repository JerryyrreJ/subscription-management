import { X, Check, Sparkles, ArrowRight } from 'lucide-react';
import { config } from '../lib/config';
import { useEffect, useRef, useState } from 'react';
import { redirectToCheckout, getStripePriceId } from '../services/payment';
import { useAuth } from '../contexts/AuthContext';
import { useScrollAnimation } from '../hooks/useScrollAnimation';

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
  const isSupportMode = tier.name === 'Support Developer';

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
          <div className="flex items-center gap-1.5 px-4 py-1.5 bg-gradient-to-r from-slate-700 to-teal-600 rounded-full text-white text-sm font-medium shadow-lg">
            <Sparkles className="w-4 h-4" />
            {isSupportMode ? 'Support Open Source' : 'Most Popular'}
          </div>
        </div>
      )}

      <div className={`h-full rounded-3xl p-8 backdrop-blur-xl transition-all duration-300 flex flex-col ${
        tier.highlighted
          ? 'bg-white/95 dark:bg-gray-800/95 shadow-2xl border-2 border-teal-500/20 dark:border-teal-400/20 hover:shadow-teal-500/20 hover:scale-[1.02]'
          : 'bg-white/80 dark:bg-gray-800/80 shadow-xl border border-gray-200/50 dark:border-gray-700/50 hover:shadow-2xl hover:scale-[1.01]'
      }`}>
        {/* Header */}
        <div className="text-center mb-8">
          <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
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
              ? 'bg-gradient-to-r from-slate-700 to-teal-600 hover:from-slate-800 hover:to-teal-700 text-white shadow-lg hover:shadow-xl hover:scale-105'
              : 'bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white'
          } ${!tier.buttonAction ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <span>{tier.buttonText}</span>
          {tier.buttonAction && (
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          )}
        </button>
      </div>
    </div>
  );
}

export function PricingModal({ isOpen, onClose, onUpgrade }: PricingModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const { user } = config.features.authentication ? useAuth() : { user: null };

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
      alert('Payment is not configured. Please contact support.');
      return;
    }

    setIsProcessing(true);

    try {
      const priceId = getStripePriceId();

      await redirectToCheckout({
        priceId,
        userId: user?.id,
        userEmail: user?.email,
      });
    } catch (error) {
      console.error('Payment error:', error);
      alert('Failed to start payment process. Please try again.');
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
          name: 'Open Source',
          price: 'Free',
          period: 'forever',
          description: 'Perfect for personal use with full local control',
          features: [
            { text: 'Unlimited subscriptions', included: true },
            { text: 'Multi-currency support', included: true },
            { text: 'Local data storage', included: true },
            { text: 'Import/Export data', included: true },
            { text: 'Custom categories', included: true },
            { text: 'Dark mode', included: true },
            { text: 'Advanced analytics', included: false },
            { text: 'PDF export', included: false },
            { text: 'Cloud backup & sync', included: false },
            { text: 'Notification reminders', included: false },
          ],
          buttonText: 'Get Started',
          buttonAction: onClose,
        },
        {
          name: 'Premium',
          price: '$6',
          period: 'lifetime',
          description: 'Unlock all features for powerful subscription management',
          features: [
            { text: 'Everything in Open Source', included: true },
            { text: 'Advanced analytics & reports', included: true },
            { text: 'Cloud backup & multi-device sync', included: true },
            { text: 'Renewal notifications', included: true },
            { text: 'PDF export (beta)', included: true },
            { text: 'Priority support', included: true },
            { text: 'Future premium features', included: true },
          ],
          highlighted: true,
          buttonText: config.features.payment ? (isProcessing ? 'Processing...' : 'Upgrade Now') : 'Payment Not Available',
          buttonAction: config.features.payment ? handlePayment : undefined,
        },
      ]
    : [
        // 无云同步配置 - 显示Support Developer捐赠版本
        {
          name: 'Open Source',
          price: 'Free',
          period: 'forever',
          description: 'Full-featured subscription tracker with complete source code',
          features: [
            { text: 'Unlimited subscriptions', included: true },
            { text: 'Multi-currency support', included: true },
            { text: 'Advanced analytics', included: true },
            { text: 'PDF export (beta)', included: true },
            { text: 'Local storage', included: true },
            { text: 'Import/Export', included: true },
            { text: 'Custom categories', included: true },
            { text: 'Notification reminders', included: true },
            { text: 'Dark mode', included: true },
            { text: 'Open source on GitHub', included: true },
          ],
          buttonText: 'Get Started',
          buttonAction: onClose,
        },
        {
          name: 'Support Developer',
          price: '$6',
          period: 'one-time',
          description: 'Help support continued development and maintenance',
          features: [
            { text: 'Support open source development', included: true },
            { text: 'All features remain free', included: true },
            { text: 'Help maintain the project', included: true },
            { text: 'Fund new features', included: true },
            { text: 'Sponsor badge (optional)', included: true },
            { text: 'Personal thank you', included: true },
          ],
          highlighted: true,
          buttonText: config.features.payment ? (isProcessing ? 'Processing...' : 'Support Project') : 'Payment Not Available',
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
            className="fixed top-6 right-6 sm:top-8 sm:right-8 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gray-200/80 hover:bg-gray-300/80 dark:bg-gray-800/80 dark:hover:bg-gray-700/80 backdrop-blur-xl transition-all flex items-center justify-center group z-10 shadow-lg hover:shadow-xl hover:scale-105"
            aria-label="Close pricing"
          >
            <X className="w-5 h-5 sm:w-6 sm:h-6 text-gray-700 dark:text-gray-300 group-hover:rotate-90 transition-transform duration-300" />
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
              {isCloudSyncAvailable ? 'Simple.' : 'Support.'}
              <br />
              {isCloudSyncAvailable ? 'Powerful.' : 'Together.'}
            </h1>
            <p className="text-xl sm:text-2xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto leading-relaxed font-light">
              {isCloudSyncAvailable
                ? 'One price. Lifetime access. Everything you need.'
                : 'Free forever. Support if you can.'}
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
                  $6 · lifetime
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
                title="Analytics"
                description="Beautiful insights into your spending patterns and trends"
                delay={100}
              />
              <FeatureCard
                icon="☁️"
                title="Cloud Sync"
                description="Seamless synchronization across all your devices"
                delay={200}
              />
              <FeatureCard
                icon="🔔"
                title="Reminders"
                description="Never miss a renewal with smart notifications"
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
                ? 'One-time payment. No subscriptions. No recurring fees. All future updates included.'
                : 'This project is and will always be free and open source. Your support helps keep it that way.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
