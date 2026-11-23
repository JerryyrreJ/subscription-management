import test from 'node:test';
import assert from 'node:assert/strict';
import {
 getPasswordRuleChecklist,
 getPasswordValidationKey,
 validateStrongPassword,
} from '../../src/utils/passwordValidation.ts';

test('validateStrongPassword enforces unified 8-char, mixed-case, and digit rules', () => {
 assert.equal(validateStrongPassword('Abc1234'), 'too_short');
 assert.equal(validateStrongPassword('abcdefgh1'), 'needs_case');
 assert.equal(validateStrongPassword('ABCDEFGH1'), 'needs_case');
 assert.equal(validateStrongPassword('Abcdefgh'), 'needs_number');
 assert.equal(validateStrongPassword('Abcdef12'), null);
});

test('getPasswordRuleChecklist and getPasswordValidationKey map each rule cleanly', () => {
 assert.deepEqual(getPasswordRuleChecklist('Abcdef12'), {
  hasMinLength: true,
  hasUpperAndLower: true,
  hasNumber: true,
 });
 assert.equal(getPasswordValidationKey('too_short'), 'accountModals:passwordTooShort');
 assert.equal(getPasswordValidationKey('needs_case'), 'accountModals:passwordNeedsCase');
 assert.equal(getPasswordValidationKey('needs_number'), 'accountModals:passwordNeedsNumber');
});
