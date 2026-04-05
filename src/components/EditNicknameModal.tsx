import { useState } from 'react'
import { X, User, Check, AlertCircle } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useTranslation } from 'react-i18next'

interface EditNicknameModalProps {
 isOpen: boolean
 onClose: () => void
}

export function EditNicknameModal({ isOpen, onClose }: EditNicknameModalProps) {
 const { t } = useTranslation(['accountModals', 'app'])
 const { userProfile, updateUserNickname } = useAuth()
 const [nickname, setNickname] = useState(userProfile?.nickname || '')
 const [loading, setLoading] = useState(false)
 const [error, setError] = useState('')
 const [success, setSuccess] = useState('')

 const handleSubmit = async (e: React.FormEvent) => {
 e.preventDefault()
 setLoading(true)
 setError('')
 setSuccess('')

 try {
 await updateUserNickname(nickname.trim())
 setSuccess(t('accountModals:nicknameUpdatedSuccess'))
 setTimeout(() => {
 setSuccess('')
 onClose()
 }, 1500)
 } catch (error: unknown) {
 console.error('Update nickname error:', error)

 let errorMessage = t('accountModals:nicknameUpdateFailed')

 if (error instanceof Error && error.message) {
 if (error.message.includes('JSON object')) {
 errorMessage = t('accountModals:profileNotFound')
 } else {
 errorMessage = error.message
 }
 }

 setError(errorMessage)
 } finally {
 setLoading(false)
 }
 }

 const handleClose = () => {
 setNickname(userProfile?.nickname || '')
 setError('')
 setSuccess('')
 onClose()
 }

 if (!isOpen) return null

 return (
 <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center p-4 z-50 modal-overlay">
 <div className="bg-white dark:bg-[#1a1c1e] rounded-3xl shadow-apple-lg max-w-md w-full p-6 modal-content">
 <div className="flex justify-between items-center mb-6">
 <h2 className="text-xl font-bold text-gray-800 dark:text-white tracking-tight">
 {t('accountModals:editNicknameTitle')}
 </h2>
 <button
 onClick={handleClose}
 className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
 >
 <X className="w-5 h-5"/>
 </button>
 </div>

 <form onSubmit={handleSubmit} className="space-y-4">
 <div>
 <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
 {t('accountModals:displayNameLabel')}
 </label>
 <div className="relative">
 <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-5 h-5"/>
 <input
 type="text"
 required
 value={nickname}
 onChange={(e) => setNickname(e.target.value)}
 className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-2xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-colors"
 placeholder={t('accountModals:displayNamePlaceholder')}
 disabled={loading}
 minLength={2}
 maxLength={30}
 />
 </div>
 <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
 {t('accountModals:displayNameHint')}
 </p>
 </div>

 {error && (
 <div className="flex items-center space-x-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-3 rounded-2xl">
 <AlertCircle className="w-4 h-4 flex-shrink-0"/>
 <span>{error}</span>
 </div>
 )}

 {success && (
 <div className="flex items-center space-x-2 text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 p-3 rounded-2xl">
 <Check className="w-4 h-4 flex-shrink-0"/>
 <span>{success}</span>
 </div>
 )}

 <div className="flex space-x-3 pt-2">
 <button
 type="button"
 onClick={handleClose}
 disabled={loading}
 className="flex-1 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 py-2 px-4 rounded-2xl transition-colors font-medium disabled:opacity-50"
 >
 {t('app:cancel')}
 </button>
 <button
 type="submit"
 disabled={loading || nickname.trim().length < 2 || nickname.trim() === userProfile?.nickname}
 className="flex-1 bg-emerald-600 dark:bg-emerald-500 hover:bg-emerald-700 dark:hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2 px-4 rounded-2xl transition-colors font-medium"
 >
 {loading ? (
 <div className="flex items-center justify-center space-x-2">
 <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
 <span>{t('accountModals:updating')}</span>
 </div>
 ) : (
 t('accountModals:update')
 )}
 </button>
 </div>
 </form>
 </div>
 </div>
 )
}
