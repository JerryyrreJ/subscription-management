import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { Period, Subscription, Currency } from '../types';
import { calculateNextPaymentDate } from '../utils/dates';
import { CURRENCIES, DEFAULT_CURRENCY } from '../utils/currency';
import { getAllCategories, addCustomCategory, validateCategoryName, isCustomCategory, removeCustomCategory } from '../utils/categories';

interface AddSubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (subscription: Subscription) => void;
}

export function AddSubscriptionModal({ isOpen, onClose, onAdd }: AddSubscriptionModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    amount: '',
    currency: DEFAULT_CURRENCY as Currency,
    period: 'monthly' as Period,
    lastPaymentDate: '',
    customDate: '',
  });

  const [categories, setCategories] = useState<string[]>([]);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [categoryError, setCategoryError] = useState('');

  // 加载类型列表
  useEffect(() => {
    setCategories(getAllCategories());
  }, []);

  const handleAddCategory = () => {
    const validation = validateCategoryName(newCategoryName);
    if (!validation.isValid) {
      setCategoryError(validation.error || 'Invalid category name');
      return;
    }

    const success = addCustomCategory(newCategoryName.trim());
    if (success) {
      setCategories(getAllCategories());
      setFormData({ ...formData, category: newCategoryName.trim() });
      setNewCategoryName('');
      setShowAddCategory(false);
      setCategoryError('');
    } else {
      setCategoryError('Failed to add category');
    }
  };

  const handleRemoveCategory = (categoryToRemove: string) => {
    if (removeCustomCategory(categoryToRemove)) {
      setCategories(getAllCategories());
      // 如果删除的是当前选中的类型，清空选择
      if (formData.category === categoryToRemove) {
        setFormData({ ...formData, category: '' });
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const nextPaymentDate = calculateNextPaymentDate(
      formData.lastPaymentDate,
      formData.period,
      formData.customDate
    );

    onAdd({
      id: crypto.randomUUID(),
      ...formData,
      amount: parseFloat(formData.amount),
      nextPaymentDate,
    });

    setFormData({
      name: '',
      category: '',
      amount: '',
      currency: DEFAULT_CURRENCY,
      period: 'monthly',
      lastPaymentDate: '',
      customDate: '',
    });
  };

  const handleClose = () => {
    setFormData({
      name: '',
      category: '',
      amount: '',
      currency: DEFAULT_CURRENCY,
      period: 'monthly',
      lastPaymentDate: '',
      customDate: '',
    });
    setShowAddCategory(false);
    setNewCategoryName('');
    setCategoryError('');
    onClose();
  };

  // 获取今天的日期格式化为 YYYY-MM-DD
  const today = new Date().toISOString().split('T')[0];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center p-4 z-50 modal-overlay">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto modal-content relative">
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Add Subscription</h2>
            <button
              onClick={handleClose}
              className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Subscription Name
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="Netflix"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Category
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddCategory(!showAddCategory);
                    setCategoryError('');
                  }}
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 font-medium transition-colors flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  Add Custom
                </button>
              </div>

              {showAddCategory && (
                <div className="mb-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newCategoryName}
                      onChange={(e) => {
                        setNewCategoryName(e.target.value);
                        setCategoryError('');
                      }}
                      placeholder="Enter new category name"
                      className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                    <button
                      type="button"
                      onClick={handleAddCategory}
                      className="px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm"
                    >
                      Add
                    </button>
                  </div>
                  {categoryError && (
                    <p className="text-xs text-red-600 dark:text-red-400">{categoryError}</p>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <select
                  required
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  <option value="">Select category</option>
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>

                {/* 显示自定义类型管理 */}
                {categories.filter(cat => isCustomCategory(cat)).length > 0 && (
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    <div className="flex flex-wrap gap-1 mt-1">
                      {categories.filter(cat => isCustomCategory(cat)).map((category) => (
                        <span
                          key={category}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded text-xs"
                        >
                          {category}
                          <button
                            type="button"
                            onClick={() => handleRemoveCategory(category)}
                            className="text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                            title="Remove custom category"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3">
              <div className="w-[30%]">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Currency
                </label>
                <select
                  required
                  value={formData.currency}
                  onChange={(e) => setFormData({ ...formData, currency: e.target.value as Currency })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                >
                  {CURRENCIES.map((currency) => (
                    <option key={currency.code} value={currency.code}>
                      {currency.code}
                    </option>
                  ))}
                </select>
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
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="29.99"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Payment Period
              </label>
              <select
                required
                value={formData.period}
                onChange={(e) => setFormData({ ...formData, period: e.target.value as Period })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
                <option value="custom">Custom</option>
              </select>
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
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="30"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Last Payment Date
              </label>
              <input
                type="date"
                required
                max={today}
                value={formData.lastPaymentDate}
                onChange={(e) => setFormData({ ...formData, lastPaymentDate: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>

            <div className="pt-4">
              <button
                type="submit"
                className="w-full bg-indigo-600 text-white py-2 px-4 rounded-lg hover:bg-indigo-700 transition-colors duration-200"
              >
                Add Subscription
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}