export type PasswordValidationErrorCode = 'too_short' | 'needs_case' | 'needs_number';

export interface PasswordRuleChecklist {
 hasMinLength: boolean;
 hasUpperAndLower: boolean;
 hasNumber: boolean;
}

export const MIN_PASSWORD_LENGTH = 8;

export function getPasswordRuleChecklist(password: string): PasswordRuleChecklist {
 return {
  hasMinLength: password.length >= MIN_PASSWORD_LENGTH,
  hasUpperAndLower: /(?=.*[a-z])(?=.*[A-Z])/.test(password),
  hasNumber: /(?=.*\d)/.test(password),
 };
}

export function validateStrongPassword(password: string): PasswordValidationErrorCode | null {
 const rules = getPasswordRuleChecklist(password);
 if (!rules.hasMinLength) {
  return 'too_short';
 }
 if (!rules.hasUpperAndLower) {
  return 'needs_case';
 }
 if (!rules.hasNumber) {
  return 'needs_number';
 }
 return null;
}

export function getPasswordValidationKey(code: PasswordValidationErrorCode): string {
 switch (code) {
  case 'too_short':
   return 'accountModals:passwordTooShort';
  case 'needs_case':
   return 'accountModals:passwordNeedsCase';
  case 'needs_number':
   return 'accountModals:passwordNeedsNumber';
 }
}
