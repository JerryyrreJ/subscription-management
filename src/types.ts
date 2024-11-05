export type Period = 'monthly' | 'yearly' | 'custom';

export interface Subscription {
  id: string;
  name: string;
  category: string;
  amount: number;
  period: Period;
  lastPaymentDate: string;
  nextPaymentDate: string;
  customDate?: string;
}

export type ViewMode = 'monthly' | 'yearly';