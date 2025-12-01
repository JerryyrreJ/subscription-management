import { X, Check, Sparkles } from 'lucide-react';
import { config } from '../lib/config';
import { useEffect, useRef, useState } from 'react';
import { redirectToCheckout, getStripePriceId } from '../services/payment';
import { useAuth } from '../contexts/AuthContext';

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
            { text: 'Multi-currency support (10 currencies)', included: true },
            { text: 'Local data storage', included: true },
            { text: 'Import/Export data', included: true },
            { text: 'Custom categories', included: true },
            { text: 'Dark mode support', included: true },
            { text: 'Advanced analytics & reports', included: false },
            { text: 'PDF export', included: false },
            { text: 'Notification reminders', included: false },
            { text: 'Cloud backup & sync', included: false },
            { text: 'Category sync', included: false },
          ],
          buttonText: 'Get Started',
          buttonAction: onClose,
        },
        {
          name: 'Premium',
          price: '$6',
          period: 'lifetime',
          description: 'Everything you need for powerful subscription management',
          features: [
            { text: 'All features in Open Source', included: true },
            { text: 'Advanced analytics & detailed reports', included: true },
            { text: 'PDF export (beta)', included: true },
            { text: 'Cloud backup & multi-device sync', included: true },
            { text: 'Category sync across devices', included: true },
            { text: 'Renewal notification reminders', included: true },
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
            { text: 'Multi-currency support (10 currencies)', included: true },
            { text: 'Advanced analytics & detailed reports', included: true },
            { text: 'PDF export (beta)', included: true },
            { text: 'Local data storage', included: true },
            { text: 'Import/Export data', included: true },
            { text: 'Custom categories', included: true },
            { text: 'Notification reminders', included: true },
            { text: 'Dark mode support', included: true },
            { text: 'Complete source code on GitHub', included: true },
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
            { text: 'Sponsor badge on GitHub (optional)', included: true },
            { text: 'Personal thank you message', included: true },
          ],
          highlighted: true,
          buttonText: config.features.payment ? (isProcessing ? 'Processing...' : 'Support Project') : 'Payment Not Available',
          buttonAction: config.features.payment ? handlePayment : undefined,
        },
      ];

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="min-h-screen px-4 py-8 sm:py-16">
        <div className="max-w-7xl mx-auto">
          {/* Close Button */}
          <button
            onClick={onClose}
            className="fixed top-4 right-4 sm:top-8 sm:right-8 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-sm transition-all flex items-center justify-center group z-10"
            aria-label="Close pricing"
          >
            <X className="w-5 h-5 sm:w-6 sm:h-6 text-white group-hover:rotate-90 transition-transform duration-300" />
          </button>

          {/* Hero Section with Scroll Animation */}
          <div
            className={`text-center mb-12 sm:mb-20 transition-all duration-1000 ${
              isVisible
                ? 'opacity-100 translate-y-0'
                : 'opacity-0 translate-y-10'
            }`}
          >
            <h1 className="text-4xl sm:text-6xl lg:text-7xl font-bold text-white mb-4 sm:mb-6">
              {isCloudSyncAvailable ? 'Simple Pricing' : 'Support This Project'}
            </h1>
          </div>

          {/* Large Price Display - Fey Style */}
          <div
            className={`flex items-center justify-center mb-12 sm:mb-20 transition-all duration-1000 delay-200 ${
              isVisible
                ? 'opacity-100 scale-100'
                : 'opacity-0 scale-95'
            }`}
          >
            <div className="relative">
              {/* Gradient Background Glow */}
              <div className="absolute inset-0 bg-gradient-to-r from-purple-500/20 via-pink-500/20 to-blue-500/20 blur-3xl"></div>

              <div className="relative text-center">
                <div className="text-[120px] sm:text-[180px] lg:text-[240px] font-bold leading-none">
                  <span className="bg-gradient-to-br from-white via-gray-100 to-gray-300 bg-clip-text text-transparent">
                    6
                  </span>
                </div>
                <div className="text-xl sm:text-2xl text-gray-400 mt-4">
                  $6 lifetime
                </div>
              </div>
            </div>
          </div>

          {/* Feature Description with Scroll Animation */}
          <div
            className={`text-center max-w-4xl mx-auto mb-16 sm:mb-24 px-4 transition-all duration-1000 delay-300 ${
              isVisible
                ? 'opacity-100 translate-y-0'
                : 'opacity-0 translate-y-10'
            }`}
          >
            <p className="text-base sm:text-lg text-gray-300 leading-relaxed">
              {isCloudSyncAvailable
                ? 'Premium gives you everything you need to stay on top of your subscriptions: detailed analytics, automatic cloud backup, and timely reminders. One low price, no hidden costs, and no compromises.'
                : 'This project is completely free and open source. All features are available to everyone. If you find it useful, consider supporting its continued development with a one-time contribution.'}
            </p>
          </div>

          {/* Pricing Cards */}
          <div className="grid md:grid-cols-2 gap-6 sm:gap-8 max-w-6xl mx-auto mb-12">
            {pricingTiers.map((tier, index) => (
              <PricingCard
                key={tier.name}
                tier={tier}
                index={index}
                isVisible={isVisible}
              />
            ))}
          </div>

        </div>
      </div>
    </div>
  );
}

interface PricingCardProps {
  tier: PricingTier;
  index: number;
  isVisible: boolean;
}

function PricingCard({ tier, index, isVisible }: PricingCardProps) {
  // 判断是否是Support Developer模式
  const isSupportMode = tier.name === 'Support Developer';

  return (
    <div
      className={`relative transition-all duration-1000 ${
        isVisible
          ? 'opacity-100 translate-y-0'
          : 'opacity-0 translate-y-10'
      }`}
      style={{ transitionDelay: `${400 + index * 150}ms` }}
    >
      {/* Highlighted Badge */}
      {tier.highlighted && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-10">
          <div className="flex items-center gap-1.5 px-4 py-1.5 bg-gradient-to-r from-purple-600 to-pink-600 rounded-full text-white text-sm font-medium shadow-lg">
            <Sparkles className="w-4 h-4" />
            {isSupportMode ? 'Support Open Source' : 'Most Popular'}
          </div>
        </div>
      )}

      {/* Card */}
      <div
        className={`h-full rounded-2xl p-6 sm:p-8 backdrop-blur-sm transition-colors duration-300 ${
          tier.highlighted
            ? 'bg-white/10 border-2 border-purple-500/50 shadow-2xl shadow-purple-500/20 hover:shadow-purple-500/30'
            : 'bg-white/5 border border-white/10 hover:bg-white/10'
        }`}
      >
        {/* Header */}
        <div className="mb-6">
          <h3 className="text-2xl sm:text-3xl font-bold text-white mb-2">
            {tier.name}
          </h3>
          <p className="text-gray-400 text-sm sm:text-base">
            {tier.description}
          </p>
        </div>

        {/* Price */}
        <div className="mb-8">
          <div className="flex items-baseline gap-2">
            <span className="text-4xl sm:text-5xl font-bold text-white">
              {tier.price}
            </span>
            <span className="text-gray-400">
              {tier.period}
            </span>
          </div>
        </div>

        {/* CTA Button */}
        <button
          onClick={tier.buttonAction}
          disabled={!tier.buttonAction || !config.features.payment}
          className={`w-full py-3 sm:py-4 rounded-xl font-semibold text-base sm:text-lg transition-all duration-300 mb-8 ${
            tier.highlighted
              ? !tier.buttonAction || !config.features.payment
                ? 'bg-gray-600 cursor-not-allowed text-gray-300'
                : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white shadow-lg hover:shadow-xl hover:scale-105'
              : 'bg-white/10 hover:bg-white/20 text-white'
          }`}
        >
          {tier.buttonText}
        </button>

        {/* Features List */}
        <div className="space-y-3 sm:space-y-4">
          {tier.features.map((feature, idx) => (
            <div
              key={idx}
              className="flex items-start gap-3"
            >
              <div
                className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5 ${
                  feature.included
                    ? tier.highlighted
                      ? 'bg-purple-500/20'
                      : 'bg-green-500/20'
                    : 'bg-gray-500/20'
                }`}
              >
                {feature.included ? (
                  <Check
                    className={`w-3 h-3 ${
                      tier.highlighted ? 'text-purple-400' : 'text-green-400'
                    }`}
                  />
                ) : (
                  <span className="text-gray-500 text-xs">—</span>
                )}
              </div>
              <span
                className={`text-sm sm:text-base ${
                  feature.included ? 'text-gray-200' : 'text-gray-500 line-through'
                }`}
              >
                {feature.text}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
