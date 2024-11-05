import { Subscription } from '../types';

const STORAGE_KEY = 'subscription-tracker-data';

export const loadSubscriptions = (): Subscription[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error loading subscriptions:', error);
    return [];
  }
};

export const saveSubscriptions = (subscriptions: Subscription[]): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(subscriptions));
  } catch (error) {
    console.error('Error saving subscriptions:', error);
  }
};