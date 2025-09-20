import React, { useState, useEffect } from 'react';
import { CalendarDays, Plus } from 'lucide-react';
import { Period, Subscription, Currency } from '../types';
import { calculateNextPaymentDate } from '../utils/dates';
import { CURRENCIES, DEFAULT_CURRENCY } from '../utils/currency';
import { getAllCategories } from '../utils/categories';

interface AddSubscriptionFormProps {
  onAdd: (subscription: Subscription) => void;
}

export function AddSubscriptionForm({ onAdd }: AddSubscriptionFormProps) {
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

  // 加载类型列表
  useEffect(() => {
    setCategories(getAllCategories());
  }, []);

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

  return (
    <form onSubmit={handleSubmit} className="space-y-6 bg-white p-8 rounded-xl shadow-lg max-w-md w-full">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Add Subscription</h2>
        <Plus className="w-6 h-6 text-indigo-600" />
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Subscription Name
          </label>
          <input
            type="text"
            required
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            placeholder="Netflix"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Category
          </label>
          <select
            required
            value={formData.category}
            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          >
            <option value="">Select category</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-3">
          <div className="w-[30%]">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Currency
            </label>
            <select
              required
              value={formData.currency}
              onChange={(e) => setFormData({ ...formData, currency: e.target.value as Currency })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
            >
              {CURRENCIES.map((currency) => (
                <option key={currency.code} value={currency.code}>
                  {currency.code}
                </option>
              ))}
            </select>
          </div>
          <div className="w-[70%]">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Amount
            </label>
            <input
              type="number"
              required
              step="0.01"
              min="0"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="29.99"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Payment Period
          </label>
          <select
            required
            value={formData.period}
            onChange={(e) => setFormData({ ...formData, period: e.target.value as Period })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          >
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
            <option value="custom">Custom</option>
          </select>
        </div>

        {formData.period === 'custom' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Custom Period (days)
            </label>
            <input
              type="number"
              required
              min="1"
              value={formData.customDate}
              onChange={(e) => setFormData({ ...formData, customDate: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="30"
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Last Payment Date
          </label>
          <div className="relative">
            <input
              type="date"
              required
              value={formData.lastPaymentDate}
              onChange={(e) => setFormData({ ...formData, lastPaymentDate: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            <CalendarDays className="absolute right-3 top-2.5 h-5 w-5 text-gray-400" />
          </div>
        </div>
      </div>

      <button
        type="submit"
        className="w-full bg-indigo-600 text-white py-2 px-4 rounded-lg hover:bg-indigo-700 transition-colors duration-200"
      >
        Add Subscription
      </button>
    </form>
  );
}

export default AddSubscriptionForm;