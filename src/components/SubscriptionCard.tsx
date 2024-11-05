import React from 'react';
import { Calendar, AlertCircle } from 'lucide-react';
import { Subscription } from '../types';
import { formatDate, getDaysUntil } from '../utils/dates';

interface SubscriptionCardProps {
  subscription: Subscription;
  index: number;
  onClick: () => void;
}

export function SubscriptionCard({ subscription, index, onClick }: SubscriptionCardProps) {
  const daysUntil = getDaysUntil(subscription.nextPaymentDate);
  const isUpcoming = daysUntil <= 7;

  // Calculate progress
  const lastPaymentDate = new Date(subscription.lastPaymentDate);
  const nextPaymentDate = new Date(subscription.nextPaymentDate);
  const today = new Date();
  const totalDays = (nextPaymentDate.getTime() - lastPaymentDate.getTime()) / (1000 * 60 * 60 * 24);
  const daysElapsed = (today.getTime() - lastPaymentDate.getTime()) / (1000 * 60 * 60 * 24);
  const progress = Math.min(Math.max((daysElapsed / totalDays) * 100, 0), 100);

  return (
    <div
      onClick={onClick}
      className="h-[250px] bg-white rounded-xl shadow-lg p-6 transform transition-all duration-300 hover:scale-105 hover:shadow-xl cursor-pointer"
      style={{
        animation: `fadeSlideIn 0.5s ease-out ${index * 0.1}s both`,
      }}
    >
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-xl font-semibold text-gray-800">{subscription.name}</h3>
          <span className="text-sm text-gray-500">{subscription.category}</span>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-gray-900">¥{subscription.amount.toFixed(2)}</div>
          <span className="text-sm text-gray-500">{subscription.period}</span>
        </div>
      </div>

      <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
        <div className="flex items-center space-x-2">
          <Calendar className="w-5 h-5 text-gray-400" />
          <span className="text-sm text-gray-600">
            Next: {formatDate(new Date(subscription.nextPaymentDate))}
          </span>
        </div>
        
        {isUpcoming && (
          <div className="flex items-center space-x-1 text-amber-600">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm font-medium">
              {daysUntil === 0 ? 'Due today' : `Due in ${daysUntil} days`}
            </span>
          </div>
        )}
      </div>

      <div className="mt-4">
        <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
          <div 
            className="bg-indigo-600 h-full rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-xs text-gray-500">
            {Math.round(daysElapsed)} days used
          </span>
          <span className="text-xs text-gray-500">
            {Math.round(totalDays)} days total
          </span>
        </div>
      </div>
    </div>
  );
}