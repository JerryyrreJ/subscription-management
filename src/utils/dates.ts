export const formatDate = (date: Date): string => {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
};

export const calculateNextPaymentDate = (
  lastPaymentDate: string,
  period: string,
  customDate?: string
): string => {
  const date = new Date(lastPaymentDate);
  
  switch (period) {
    case 'monthly':
      date.setMonth(date.getMonth() + 1);
      break;
    case 'yearly':
      date.setFullYear(date.getFullYear() + 1);
      break;
    case 'custom':
      if (customDate) {
        const customDays = parseInt(customDate);
        date.setDate(date.getDate() + customDays);
      }
      break;
  }
  
  return date.toISOString().split('T')[0];
};

export const getDaysUntil = (dateString: string): number => {
  const today = new Date();
  const date = new Date(dateString);
  const diffTime = date.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};