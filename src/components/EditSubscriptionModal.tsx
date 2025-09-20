import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Period, Subscription, Currency } from '../types';
import { calculateNextPaymentDate } from '../utils/dates';
import { CURRENCIES } from '../utils/currency';
import { getAllCategories } from '../utils/categories';

interface EditSubscriptionModalProps {
  subscription: Subscription;
  isOpen: boolean;
  onClose: () => void;
  onEdit: (subscription: Subscription) => void;
}

export function EditSubscriptionModal({ 
  subscription, 
  isOpen, 
  onClose, 
  onEdit 
}: EditSubscriptionModalProps) {
  const [formData, setFormData] = useState({
    name: subscription.name,
    category: subscription.category,
    amount: subscription.amount.toString(),
    currency: subscription.currency || 'CNY',
    period: subscription.period,
    lastPaymentDate: subscription.lastPaymentDate,
    customDate: subscription.customDate || '',
  });

  const [categories, setCategories] = useState<string[]>([]);

  // 加载类型列表
  useEffect(() => {
    setCategories(getAllCategories());
  }, []);

  // 当subscription改变时更新表单数据
  useEffect(() => {
    setFormData({
      name: subscription.name,
      category: subscription.category,
      amount: subscription.amount.toString(),
      currency: subscription.currency || 'CNY',
      period: subscription.period,
      lastPaymentDate: subscription.lastPaymentDate,
      customDate: subscription.customDate || '',
    });
  }, [subscription]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const nextPaymentDate = calculateNextPaymentDate(
      formData.lastPaymentDate,
      formData.period,
      formData.customDate
    );

    onEdit({
      id: subscription.id,
      ...formData,
      amount: parseFloat(formData.amount),
      nextPaymentDate,
    });

    onClose();
  };

  // 获取今天的日期，格式化为 YYYY-MM-DD
  const today = new Date().toISOString().split('T')[0];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Edit Subscription</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
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
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Category
              </label>
              <select
                required
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
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
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
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
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
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
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
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
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
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
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>

            <div className="pt-4">
              <button
                type="submit"
                className="w-full bg-indigo-600 text-white py-2 px-4 rounded-lg hover:bg-indigo-700 transition-colors duration-200"
              >
                Save Changes
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
} 