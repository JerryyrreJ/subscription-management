import { useState } from 'react';
import { AlertCircle, CheckCircle, Eye, EyeOff, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface PasswordRecoveryModalProps {
 isOpen: boolean;
 onClose: () => void;
 onUpdatePassword: (newPassword: string) => Promise<void>;
}

export function PasswordRecoveryModal({ isOpen, onClose, onUpdatePassword }: PasswordRecoveryModalProps) {
 const { t } = useTranslation(['auth', 'accountModals', 'app']);
 const [newPassword, setNewPassword] = useState('');
 const [confirmPassword, setConfirmPassword] = useState('');
 const [showPassword, setShowPassword] = useState(false);
 const [showConfirmPassword, setShowConfirmPassword] = useState(false);
 const [isLoading, setIsLoading] = useState(false);
 const [error, setError] = useState<string | null>(null);
 const [success, setSuccess] = useState(false);

 const validatePassword = (password: string) => {
 if (password.length < 8) {
 return t('accountModals:passwordTooShort');
 }

 if (!/(?=.*[a-z])(?=.*[A-Z])/.test(password)) {
 return t('accountModals:passwordNeedsCase');
 }

 if (!/(?=.*\d)/.test(password)) {
 return t('accountModals:passwordNeedsNumber');
 }

 return null;
 };

 const resetForm = () => {
 setNewPassword('');
 setConfirmPassword('');
 setShowPassword(false);
 setShowConfirmPassword(false);
 setError(null);
 setSuccess(false);
 };

 const handleClose = () => {
 if (isLoading) {
 return;
 }

 resetForm();
 onClose();
 };

 const handleSubmit = async (event: React.FormEvent) => {
 event.preventDefault();

 const passwordError = validatePassword(newPassword);
 if (passwordError) {
 setError(passwordError);
 return;
 }

 if (newPassword !== confirmPassword) {
 setError(t('accountModals:passwordsDoNotMatch'));
 return;
 }

 setIsLoading(true);
 setError(null);

 try {
 await onUpdatePassword(newPassword);
 setSuccess(true);
 setNewPassword('');
 setConfirmPassword('');
 window.setTimeout(() => {
  resetForm();
  onClose();
 }, 2000);
 } catch (error) {
 setError(error instanceof Error ? error.message : t('accountModals:passwordUpdateFailed'));
 } finally {
 setIsLoading(false);
 }
 };

 if (!isOpen) {
 return null;
 }

 const passwordValidation = validatePassword(newPassword);
 const passwordsMatch = Boolean(newPassword && confirmPassword && newPassword === confirmPassword);

 return (
 <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center p-4 z-50 modal-overlay">
 <div className="bg-white dark:bg-[#1a1c1e] rounded-3xl shadow-apple-lg max-w-md w-full p-6 modal-content">
 <div className="flex items-start justify-between gap-4 mb-6">
 <div>
 <h2 className="text-2xl font-bold text-gray-800 dark:text-white tracking-tight">
 {t('auth:setNewPasswordTitle')}
 </h2>
 <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
 {t('auth:setNewPasswordBody')}
 </p>
 </div>
 <button
 type="button"
 onClick={handleClose}
 disabled={isLoading}
 className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors disabled:opacity-50"
 >
 <X className="w-6 h-6"/>
 </button>
 </div>

 {success ? (
 <div className="text-center py-8">
 <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
 <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400"/>
 </div>
 <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
 {t('auth:passwordResetSuccess')}
 </h3>
 <p className="text-sm text-gray-600 dark:text-gray-400">
 {t('auth:passwordResetSuccessBody')}
 </p>
 </div>
 ) : (
 <form onSubmit={handleSubmit} className="space-y-4">
 <div>
 <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
 {t('accountModals:newPasswordLabel')}
 </label>
 <div className="relative">
 <input
 type={showPassword ? 'text' : 'password'}
 value={newPassword}
 onChange={(event) => setNewPassword(event.target.value)}
 placeholder={t('accountModals:newPasswordPlaceholder')}
 required
 disabled={isLoading}
 className="w-full px-3 py-3 pr-10 border border-gray-300 dark:border-gray-600 rounded-2xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-colors disabled:opacity-50"
 />
 <button
 type="button"
 onClick={() => setShowPassword(!showPassword)}
 className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
 >
 {showPassword ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
 </button>
 </div>
 </div>

 <div>
 <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
 {t('accountModals:confirmNewPasswordLabel')}
 </label>
 <div className="relative">
 <input
 type={showConfirmPassword ? 'text' : 'password'}
 value={confirmPassword}
 onChange={(event) => setConfirmPassword(event.target.value)}
 placeholder={t('accountModals:confirmNewPasswordPlaceholder')}
 required
 disabled={isLoading}
 className="w-full px-3 py-3 pr-10 border border-gray-300 dark:border-gray-600 rounded-2xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-colors disabled:opacity-50"
 />
 <button
 type="button"
 onClick={() => setShowConfirmPassword(!showConfirmPassword)}
 className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
 >
 {showConfirmPassword ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
 </button>
 </div>
 </div>

 <div className="bg-gray-50 dark:bg-gray-700/50 rounded-2xl p-3">
 <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">{t('accountModals:passwordRequirementsTitle')}</p>
 <ul className="space-y-1 text-xs">
 <li className={`flex items-center gap-2 ${newPassword.length >= 8 ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}>
 <div className={`w-1.5 h-1.5 rounded-full ${newPassword.length >= 8 ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
 {t('accountModals:passwordRuleLength')}
 </li>
 <li className={`flex items-center gap-2 ${/(?=.*[a-z])(?=.*[A-Z])/.test(newPassword) ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}>
 <div className={`w-1.5 h-1.5 rounded-full ${/(?=.*[a-z])(?=.*[A-Z])/.test(newPassword) ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
 {t('accountModals:passwordRuleCase')}
 </li>
 <li className={`flex items-center gap-2 ${/(?=.*\d)/.test(newPassword) ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}>
 <div className={`w-1.5 h-1.5 rounded-full ${/(?=.*\d)/.test(newPassword) ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
 {t('accountModals:passwordRuleNumber')}
 </li>
 {confirmPassword && (
 <li className={`flex items-center gap-2 ${passwordsMatch ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
 <div className={`w-1.5 h-1.5 rounded-full ${passwordsMatch ? 'bg-green-500' : 'bg-red-500'}`} />
 {t('accountModals:passwordRuleMatch')}
 </li>
 )}
 </ul>
 </div>

 {error && (
 <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-2xl">
 <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0"/>
 <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
 </div>
 )}

 <div className="flex gap-3 pt-2">
 <button
 type="button"
 onClick={handleClose}
 disabled={isLoading}
 className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-2xl hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
 >
 {t('app:cancel')}
 </button>
 <button
 type="submit"
 disabled={isLoading || !newPassword || !confirmPassword || Boolean(passwordValidation) || !passwordsMatch}
 className="flex-1 px-4 py-3 bg-emerald-600 dark:bg-emerald-500 text-white rounded-2xl hover:bg-emerald-700 dark:hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
 >
 {isLoading ? t('accountModals:updating') : t('auth:saveNewPassword')}
 </button>
 </div>
 </form>
 )}
 </div>
 </div>
 );
}
