import React, { useState, useEffect, useRef } from 'react';
import { X, Bell, BellOff } from 'lucide-react';
import { Period, Subscription, Currency } from '../types';
import { calculateNextPaymentDate } from '../utils/dates';
import { CURRENCIES, DEFAULT_CURRENCY } from '../utils/currency';
import { getAllCategories, getAllCategoriesWithDetails, addCustomCategory } from '../utils/categories';
import { MAX_SUBSCRIPTION_AMOUNT, validateSubscriptionAmount } from '../utils/subscriptionValidation';
import { CustomSelect } from './CustomSelect';
import { CustomDatePicker } from './CustomDatePicker';
import type { Category } from '../utils/categories';

interface CategorySyncMethods {
 createCategory: (category: Category) => Promise<Category>
}

interface AddSubscriptionModalProps {
 isOpen: boolean;
 onClose: () => void;
 onAdd: (subscription: Subscription) => Promise<void>;
 onOpenNotificationSettings: () => void;
 categorySync?: CategorySyncMethods;
 isNotificationReady: boolean;
}

function buildInitialFormData(isNotificationReady: boolean) {
 return {
 name: '',
 category: '',
 amount: '',
 currency: DEFAULT_CURRENCY as Currency,
 period: 'monthly' as Period,
 lastPaymentDate: '',
 customDate: '',
 notificationEnabled: isNotificationReady,
 };
}

export function AddSubscriptionModal({
 isOpen,
 onClose,
 onAdd,
 onOpenNotificationSettings,
 categorySync,
 isNotificationReady
}: AddSubscriptionModalProps) {
 const formRef = useRef<HTMLFormElement>(null);
 const [formData, setFormData] = useState(() => buildInitialFormData(isNotificationReady));

 const [categories, setCategories] = useState<string[]>([]);
 const [isSubmitting, setIsSubmitting] = useState(false);
 const [isAddingNewCategory, setIsAddingNewCategory] = useState(false);
 const [newCategoryInput, setNewCategoryInput] = useState('');
 const [dateValidationError, setDateValidationError] = useState(false);
 const [notificationValidationError, setNotificationValidationError] = useState(false);

 // 加载类型列表 - 每次打开模态框时重新加载，确保显示最新类别
 useEffect(() => {
 if (isOpen) {
 setCategories(getAllCategories());
 setFormData(buildInitialFormData(isNotificationReady));
 setIsAddingNewCategory(false);
 setNewCategoryInput('');
 setDateValidationError(false);
 setNotificationValidationError(false);
 }
 }, [isOpen, isNotificationReady]);

 // 处理类型选择变化
 const handleCategoryChange = (value: string) => {
 if (value === '__add_new__') {
 // 选择了"+ Add New Category"
 setIsAddingNewCategory(true);
 setNewCategoryInput('');
 } else {
 setFormData({ ...formData, category: value });
 }
 };

 // 添加新类型
 const handleAddNewCategory = async () => {
 const trimmed = newCategoryInput.trim();
 if (!trimmed) {
 return;
 }

 const success = addCustomCategory(trimmed);
 if (success) {
 // 如果有云同步，则同步到云端
 if (categorySync) {
 const allCategories = getAllCategoriesWithDetails();
 const newCategory = allCategories.find(cat => cat.name === trimmed);
 if (newCategory) {
 try {
 await categorySync.createCategory(newCategory);
 } catch (error) {
 console.error('Failed to sync new category to cloud:', error);
 }
 }
 }

 const updatedCategories = getAllCategories();
 setCategories(updatedCategories);
 setFormData({ ...formData, category: trimmed });
 setIsAddingNewCategory(false);
 setNewCategoryInput('');
 } else {
 alert('Failed to add category. It may already exist or contain invalid characters.');
 }
 };

 // 取消添加新类型
 const handleCancelAddCategory = () => {
 setIsAddingNewCategory(false);
 setNewCategoryInput('');
 };

 const resetForm = () => {
 setFormData(buildInitialFormData(isNotificationReady));
 setDateValidationError(false);
 setNotificationValidationError(false);
 };

 const validateForm = () => {
 const formIsValid = formRef.current?.reportValidity() ?? true;
 const hasDateError = !formData.lastPaymentDate;

 setDateValidationError(hasDateError);

 if (!formIsValid || hasDateError) {
  return false;
 }

 const amountError = validateSubscriptionAmount(formData.amount);
 if (amountError) {
  alert(amountError);
  return false;
 }

 return true;
 };

 const buildSubscription = (notificationEnabled: boolean): Subscription => {
 const nextPaymentDate = calculateNextPaymentDate(
  formData.lastPaymentDate,
  formData.period,
  formData.customDate
 );

 return {
  id: crypto.randomUUID(),
  ...formData,
  amount: Number(formData.amount),
  nextPaymentDate,
  createdAt: new Date().toISOString(),
  notificationEnabled,
 };
 };

 const submitSubscription = async (notificationEnabled: boolean) => {
 if (!validateForm()) {
  return false;
 }

 setIsSubmitting(true);

 try {
  await onAdd(buildSubscription(notificationEnabled));
  resetForm();
  return true;
 } finally {
  setIsSubmitting(false);
 }
 };

 const handleSubmit = async (e: React.FormEvent) => {
 e.preventDefault();
 await submitSubscription(formData.notificationEnabled);
 };

 const handleNotificationToggle = async () => {
 if (isSubmitting) {
  return;
 }

 setNotificationValidationError(false);

 if (formData.notificationEnabled) {
  setFormData(prev => ({ ...prev, notificationEnabled: false }));
  return;
 }

 if (isNotificationReady) {
  setFormData(prev => ({ ...prev, notificationEnabled: true }));
  return;
 }

 const saved = await submitSubscription(true);
 if (!saved) {
  setNotificationValidationError(true);
  return;
 }

 onOpenNotificationSettings();
 };

 const handleClose = () => {
 if (!isSubmitting) {
 resetForm();
 setIsAddingNewCategory(false);
 setNewCategoryInput('');
 onClose();
 }
 };

 // 获取今天的日期格式化为 YYYY-MM-DD (使用本地时区)
 const today = (() => {
 const date = new Date();
 const year = date.getFullYear();
 const month = String(date.getMonth() + 1).padStart(2, '0');
 const day = String(date.getDate()).padStart(2, '0');
 return `${year}-${month}-${day}`;
 })();

 if (!isOpen) return null;

 return (
 <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center p-2 sm:p-4 z-50 modal-overlay">
 <div className="bg-white dark:bg-[#1a1c1e] rounded-3xl shadow-apple-lg max-w-md w-full max-h-[95vh] sm:max-h-[90vh] overflow-y-auto modal-content relative">
 <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
 <div className="flex items-center justify-between">
 <h2 className="text-xl sm:text-2xl font-bold text-gray-800 dark:text-white tracking-tight">Add Subscription</h2>
 <button
 onClick={handleClose}
 className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-1"
 >
 <X className="w-5 h-5 sm:w-6 sm:h-6"/>
 </button>
 </div>

 <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
 <div>
 <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
 Subscription Name
 </label>
 <input
 type="text"
 required
 value={formData.name}
 onChange={(e) => setFormData({ ...formData, name: e.target.value })}
 className="w-full px-3 py-2 sm:px-4 sm:py-2 border border-gray-300 dark:border-gray-600 rounded-2xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm sm:text-base"
 placeholder="Netflix"
 />
 </div>

 <div>
 <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
 Category
 </label>

 {isAddingNewCategory ? (
 // 添加新类型的内联输入框
 <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-2xl space-y-2">
 <div className="flex gap-2">
 <input
 type="text"
 value={newCategoryInput}
 onChange={(e) => setNewCategoryInput(e.target.value)}
 onKeyPress={(e) => {
 if (e.key === 'Enter') {
 e.preventDefault();
 handleAddNewCategory();
 }
 }}
 placeholder="Enter new category name"
 autoFocus
 className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-2xl bg-white dark:bg-[#1a1c1e] text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
 />
 <button
 type="button"
 onClick={handleAddNewCategory}
 className="px-3 py-2 bg-emerald-600 dark:bg-emerald-500 text-white rounded-2xl hover:bg-emerald-700 dark:hover:bg-emerald-600 transition-colors text-sm"
 >
 Add
 </button>
 <button
 type="button"
 onClick={handleCancelAddCategory}
 className="px-3 py-2 bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-2xl hover:bg-gray-400 dark:hover:bg-gray-500 transition-colors text-sm"
 >
 Cancel
 </button>
 </div>
 </div>
 ) : (
 // 正常的下拉选择框
 <CustomSelect
 value={formData.category}
 onChange={handleCategoryChange}
 options={[
 { value: '', label: 'Select category' },
 ...categories.map(cat => ({ value: cat, label: cat })),
 { value: '__add_new__', label: '+ Add New Category' }
 ]}
 placeholder="Select category"
 required={true}
 />
 )}
 </div>

 <div className="flex gap-3">
 <div className="w-[30%]">
 <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
 Currency
 </label>
 <CustomSelect
 value={formData.currency}
 onChange={(value) => setFormData({ ...formData, currency: value as Currency })}
 options={CURRENCIES.map(currency => ({
 value: currency.code,
 label: currency.code
 }))}
 required={true}
 />
 </div>
 <div className="w-[70%]">
 <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
 Amount
 </label>
  <input
  type="number"
  required
  step="0.01"
  min="0"
  max={MAX_SUBSCRIPTION_AMOUNT}
  value={formData.amount}
  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-2xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
 placeholder="29.99"
 />
 </div>
 </div>

 <div>
 <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
 Payment Period
 </label>
 <CustomSelect
 value={formData.period}
 onChange={(value) => setFormData({ ...formData, period: value as Period })}
 options={[
 { value: 'monthly', label: 'Monthly' },
 { value: 'yearly', label: 'Yearly' },
 { value: 'custom', label: 'Custom' }
 ]}
 required={true}
 />
 </div>

 {formData.period === 'custom' && (
 <div>
 <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
 Custom Period (days)
 </label>
 <input
 type="number"
 required
 min="1"
 value={formData.customDate}
 onChange={(e) => setFormData({ ...formData, customDate: e.target.value })}
 className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-2xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
 placeholder="30"
 />
 </div>
 )}

 <div>
 <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
 Last Payment Date
 </label>
 <CustomDatePicker
 value={formData.lastPaymentDate}
 onChange={(value) => {
 setFormData({ ...formData, lastPaymentDate: value });
 if (dateValidationError) {
  setDateValidationError(false);
 }
 }}
 maxDate={today}
 required={true}
 />
 {dateValidationError && (
 <p className="mt-1 text-xs text-red-600 dark:text-red-400">
 Last payment date is required.
 </p>
 )}
 </div>

 {/* 通知开关 */}
 <div className="bg-gray-50 dark:bg-[#1a1c1e]/50 rounded-2xl p-4 border border-gray-200 dark:border-gray-700">
 <div className="flex items-start gap-3">
 <div className="flex-shrink-0 mt-0.5">
 {formData.notificationEnabled ? (
 <Bell className="w-5 h-5 text-gray-600 dark:text-gray-400"/>
 ) : (
 <BellOff className="w-5 h-5 text-gray-400 dark:text-gray-500"/>
 )}
 </div>
 <div className="flex-1">
 <div className="flex items-center justify-between">
 <label className="text-sm font-medium text-gray-900 dark:text-white cursor-pointer">
 Enable notifications
 </label>
 <button
 type="button"
 onClick={handleNotificationToggle}
 disabled={isSubmitting}
 className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 ${
 formData.notificationEnabled
 ? 'bg-teal-600'
 : 'bg-gray-300 dark:bg-gray-600'
 } ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
 >
 <span
 className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
 formData.notificationEnabled ? 'translate-x-6' : 'translate-x-1'
 }`}
 />
 </button>
 </div>
 <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
 {formData.notificationEnabled
 ? 'You will receive reminders for this subscription'
 : 'No reminders will be sent for this subscription'}
 </p>
 {notificationValidationError && (
 <p className="mt-2 text-xs text-red-600 dark:text-red-400">
 Finish this subscription first, then set up notifications.
 </p>
 )}
 </div>
 </div>
 </div>

 <div className="pt-4">
 <button
 type="submit"
 disabled={isSubmitting}
 className="w-full bg-emerald-600 dark:bg-emerald-500 text-white py-2 px-4 rounded-2xl hover:bg-emerald-700 dark:hover:bg-emerald-600 transition-colors duration-200 disabled:bg-zinc-400 disabled:cursor-not-allowed"
 >
 {isSubmitting ? 'Adding...' : 'Add Subscription'}
 </button>
 </div>
 </form>
 </div>
 </div>
 </div>
 );
}
