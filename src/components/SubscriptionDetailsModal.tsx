import React from 'react';
import { X, Calendar, Tag, DollarSign } from 'lucide-react';
import { Subscription } from '../types';
import { formatDate } from '../utils/dates';

interface SubscriptionDetailsModalProps {
  subscription: Subscription;
  isOpen: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function SubscriptionDetailsModal({
  subscription,
  isOpen,
  onClose,
  onEdit,
  onDelete,
}: SubscriptionDetailsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 modal-overlay">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full modal-content">
        <div className="p-6">
          <div className="flex justify-between items-start mb-6">
            <h2 className="text-2xl font-bold text-gray-800">{subscription.name}</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="space-y-4">
            <div className="flex items-center space-x-3">
              <Tag className="w-5 h-5 text-gray-400" />
              <span className="text-gray-600">{subscription.category}</span>
            </div>

            <div className="flex items-center space-x-3">
              <DollarSign className="w-5 h-5 text-gray-400" />
              <span className="text-gray-600">
                ¥{subscription.amount.toFixed(2)} / {subscription.period}
              </span>
            </div>

            <div className="flex items-center space-x-3">
              <Calendar className="w-5 h-5 text-gray-400" />
              <div className="space-y-1">
                <div className="text-gray-600">
                  Last payment: {formatDate(new Date(subscription.lastPaymentDate))}
                </div>
                <div className="text-gray-600">
                  Next payment: {formatDate(new Date(subscription.nextPaymentDate))}
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-between mt-8 pt-4 border-t border-gray-100">
            <button
              onClick={onDelete}
              className="px-4 py-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors duration-200"
            >
              Delete
            </button>
            <button
              onClick={onEdit}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors duration-200"
            >
              Edit
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}