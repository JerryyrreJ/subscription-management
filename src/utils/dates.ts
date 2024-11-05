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

export const getAutoRenewedDates = (
  lastPaymentDate: string,
  nextPaymentDate: string,
  period: string,
  customDate?: string
): { lastPaymentDate: string; nextPaymentDate: string } => {
  const today = new Date();
  const nextPayment = new Date(nextPaymentDate);
  
  // 如果还没到期，返回原始日期
  if (today < nextPayment) {
    return { lastPaymentDate, nextPaymentDate };
  }

  // 计算需要续期的次数
  let newLastPayment = new Date(lastPaymentDate);
  let newNextPayment = new Date(nextPaymentDate);
  
  while (newNextPayment < today) {
    newLastPayment = new Date(newNextPayment);
    
    switch (period) {
      case 'monthly':
        newNextPayment.setMonth(newNextPayment.getMonth() + 1);
        break;
      case 'yearly':
        newNextPayment.setFullYear(newNextPayment.getFullYear() + 1);
        break;
      case 'custom':
        if (customDate) {
          const customDays = parseInt(customDate);
          newNextPayment.setDate(newNextPayment.getDate() + customDays);
        }
        break;
    }
  }

  return {
    lastPaymentDate: newLastPayment.toISOString().split('T')[0],
    nextPaymentDate: newNextPayment.toISOString().split('T')[0]
  };
};