import { SubscriptionFormSheet } from './subscription-form/SubscriptionFormSheet';
import type { CategorySyncMethods } from './subscription-form/types';
import type { Subscription } from '../types';

interface AddSubscriptionModalProps {
 isOpen: boolean;
 onClose: () => void;
 onAdd: (subscription: Subscription) => Promise<void>;
 onOpenNotificationSettings: () => void;
 categorySync?: CategorySyncMethods;
 isNotificationReady: boolean;
}

export function AddSubscriptionModal({
 isOpen,
 onClose,
 onAdd,
 onOpenNotificationSettings,
 categorySync,
 isNotificationReady,
}: AddSubscriptionModalProps) {
 return (
  <SubscriptionFormSheet
   mode="add"
   isOpen={isOpen}
   onClose={onClose}
   onSubmit={onAdd}
   onOpenNotificationSettings={onOpenNotificationSettings}
   categorySync={categorySync}
   isNotificationReady={isNotificationReady}
  />
 );
}
