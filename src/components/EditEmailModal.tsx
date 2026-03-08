import { useState } from 'react';
import { X, Mail, AlertCircle } from 'lucide-react';

interface EditEmailModalProps {
 isOpen: boolean;
 onClose: () => void;
 currentEmail: string;
 onUpdateEmail: (newEmail: string) => Promise<void>;
}

export function EditEmailModal({ isOpen, onClose, currentEmail, onUpdateEmail }: EditEmailModalProps) {
 const [newEmail, setNewEmail] = useState('');
 const [isLoading, setIsLoading] = useState(false);
 const [error, setError] = useState<string | null>(null);
 const [success, setSuccess] = useState(false);

 const handleSubmit = async (e: React.FormEvent) => {
 e.preventDefault();
 if (!newEmail.trim()) return;

 setIsLoading(true);
 setError(null);

 try {
 await onUpdateEmail(newEmail.trim());
 setSuccess(true);
 setNewEmail('');
 setTimeout(() => {
 onClose();
 setSuccess(false);
 }, 2000);
 } catch (error) {
 setError(error instanceof Error ? error.message : 'Failed to update email');
 } finally {
 setIsLoading(false);
 }
 };

 const handleClose = () => {
 if (!isLoading) {
 setNewEmail('');
 setError(null);
 setSuccess(false);
 onClose();
 }
 };

 if (!isOpen) return null;

 return (
 <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
 <div className="bg-white dark:bg-[#1a1c1e] rounded-3xl p-6 w-full max-w-md">
 <div className="flex items-center justify-between mb-6">
 <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
 Update Email Address
 </h2>
 <button
 onClick={handleClose}
 disabled={isLoading}
 className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-50"
 >
 <X className="w-5 h-5"/>
 </button>
 </div>

 {success ? (
 <div className="text-center py-8">
 <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
 <Mail className="w-8 h-8 text-green-600 dark:text-green-400"/>
 </div>
 <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
 Email Update Initiated
 </h3>
 <p className="text-sm text-gray-600 dark:text-gray-400">
 Please check your new email address for a confirmation link to complete the update.
 </p>
 </div>
 ) : (
 <form onSubmit={handleSubmit} className="space-y-4">
 <div>
 <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
 Current Email
 </label>
 <input
 type="email"
 value={currentEmail}
 disabled
 className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-2xl bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
 />
 </div>

 <div>
 <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
 New Email Address
 </label>
 <input
 type="email"
 value={newEmail}
 onChange={(e) => setNewEmail(e.target.value)}
 placeholder="Enter new email address"
 required
 disabled={isLoading}
 className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-2xl focus:ring-2 focus:ring-emerald-500 dark:bg-gray-700 dark:text-white disabled:opacity-50"
 />
 </div>

 {error && (
 <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-2xl">
 <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0"/>
 <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
 </div>
 )}

 <div className="bg-[#f4f5f7] dark:bg-[#202225] dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 dark:border-zinc-700 dark:border-zinc-700 rounded-2xl p-3">
 <p className="text-sm text-emerald-700 dark:text-emerald-400 dark:text-zinc-600 dark:text-zinc-400">
 You will receive a confirmation email at your new address. You must click the confirmation link to complete the email update.
 </p>
 </div>

 <div className="flex gap-3 pt-4">
 <button
 type="button"
 onClick={handleClose}
 disabled={isLoading}
 className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-2xl hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
 >
 Cancel
 </button>
 <button
 type="submit"
 disabled={isLoading || !newEmail.trim()}
 className="flex-1 px-4 py-2 bg-emerald-600 dark:bg-emerald-500 text-white rounded-2xl hover:bg-emerald-700 dark:hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed"
 >
 {isLoading ? 'Updating...' : 'Update Email'}
 </button>
 </div>
 </form>
 )}
 </div>
 </div>
 );
}