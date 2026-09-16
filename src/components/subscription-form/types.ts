import type { Category } from '../../utils/categories';
import type { CloudMutationResult, Subscription } from '../../types';

export type SubscriptionFormMode = 'add' | 'edit';

export interface CategorySyncMethods {
 createCategory: (category: Category) => Promise<CloudMutationResult<Category>>;
}

export interface SubscriptionFormSheetProps {
 mode: SubscriptionFormMode;
 isOpen: boolean;
 onClose: () => void;
 onSubmit: (subscription: Subscription) => Promise<void>;
 categorySync?: CategorySyncMethods;
 isNotificationReady: boolean;
 onOpenNotificationSettings?: () => void;
 subscription?: Subscription;
}
