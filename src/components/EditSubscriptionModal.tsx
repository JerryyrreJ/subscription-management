import { SubscriptionFormSheet } from './subscription-form/SubscriptionFormSheet';
import type { CategorySyncMethods } from './subscription-form/types';
import type { Subscription } from '../types';

interface EditSubscriptionModalProps {
 subscription: Subscription;
 isOpen: boolean;
 onClose: () => void;
 onEdit: (subscription: Subscription) => void | Promise<void>;
 categorySync?: CategorySyncMethods;
 isBarkEnabled: boolean;
}

export function EditSubscriptionModal({
 subscription,
 isOpen,
 onClose,
 onEdit,
 categorySync,
 isBarkEnabled,
}: EditSubscriptionModalProps) {
 return (
  <SubscriptionFormSheet
   mode="edit"
   isOpen={isOpen}
   onClose={onClose}
   onSubmit={async (updated) => {
    await onEdit(updated);
   }}
   subscription={subscription}
   categorySync={categorySync}
   isNotificationReady={isBarkEnabled}
  />
 );
}
