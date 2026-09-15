import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, Check, Fingerprint, Pencil, Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { PasskeyListItem } from '@supabase/supabase-js'
import { useAuth } from '../../contexts/AuthContext'
import { isWebAuthnAvailable, resolvePasskeyErrorCode } from '../../utils/passkey'

function formatPasskeyDate(value: string | undefined, locale: string) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

export function PasskeySettingsSection() {
  const { t, i18n } = useTranslation(['accountModals'])
  const {
    listPasskeys,
    registerPasskey,
    updatePasskey,
    deletePasskey,
  } = useAuth()

  const [passkeys, setPasskeys] = useState<PasskeyListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const supported = useMemo(() => isWebAuthnAvailable(), [])

  const mapError = useCallback((err: unknown) => {
    const code = resolvePasskeyErrorCode(err)
    switch (code) {
      case 'passkey_disabled':
        return t('accountModals:passkeyDisabled')
      case 'too_many_passkeys':
        return t('accountModals:passkeyTooMany')
      case 'webauthn_credential_exists':
        return t('accountModals:passkeyAlreadyExists')
      case 'webauthn_challenge_expired':
      case 'webauthn_challenge_not_found':
        return t('accountModals:passkeyChallengeExpired')
      case 'webauthn_verification_failed':
        return t('accountModals:passkeyVerificationFailed')
      case 'cancelled':
        return t('accountModals:passkeyCancelled')
      case 'unsupported':
        return t('accountModals:passkeyUnsupported')
      default:
        return err instanceof Error && err.message
          ? err.message
          : t('accountModals:passkeyActionFailed')
    }
  }, [t])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data, error: listError } = await listPasskeys()
      if (listError) throw listError
      setPasskeys(data)
    } catch (err) {
      console.error('Failed to list passkeys:', err)
      setError(mapError(err))
      setPasskeys([])
    } finally {
      setLoading(false)
    }
  }, [listPasskeys, mapError])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const clearFeedbackSoon = () => {
    setTimeout(() => {
      setSuccess('')
    }, 2500)
  }

  const handleRegister = async () => {
    if (!supported) {
      setError(t('accountModals:passkeyUnsupported'))
      return
    }

    setActionLoading(true)
    setError('')
    setSuccess('')
    setConfirmDeleteId(null)

    try {
      const { error: registerError } = await registerPasskey()
      if (registerError) throw registerError
      setSuccess(t('accountModals:passkeyAddedSuccess'))
      clearFeedbackSoon()
      await refresh()
    } catch (err) {
      console.error('Failed to register passkey:', err)
      setError(mapError(err))
    } finally {
      setActionLoading(false)
    }
  }

  const startRename = (passkey: PasskeyListItem) => {
    setConfirmDeleteId(null)
    setEditingId(passkey.id)
    setEditingName(passkey.friendly_name || '')
    setError('')
  }

  const handleRename = async (passkeyId: string) => {
    const nextName = editingName.trim()
    if (!nextName) {
      setError(t('accountModals:passkeyNameRequired'))
      return
    }
    if (nextName.length > 120) {
      setError(t('accountModals:passkeyNameTooLong'))
      return
    }

    setActionLoading(true)
    setError('')
    setSuccess('')

    try {
      const { error: updateError } = await updatePasskey(passkeyId, nextName)
      if (updateError) throw updateError
      setEditingId(null)
      setEditingName('')
      setSuccess(t('accountModals:passkeyRenamedSuccess'))
      clearFeedbackSoon()
      await refresh()
    } catch (err) {
      console.error('Failed to rename passkey:', err)
      setError(mapError(err))
    } finally {
      setActionLoading(false)
    }
  }

  const handleDelete = async (passkeyId: string) => {
    setActionLoading(true)
    setError('')
    setSuccess('')

    try {
      const { error: deleteError } = await deletePasskey(passkeyId)
      if (deleteError) throw deleteError
      setConfirmDeleteId(null)
      setSuccess(t('accountModals:passkeyDeletedSuccess'))
      clearFeedbackSoon()
      await refresh()
    } catch (err) {
      console.error('Failed to delete passkey:', err)
      setError(mapError(err))
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <section className="rounded-2xl border border-gray-200/50 bg-white p-6 dark:border-white/10 dark:bg-white/5">
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 dark:bg-teal-500/10">
            <Fingerprint className="h-5 w-5 text-teal-600 dark:text-teal-400" />
          </div>
          <div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">
              {t('accountModals:passkeyTitle')}
            </h3>
            <p className="mt-1 max-w-xl text-sm leading-6 text-gray-500 dark:text-gray-400">
              {t('accountModals:passkeyDescription')}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleRegister}
          disabled={actionLoading || loading || !supported}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-teal-500 dark:hover:bg-teal-600"
        >
          {actionLoading ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          {t('accountModals:passkeyAdd')}
        </button>
      </div>

      {!supported && (
        <div className="mb-4 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{t('accountModals:passkeyUnsupported')}</span>
        </div>
      )}

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="mb-4 flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400">
          <Check className="h-4 w-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-3 rounded-xl border border-dashed border-gray-200 px-4 py-8 text-sm text-gray-500 dark:border-white/10 dark:text-gray-400">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
          {t('accountModals:passkeyLoading')}
        </div>
      ) : passkeys.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/80 px-4 py-8 text-center dark:border-white/10 dark:bg-white/[0.03]">
          <Fingerprint className="mx-auto h-8 w-8 text-teal-500/70 dark:text-teal-400/70" />
          <p className="mt-3 text-sm font-medium text-gray-800 dark:text-gray-200">
            {t('accountModals:passkeyEmptyTitle')}
          </p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t('accountModals:passkeyEmptyBody')}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {passkeys.map((passkey) => {
            const created = formatPasskeyDate(passkey.created_at, i18n.language)
            const lastUsed = formatPasskeyDate(passkey.last_used_at, i18n.language)
            const isEditing = editingId === passkey.id
            const isConfirmingDelete = confirmDeleteId === passkey.id

            return (
              <li
                key={passkey.id}
                className="rounded-xl border border-gray-200/70 bg-gray-50/60 p-4 dark:border-white/10 dark:bg-white/[0.03]"
              >
                {isEditing ? (
                  <div className="space-y-3">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      {t('accountModals:passkeyNameLabel')}
                    </label>
                    <input
                      type="text"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      maxLength={120}
                      disabled={actionLoading}
                      className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-gray-900 outline-none transition focus:border-transparent focus:ring-2 focus:ring-teal-500 dark:border-white/10 dark:bg-white/5 dark:text-white"
                      placeholder={t('accountModals:passkeyNamePlaceholder')}
                    />
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(null)
                          setEditingName('')
                        }}
                        disabled={actionLoading}
                        className="rounded-xl px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-200/70 dark:text-gray-300 dark:hover:bg-white/10"
                      >
                        {t('accountModals:passkeyCancel')}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleRename(passkey.id)}
                        disabled={actionLoading || !editingName.trim()}
                        className="rounded-xl bg-teal-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-teal-700 disabled:opacity-50 dark:bg-teal-500"
                      >
                        {t('accountModals:passkeySaveName')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                        {passkey.friendly_name || t('accountModals:passkeyUnnamed')}
                      </p>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {created && t('accountModals:passkeyCreatedAt', { date: created })}
                        {created && lastUsed ? ' · ' : null}
                        {lastUsed && t('accountModals:passkeyLastUsedAt', { date: lastUsed })}
                      </p>
                    </div>

                    {isConfirmingDelete ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-red-600 dark:text-red-400">
                          {t('accountModals:passkeyDeleteConfirm')}
                        </span>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          disabled={actionLoading}
                          className="rounded-xl px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-200/70 dark:text-gray-300 dark:hover:bg-white/10"
                        >
                          {t('accountModals:passkeyCancel')}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(passkey.id)}
                          disabled={actionLoading}
                          className="rounded-xl bg-red-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
                        >
                          {t('accountModals:passkeyDelete')}
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => startRename(passkey)}
                          disabled={actionLoading}
                          className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-white dark:text-gray-300 dark:hover:bg-white/10"
                          aria-label={t('accountModals:passkeyRename')}
                        >
                          <Pencil className="h-4 w-4" />
                          {t('accountModals:passkeyRename')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(passkey.id)}
                          disabled={actionLoading}
                          className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
                          aria-label={t('accountModals:passkeyDelete')}
                        >
                          <Trash2 className="h-4 w-4" />
                          {t('accountModals:passkeyDelete')}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
