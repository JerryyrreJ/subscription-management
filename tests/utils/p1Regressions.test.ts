import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const readSource = (relativePath: string) =>
 readFileSync(new URL(relativePath, import.meta.url), 'utf8');

test('P1 #9: App persists Dashboard baseCurrency, viewMode, and sortConfig via dashboardPreferences', () => {
 const appSource = readSource('../../src/App.tsx');
 assert.match(appSource, /loadBaseCurrency\(i18n\.language\)/);
 assert.match(appSource, /saveBaseCurrency\(/);
 assert.match(appSource, /loadViewMode\(\)/);
 assert.match(appSource, /saveViewMode\(/);
 assert.match(appSource, /loadSortConfig\(\)/);
 assert.match(appSource, /saveSortConfig\(/);
});

test('P1 #10: Trailing add card always opens manual add modal and bases empty copy on total subscriptions', () => {
 const appSource = readSource('../../src/App.tsx');
 assert.match(appSource, /onClick=\{\(\) => setIsAddModalOpen\(true\)\}\s*\n\s*className="group min-h-\[200px\]/);
 assert.match(appSource, /\{subscriptions\.length === 0\s*\n\s*\? t\('app:addFirstSubscription'\)/);
});

test('P1 #11: NotificationSettingsModal validates Bark URL inline and surfaces save/cloud-sync feedback', () => {
 const modalSource = readSource('../../src/components/NotificationSettingsModal.tsx');
 const appSource = readSource('../../src/App.tsx');
 assert.match(modalSource, /setBarkUrl\(''\)/);
 assert.match(modalSource, /notificationSettings:barkUrlInvalidHint/);
 assert.match(modalSource, /notificationSettings:saveCloudFailed/);
 assert.match(modalSource, /notificationSettings:settingsSaved/);
 assert.match(appSource, /return \{ cloudSynced: false \}/);
});

test('P1 #12: CustomDatePicker syncs visible month on open/Today, supports month-year quick picker, and captures Escape', () => {
 const pickerSource = readSource('../../src/components/CustomDatePicker.tsx');
 assert.match(pickerSource, /pickerView/);
 assert.match(pickerSource, /setPickerView\(/);
 assert.match(pickerSource, /event\.stopPropagation\(\)/);
 assert.match(pickerSource, /addEventListener\('keydown',\s*handleKeyDown,\s*true\)/);
});

test('P1 #13: AI Capture supports paste, drag-drop, batch save-all, Auth contextBanner, and pausable dismissible Undo bar', () => {
 const aiSource = readSource('../../src/components/AiCaptureModal.tsx');
 const authSource = readSource('../../src/components/AuthModal.tsx');
 const appSource = readSource('../../src/App.tsx');

 assert.match(aiSource, /onPaste=/);
 assert.match(aiSource, /onDrop=/);
 assert.match(aiSource, /e\.currentTarget\.value = ''/);
 assert.match(aiSource, /const saveAllDrafts/);
 assert.match(aiSource, /aiCapture:saveAll/);
 assert.match(authSource, /contextBanner\?:/);
 assert.match(appSource, /contextBanner=\{authModalContext === 'ai-capture'/);
 assert.match(appSource, /onMouseEnter=\{pauseUndoTimer\}/);
 assert.match(appSource, /animationPlayState:\s*isUndoPaused \? 'paused' : 'running'/);
 assert.match(appSource, /aria-label=\{t\('aiCapture:undo\.dismiss'\)\}/);
});

test('P1 #14: Dashboard excludes trials from paid spend and SubscriptionCard/Details surface expired trial recovery', () => {
 const dashboardSource = readSource('../../src/components/Dashboard.tsx');
 const cardSource = readSource('../../src/components/SubscriptionCard.tsx');
 const detailsSource = readSource('../../src/components/SubscriptionDetailsModal.tsx');

 assert.match(dashboardSource, /paidSubscriptions/);
 assert.match(dashboardSource, /trialSubscriptions/);
 assert.match(dashboardSource, /onTrialsClick/);
 assert.match(cardSource, /data-trial-expired=/);
 assert.match(cardSource, /subscriptionCard:trialExpiredBadge/);
 assert.match(detailsSource, /onConvertTrialToPaid/);
 assert.match(detailsSource, /subscriptionDetails:convertToPaid/);
 assert.match(detailsSource, /subscriptionDetails:deleteExpiredTrial/);
});

test('P1 #15: App provides search input, quick filter pills, and empty-filter reset', () => {
 const appSource = readSource('../../src/App.tsx');
 assert.match(appSource, /app:searchPlaceholder/);
 assert.match(appSource, /app:filterUpcoming/);
 assert.match(appSource, /app:filterTrials/);
 assert.match(appSource, /app:clearFilters/);
});

test('P1 #16: Native alert/confirm removed from App and DeveloperApiModal; ImportDataModal loading, sync indicator, and form error propagation wired', () => {
 const appSource = readSource('../../src/App.tsx');
 const apiSource = readSource('../../src/components/DeveloperApiModal.tsx');
 const importSource = readSource('../../src/components/ImportDataModal.tsx');
 const menuSource = readSource('../../src/components/UserMenu.tsx');

 assert.doesNotMatch(appSource, /\balert\(/);
 assert.doesNotMatch(apiSource, /\bwindow\.confirm\(/);
 assert.match(apiSource, /confirmRevokeId/);
 assert.match(importSource, /isImporting/);
 assert.match(menuSource, /pendingSyncCount/);
 assert.match(appSource, /<AppToast/);
 assert.match(appSource, /const handleAddSubscription[\s\S]*?throw error;/);
 assert.match(appSource, /const handleEditSubscription[\s\S]*?throw error;/);
});
