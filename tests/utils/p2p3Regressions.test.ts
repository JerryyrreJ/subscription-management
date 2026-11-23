import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const readSource = (relativePath: string) =>
 readFileSync(new URL(relativePath, import.meta.url), 'utf8');

test('P2 #17: RenewalHeatmap uses mobile 7-column button grid and keyboard-accessible edge-safe desktop cells', () => {
 const source = readSource('../../src/components/RenewalHeatmap.tsx');
 assert.match(source, /grid-cols-7/);
 assert.match(source, /getTooltipAlignClasses/);
 assert.match(source, /<button[\s\S]*aria-label=\{getCellAriaLabel\(item\)\}/);
 assert.match(source, /onFocus=\{\(\) => setHoveredDay\(item\)\}/);
});

test('P2 #18: Report charts use theme-aware custom tooltips, no duplicate legend, keyed pie items, afterprint cleanup, and Premium consistency', () => {
 const trendSource = readSource('../../src/components/SpendingTrendChart.tsx');
 const pieSource = readSource('../../src/components/CategoryPieChart.tsx');
 const topSource = readSource('../../src/components/TopSubscriptionsChart.tsx');
 const reportSource = readSource('../../src/components/AdvancedReport.tsx');

 for (const src of [trendSource, pieSource, topSource]) {
  assert.doesNotMatch(src, /rgba\(255,\s*255,\s*255,\s*0\.98\)/);
  assert.match(src, /dark:bg-\[#1a1c1e\]\/95/);
 }
 assert.doesNotMatch(trendSource, /<Legend\b/);
 assert.match(pieSource, /key=\{`\$\{item\.category\}-\$\{index\}`\}/);
 assert.match(reportSource, /addEventListener\('afterprint',\s*cleanupPrint/);
 assert.match(reportSource, /addEventListener\('keydown',\s*handleKeyDown\)/);
 assert.match(reportSource, /analytics:premiumPlanLabel/);
 assert.doesNotMatch(reportSource, /Pro · \$9 USD/);
});

test('P2 #19: LandingPage provides a mobile navigation menu toggle and responsive mobile nav links', () => {
 const landingSource = readSource('../../src/components/landing/LandingPage.tsx');
 const landingCss = readSource('../../src/components/landing/landing.css');

 assert.match(landingSource, /landing-menu-toggle/);
 assert.match(landingSource, /id="landing-mobile-nav"/);
 assert.match(landingSource, /aria-expanded=\{mobileMenuOpen\}/);
 assert.match(landingCss, /\.landing-menu-toggle\s*\{\s*display:\s*inline-flex;\s*\}/);
 assert.match(landingCss, /\.landing-mobile-nav\s*\{/);
});

test('P3 #20: Modals support Escape/backdrop close and nested controls stop Escape propagation', () => {
 const authSource = readSource('../../src/components/AuthModal.tsx');
 const aiSource = readSource('../../src/components/AiCaptureModal.tsx');
 const deleteCatSource = readSource('../../src/components/DeleteCategoryDialog.tsx');
 const restoreSource = readSource('../../src/components/RestoreDefaultsDialog.tsx');
 const selectSource = readSource('../../src/components/CustomSelect.tsx');
 const chipsSource = readSource('../../src/components/subscription-form/CategoryChips.tsx');

 assert.match(authSource, /event\.key === 'Escape'/);
 assert.match(authSource, /onMouseDown=/);
 assert.match(aiSource, /event\.key !== 'Escape'/);
 assert.match(aiSource, /onMouseDown=/);
 assert.match(deleteCatSource, /aria-modal="true"/);
 assert.match(deleteCatSource, /mobile-modal-panel/);
 assert.match(restoreSource, /aria-modal="true"/);
 assert.match(restoreSource, /mobile-modal-viewport/);
 assert.match(selectSource, /addEventListener\('keydown',\s*handleEscape,\s*true\)/);
 assert.match(chipsSource, /e\.nativeEvent\.stopPropagation\(\)/);
});

test('P3 #21: AuthModal and AccountSettingsContent share strong password rules, visibility toggles, and localized nickname errors', () => {
 const authSource = readSource('../../src/components/AuthModal.tsx');
 const accountSource = readSource('../../src/components/settings/AccountSettingsContent.tsx');
 const recoverySource = readSource('../../src/components/PasswordRecoveryModal.tsx');

 assert.match(authSource, /validateStrongPassword/);
 assert.match(authSource, /showPassword \? <EyeOff/);
 assert.doesNotMatch(authSource, /dark:text-zinc-600 dark:text-zinc-400/);
 assert.match(accountSource, /validateStrongPassword/);
 assert.match(accountSource, /showPassword \? <EyeOff/);
 assert.match(accountSource, /showConfirmPassword \? <EyeOff/);
 assert.match(accountSource, /accountModals:nicknameLengthInvalid/);
 assert.match(recoverySource, /validateStrongPassword/);
});

test('P3 #22: Copy, i18n, details completeness, developer tools, reduced motion, and legacy dead-file cleanup are complete', () => {
 const appSource = readSource('../../src/App.tsx');
 const detailsSource = readSource('../../src/components/SubscriptionDetailsModal.tsx');
 const agentCardSource = readSource('../../src/components/settings/AgentSetupCard.tsx');
 const devApiSource = readSource('../../src/components/DeveloperApiModal.tsx');
 const selectSource = readSource('../../src/components/CustomSelect.tsx');
 const cardSource = readSource('../../src/components/SubscriptionCard.tsx');
 const indexCss = readSource('../../src/index.css');
 const zhAnalytics = readSource('../../src/i18n/locales/zh-CN/analytics.ts');

 assert.doesNotMatch(appSource, /title=\{t\('userMenu:loginToSync'\)\}[\s\S]{0,120}loadingNotificationSettingsDescription/);
 assert.doesNotMatch(appSource, /title=\{t\('userMenu:importData'\)\}[\s\S]{0,120}loadingNotificationSettingsDescription/);
 assert.doesNotMatch(appSource, /title=\{t\('auth:setNewPasswordTitle'\)\}[\s\S]{0,120}loadingNotificationSettingsDescription/);
 assert.match(detailsSource, /subscriptionCard:customPeriodDaysOne/);
 assert.match(detailsSource, /subscriptionDetails:notificationsEnabled/);
 assert.match(agentCardSource, /copySnippet/);
 assert.match(devApiSource, /developerApi:requestsPerMinute/);
 assert.match(devApiSource, /i18n\.language/);
 assert.doesNotMatch(selectSource, /No options available/);
 assert.match(cardSource, /Math\.min\(index,\s*8\)/);
 assert.match(indexCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
 assert.doesNotMatch(zhAnalytics, /currencyHelp:.*Overview/);
 assert.match(zhAnalytics, /dayNumber:\s*'每月 \{\{day\}\} 日'/);

 for (const removed of [
  '../../src/components/EditNicknameModal.tsx',
  '../../src/components/EditEmailModal.tsx',
  '../../src/components/EditPasswordModal.tsx',
  '../../src/components/SyncIndicator.tsx',
  '../../src/components/Tooltip.tsx',
 ]) {
  assert.equal(existsSync(new URL(removed, import.meta.url)), false, `Expected ${removed} to be removed`);
 }
});
