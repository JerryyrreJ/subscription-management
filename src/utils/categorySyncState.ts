import { Category } from './categories';

interface CategorySnapshotPersistence {
 persistCategories: (categories: Category[]) => void;
 savePendingSnapshot: (categories: Category[]) => void;
}

interface CategorySyncExecution {
 loadLocalCategories: () => Category[];
 loadPendingSnapshot: () => Category[] | null;
 syncCloudCategories: (localCategories: Category[]) => Promise<Category[]>;
 reconcilePendingCategories: (pendingCategories: Category[]) => Promise<Category[]>;
 persistCategories: (categories: Category[]) => void;
 clearPendingSnapshot: () => void;
}

interface FinalizeCategoryCloudMutationOptions<T> {
 hadPendingSnapshot: boolean;
 executeCloudMutation: () => Promise<T>;
 clearPendingSnapshot: () => void;
 markSyncSuccess?: () => void;
}

export const stageCategorySnapshot = (
 categories: Category[],
 { persistCategories, savePendingSnapshot }: CategorySnapshotPersistence
): Category[] => {
 persistCategories(categories);
 savePendingSnapshot(categories);
 return categories;
};

export const executeCategorySync = async ({
 loadLocalCategories,
 loadPendingSnapshot,
 syncCloudCategories,
 reconcilePendingCategories,
 persistCategories,
 clearPendingSnapshot,
}: CategorySyncExecution): Promise<Category[]> => {
 const localCategories = loadLocalCategories();
 const pendingCategories = loadPendingSnapshot();
 const syncedCategories = pendingCategories
  ? await reconcilePendingCategories(pendingCategories)
  : await syncCloudCategories(localCategories);

 persistCategories(syncedCategories);

 if (pendingCategories) {
  clearPendingSnapshot();
 }

 return syncedCategories;
};

export const executeCategoryUpload = async (
 localCategories: Category[],
 {
  loadPendingSnapshot,
  reconcilePendingCategories,
  persistCategories,
  clearPendingSnapshot,
 }: Pick<CategorySyncExecution, 'loadPendingSnapshot' | 'reconcilePendingCategories' | 'persistCategories' | 'clearPendingSnapshot'>
): Promise<Category[]> => {
 const desiredCategories = loadPendingSnapshot() || localCategories;
 const syncedCategories = await reconcilePendingCategories(desiredCategories);

 persistCategories(syncedCategories);
 clearPendingSnapshot();

 return syncedCategories;
};

export const finalizeCategoryCloudMutation = async <T>({
 hadPendingSnapshot,
 executeCloudMutation,
 clearPendingSnapshot,
 markSyncSuccess,
}: FinalizeCategoryCloudMutationOptions<T>): Promise<T> => {
 const result = await executeCloudMutation();

 if (!hadPendingSnapshot) {
  clearPendingSnapshot();
 }

 markSyncSuccess?.();

 return result;
};
