import test from 'node:test';
import assert from 'node:assert/strict';
import { assertAllowedCheckoutRedirectUrl } from '../../src/services/payment.ts';

test('assertAllowedCheckoutRedirectUrl permits Stripe-hosted HTTPS checkout URLs and same-origin URLs', () => {
  assert.equal(
    assertAllowedCheckoutRedirectUrl(
      'https://checkout.stripe.com/c/pay/cs_test_123#fidkdWxOYHwnPyd1blpxYHZxWjA0',
      'https://steadyrenew.com'
    ),
    'https://checkout.stripe.com/c/pay/cs_test_123#fidkdWxOYHwnPyd1blpxYHZxWjA0'
  );
  assert.equal(
    assertAllowedCheckoutRedirectUrl(
      'https://pay.stripe.com/receipts/test',
      'https://steadyrenew.com'
    ),
    'https://pay.stripe.com/receipts/test'
  );
  assert.equal(
    assertAllowedCheckoutRedirectUrl(
      'https://steadyrenew.com/app?payment=success',
      'https://steadyrenew.com'
    ),
    'https://steadyrenew.com/app?payment=success'
  );
});

test('assertAllowedCheckoutRedirectUrl rejects untrusted origins, non-HTTPS Stripe URLs, and dangerous schemes', () => {
  const disallowed = [
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    '//evil.example/phish',
    'http://checkout.stripe.com/c/pay/cs_test_123',
    'https://evil.example/checkout.stripe.com',
    'https://checkout.stripe.com.evil.example/pay',
    'https://user:pass@checkout.stripe.com/c/pay/cs_test_123',
  ];

  for (const url of disallowed) {
    assert.throws(
      () => assertAllowedCheckoutRedirectUrl(url, 'https://steadyrenew.com'),
      /Invalid checkout redirect URL|Untrusted checkout redirect URL|credentials/
    );
  }
});
