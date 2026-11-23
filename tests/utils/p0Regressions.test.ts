import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const readSource = (relativePath: string) =>
 readFileSync(new URL(relativePath, import.meta.url), 'utf8');

test('App root uses overflow-x-clip instead of overflow-hidden so sticky header works', () => {
 const appSource = readSource('../../src/App.tsx');
 assert.match(appSource, /min-h-screen pb-4 relative overflow-x-clip/);
 assert.doesNotMatch(appSource, /min-h-screen pb-4 relative overflow-hidden/);
});

test('PricingModal table headers render single dollar sign without double-dollar typo', () => {
 const pricingSource = readSource('../../src/components/PricingModal.tsx');
 assert.match(pricingSource, /Free <small>\$\{FREE_PRICE_USD\}<\/small>/);
 assert.match(pricingSource, /Premium <small>\$\{PREMIUM_PRICE_USD\}<\/small>/);
 assert.doesNotMatch(pricingSource, /\$\{`\$\$/);
});

test('LanguageSwitcher guards null relatedTarget on blur to support touch browsers and Safari', () => {
 const switcherSource = readSource('../../src/components/LanguageSwitcher.tsx');
 assert.match(
  switcherSource,
  /if\s*\(\s*event\.relatedTarget\s*&&\s*!event\.currentTarget\.contains\(event\.relatedTarget\)\s*\)\s*setIsOpen\(false\)/
 );
});

test('SubscriptionFormFields preserves draft values instead of resetting on initialValues changes', () => {
 const fieldsSource = readSource('../../src/components/subscription-form/SubscriptionFormFields.tsx');
 assert.doesNotMatch(fieldsSource, /setFormData\(initialValues\)/);
 assert.match(fieldsSource, /pendingEnableNotificationRef/);
});

test('SubscriptionDetailsModal requires delete confirmation and App provides undo after deletion', () => {
 const detailsSource = readSource('../../src/components/SubscriptionDetailsModal.tsx');
 const appSource = readSource('../../src/App.tsx');
 assert.match(detailsSource, /isConfirmingDelete/);
 assert.match(detailsSource, /subscriptionDetails:confirmDelete/);
 assert.match(appSource, /const handleDeleteSubscription[\s\S]*showUndoAction\(/);
});
