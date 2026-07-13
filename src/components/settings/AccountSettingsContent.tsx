import { useEffect, useState } from 'react';
import { User, Mail, Lock, AlertCircle, Check, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DeleteAccountDialog } from '../DeleteAccountDialog';

interface AccountSettingsContentProps {
  userEmail: string;
  userNickname: string;
  onUpdateNickname: (newNickname: string) => Promise<void>;
  onUpdateEmail: (newEmail: string) => Promise<void>;
  onUpdatePassword: (newPassword: string) => Promise<void>;
  onDeleteAccount: () => Promise<void>;
}

export function AccountSettingsContent({
  userEmail,
  userNickname,
  onUpdateNickname,
  onUpdateEmail,
  onUpdatePassword,
  onDeleteAccount
}: AccountSettingsContentProps) {
  const { t } = useTranslation(['accountModals', 'settingsHub']);
  
  const [nickname, setNickname] = useState(userNickname || '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  
  const [loadingState, setLoadingState] = useState<{ type: string, loading: boolean }>({ type: '', loading: false });
  const [errorState, setErrorState] = useState<{ type: string, error: string }>({ type: '', error: '' });
  const [successState, setSuccessState] = useState<{ type: string, success: boolean }>({ type: '', success: false });

  useEffect(() => {
    setNickname(userNickname || '');
  }, [userNickname]);

  const validatePassword = (value: string) => {
    if (value.length < 8) {
      return t('accountModals:passwordTooShort');
    }

    if (!/(?=.*[a-z])(?=.*[A-Z])/.test(value)) {
      return t('accountModals:passwordNeedsCase');
    }

    if (!/(?=.*\d)/.test(value)) {
      return t('accountModals:passwordNeedsNumber');
    }

    return null;
  };

  const handleUpdateNickname = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nickname.trim() || nickname === userNickname) return;
    
    setLoadingState({ type: 'nickname', loading: true });
    setErrorState({ type: '', error: '' });
    
    try {
      await onUpdateNickname(nickname.trim());
      setSuccessState({ type: 'nickname', success: true });
      setTimeout(() => setSuccessState({ type: '', success: false }), 2000);
    } catch (error) {
      setErrorState({ type: 'nickname', error: error instanceof Error ? error.message : t('accountModals:nicknameUpdateFailed') });
    } finally {
      setLoadingState({ type: '', loading: false });
    }
  };

  const handleUpdateEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || email === userEmail) return;
    
    setLoadingState({ type: 'email', loading: true });
    setErrorState({ type: '', error: '' });
    
    try {
      await onUpdateEmail(email.trim());
      setSuccessState({ type: 'email', success: true });
      setEmail('');
      setTimeout(() => setSuccessState({ type: '', success: false }), 3000);
    } catch (error) {
      setErrorState({ type: 'email', error: error instanceof Error ? error.message : t('accountModals:emailUpdateFailed') });
    } finally {
      setLoadingState({ type: '', loading: false });
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();

    const passwordError = validatePassword(password);
    if (passwordError) {
      setErrorState({ type: 'password', error: passwordError });
      return;
    }

    if (password !== confirmPassword) {
      setErrorState({ type: 'password', error: t('accountModals:passwordsDoNotMatch') });
      return;
    }
    
    setLoadingState({ type: 'password', loading: true });
    setErrorState({ type: '', error: '' });
    
    try {
      await onUpdatePassword(password);
      setSuccessState({ type: 'password', success: true });
      setPassword('');
      setConfirmPassword('');
      setTimeout(() => setSuccessState({ type: '', success: false }), 2000);
    } catch (error) {
      setErrorState({ type: 'password', error: error instanceof Error ? error.message : t('accountModals:passwordUpdateFailed') });
    } finally {
      setLoadingState({ type: '', loading: false });
    }
  };

  const passwordValidation = validatePassword(password);
  const passwordsMatch = Boolean(password && confirmPassword && password === confirmPassword);

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-1">
          {t('settingsHub:accountTitle')}
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {t('settingsHub:accountSubtitle')}
        </p>
      </div>

      <div className="space-y-6">
        {/* Nickname Section */}
        <section className="bg-white dark:bg-white/5 border border-gray-200/50 dark:border-white/10 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center">
              <User className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">{t('accountModals:editNicknameTitle')}</h3>
          </div>
          
          <form onSubmit={handleUpdateNickname} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('accountModals:displayNameLabel')}
              </label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder={t('accountModals:displayNamePlaceholder')}
                className="w-full px-4 py-3 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
              />
              <p className="text-xs text-gray-500 mt-2">{t('accountModals:displayNameHint')}</p>
            </div>
            {errorState.type === 'nickname' && (
              <p className="text-sm text-red-500 flex items-center gap-1"><AlertCircle className="w-4 h-4"/> {errorState.error}</p>
            )}
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={loadingState.loading || !nickname.trim() || nickname === userNickname}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl font-medium transition-colors flex items-center gap-2"
              >
                {successState.type === 'nickname' ? <><Check className="w-4 h-4"/> {t('settingsHub:saved')}</> : t('settingsHub:saveChanges')}
              </button>
            </div>
          </form>
        </section>

        {/* Email Section */}
        <section className="bg-white dark:bg-white/5 border border-gray-200/50 dark:border-white/10 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center">
              <Mail className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">{t('accountModals:updateEmailTitle')}</h3>
          </div>
          
          <form onSubmit={handleUpdateEmail} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('accountModals:currentEmailLabel')}
                </label>
                <input
                  type="email"
                  value={userEmail}
                  disabled
                  className="w-full px-4 py-3 bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl text-gray-500 dark:text-gray-400 cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('accountModals:newEmailLabel')}
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('accountModals:newEmailPlaceholder')}
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                />
              </div>
            </div>
            {errorState.type === 'email' && (
              <p className="text-sm text-red-500 flex items-center gap-1"><AlertCircle className="w-4 h-4"/> {errorState.error}</p>
            )}
            {successState.type === 'email' && (
              <p className="text-sm text-emerald-600 flex items-center gap-1"><Check className="w-4 h-4"/> {t('accountModals:emailUpdateInitiatedBody')}</p>
            )}
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={loadingState.loading || !email.trim() || email === userEmail}
                className="px-5 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 disabled:opacity-50 rounded-xl font-medium transition-colors"
              >
                {t('accountModals:updateEmail')}
              </button>
            </div>
          </form>
        </section>

        {/* Password Section */}
        <section className="bg-white dark:bg-white/5 border border-gray-200/50 dark:border-white/10 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-500/10 flex items-center justify-center">
              <Lock className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">{t('accountModals:updatePasswordTitle')}</h3>
          </div>
          
          <form onSubmit={handleUpdatePassword} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('accountModals:newPasswordLabel')}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('accountModals:newPasswordPlaceholder')}
                minLength={8}
                className="w-full px-4 py-3 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('accountModals:confirmNewPasswordLabel')}
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={t('accountModals:confirmNewPasswordPlaceholder')}
                minLength={8}
                className="w-full px-4 py-3 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
              />
            </div>

            <div className="bg-gray-50 dark:bg-white/5 border border-gray-200/60 dark:border-white/10 rounded-xl p-4">
              <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">{t('accountModals:passwordRequirementsTitle')}</p>
              <ul className="space-y-1 text-xs">
                <li className={`flex items-center gap-2 ${password.length >= 8 ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-500 dark:text-gray-400'}`}>
                  <div className={`w-1.5 h-1.5 rounded-full ${password.length >= 8 ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
                  {t('accountModals:passwordRuleLength')}
                </li>
                <li className={`flex items-center gap-2 ${/(?=.*[a-z])(?=.*[A-Z])/.test(password) ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-500 dark:text-gray-400'}`}>
                  <div className={`w-1.5 h-1.5 rounded-full ${/(?=.*[a-z])(?=.*[A-Z])/.test(password) ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
                  {t('accountModals:passwordRuleCase')}
                </li>
                <li className={`flex items-center gap-2 ${/(?=.*\d)/.test(password) ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-500 dark:text-gray-400'}`}>
                  <div className={`w-1.5 h-1.5 rounded-full ${/(?=.*\d)/.test(password) ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
                  {t('accountModals:passwordRuleNumber')}
                </li>
                {confirmPassword && (
                  <li className={`flex items-center gap-2 ${passwordsMatch ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${passwordsMatch ? 'bg-emerald-500' : 'bg-red-500'}`} />
                    {t('accountModals:passwordRuleMatch')}
                  </li>
                )}
              </ul>
            </div>
            {errorState.type === 'password' && (
              <p className="text-sm text-red-500 flex items-center gap-1"><AlertCircle className="w-4 h-4"/> {errorState.error}</p>
            )}
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={loadingState.loading || !password || !confirmPassword || Boolean(passwordValidation) || !passwordsMatch}
                className="px-5 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 disabled:opacity-50 rounded-xl font-medium transition-colors flex items-center gap-2"
              >
                {successState.type === 'password' ? <><Check className="w-4 h-4"/> {t('settingsHub:updated')}</> : t('accountModals:updatePassword')}
              </button>
            </div>
          </form>
        </section>

        {/* Danger Zone */}
        <section className="overflow-hidden rounded-2xl border border-red-200/80 bg-gradient-to-br from-red-50/80 to-white dark:border-red-900/50 dark:from-red-950/20 dark:to-white/[0.025]">
          <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-medium text-gray-950 dark:text-white">
                  {t('accountModals:dangerZoneTitle')}
                </h3>
                <p className="mt-1 max-w-lg text-sm leading-6 text-gray-600 dark:text-gray-400">
                  {t('accountModals:dangerZoneDescription')}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsDeleteDialogOpen(true)}
              className="shrink-0 rounded-xl border border-red-300 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:border-red-400 hover:bg-red-700 hover:text-white dark:border-red-800 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-800"
            >
              {t('accountModals:deleteAccountButton')}
            </button>
          </div>
        </section>
      </div>

      <DeleteAccountDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={onDeleteAccount}
      />
    </div>
  );
}
