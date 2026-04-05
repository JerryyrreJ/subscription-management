import { app as enApp } from './locales/en/app';
import { auth as enAuth } from './locales/en/auth';
import { categorySettings as enCategorySettings } from './locales/en/categorySettings';
import { common as enCommon } from './locales/en/common';
import { dashboard as enDashboard } from './locales/en/dashboard';
import { editSubscription as enEditSubscription } from './locales/en/editSubscription';
import { addSubscription as enAddSubscription } from './locales/en/addSubscription';
import { accountModals as enAccountModals } from './locales/en/accountModals';
import { importData as enImportData } from './locales/en/importData';
import { notificationSettings as enNotificationSettings } from './locales/en/notificationSettings';
import { analytics as enAnalytics } from './locales/en/analytics';
import { footer as enFooter } from './locales/en/footer';
import { pricing as enPricing } from './locales/en/pricing';
import { subscriptionDetails as enSubscriptionDetails } from './locales/en/subscriptionDetails';
import { subscriptionCard as enSubscriptionCard } from './locales/en/subscriptionCard';
import { theme as enTheme } from './locales/en/theme';
import { userMenu as enUserMenu } from './locales/en/userMenu';
import { app as zhApp } from './locales/zh-CN/app';
import { auth as zhAuth } from './locales/zh-CN/auth';
import { categorySettings as zhCategorySettings } from './locales/zh-CN/categorySettings';
import { common as zhCommon } from './locales/zh-CN/common';
import { dashboard as zhDashboard } from './locales/zh-CN/dashboard';
import { editSubscription as zhEditSubscription } from './locales/zh-CN/editSubscription';
import { addSubscription as zhAddSubscription } from './locales/zh-CN/addSubscription';
import { accountModals as zhAccountModals } from './locales/zh-CN/accountModals';
import { importData as zhImportData } from './locales/zh-CN/importData';
import { notificationSettings as zhNotificationSettings } from './locales/zh-CN/notificationSettings';
import { analytics as zhAnalytics } from './locales/zh-CN/analytics';
import { footer as zhFooter } from './locales/zh-CN/footer';
import { pricing as zhPricing } from './locales/zh-CN/pricing';
import { subscriptionDetails as zhSubscriptionDetails } from './locales/zh-CN/subscriptionDetails';
import { subscriptionCard as zhSubscriptionCard } from './locales/zh-CN/subscriptionCard';
import { theme as zhTheme } from './locales/zh-CN/theme';
import { userMenu as zhUserMenu } from './locales/zh-CN/userMenu';

export const resources = {
 en: {
  accountModals: enAccountModals,
  addSubscription: enAddSubscription,
  analytics: enAnalytics,
  common: enCommon,
  app: enApp,
  auth: enAuth,
  categorySettings: enCategorySettings,
  dashboard: enDashboard,
  editSubscription: enEditSubscription,
  footer: enFooter,
  importData: enImportData,
  notificationSettings: enNotificationSettings,
  pricing: enPricing,
  subscriptionDetails: enSubscriptionDetails,
  subscriptionCard: enSubscriptionCard,
  theme: enTheme,
  userMenu: enUserMenu,
 },
 'zh-CN': {
  accountModals: zhAccountModals,
  addSubscription: zhAddSubscription,
  analytics: zhAnalytics,
  common: zhCommon,
  app: zhApp,
  auth: zhAuth,
  categorySettings: zhCategorySettings,
  dashboard: zhDashboard,
  editSubscription: zhEditSubscription,
  footer: zhFooter,
  importData: zhImportData,
  notificationSettings: zhNotificationSettings,
  pricing: zhPricing,
  subscriptionDetails: zhSubscriptionDetails,
  subscriptionCard: zhSubscriptionCard,
  theme: zhTheme,
  userMenu: zhUserMenu,
 },
} as const;
