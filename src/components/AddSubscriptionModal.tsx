import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Period, Subscription, Currency } from '../types';
import { calculateNextPaymentDate } from '../utils/dates';
import { CURRENCIES, DEFAULT_CURRENCY } from '../utils/currency';

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
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Category
              </label>
              <select
                required
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                <option value="">Select category</option>
                <option value="Entertainment">Entertainment</option>
                <option value="Software">Software</option>
                <option value="Music">Music</option>
                <option value="Productivity">Productivity</option>
                <option value="Other">Other</option>
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