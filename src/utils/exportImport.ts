import { Subscription } from '../types';
import { loadSubscriptions } from './storage';
import { loadCategories, Category } from './categories';
import { normalizeSubscription } from './subscriptionSync';
import packageJson from '../../package.json';

export interface ExportData {
 version: string;
 exportDate: string;
 subscriptions: Subscription[];
 categories?: Category[];
}

export interface ImportResult {
 success: boolean;
 subscriptionCount: number;
 categoryCount: number;
}

export interface ImportPlan<T> {
 create: T[];
 update: T[];
 deleteIds: string[];
}

const SUBSCRIPTION_PERIODS = new Set(['monthly', 'yearly', 'custom']);
const SUBSCRIPTION_CURRENCIES = new Set(['CNY', 'USD', 'EUR', 'JPY', 'GBP', 'AUD', 'CAD', 'CHF', 'HKD', 'SGD']);

const parseImportPayload = (content: string): ExportData => {
 const data = JSON.parse(content) as ExportData;

 if (!data.subscriptions || !Array.isArray(data.subscriptions)) {
  throw new Error('Invalid data format: subscriptions array is required');
 }

 const seenSubscriptionIds = new Set<string>();
 const subscriptions = data.subscriptions.map((sub, index) => normalizeImportSubscription(sub, index, seenSubscriptionIds));

 let categories: Category[] | undefined;
 if (data.categories !== undefined) {
  if (!Array.isArray(data.categories)) {
  throw new Error('Invalid data format: categories must be an array');
  }

  const seenCategoryIds = new Set<string>();
  categories = data.categories.map((category, index) => normalizeImportCategory(category, index, seenCategoryIds));
 }

 return {
  ...data,
  subscriptions,
  categories
 };
};

const normalizeImportSubscription = (
 sub: Partial<Subscription>,
 index: number,
 seenIds: Set<string>
): Subscription => {
 if (!sub.id || typeof sub.id !== 'string') {
  throw new Error(`Invalid subscription data at index ${index}: id is required`);
 }

 if (seenIds.has(sub.id)) {
  throw new Error(`Invalid subscription data: duplicate id "${sub.id}"`);
 }
 seenIds.add(sub.id);

 if (!sub.name || typeof sub.name !== 'string') {
  throw new Error(`Invalid subscription data at index ${index}: name is required`);
 }

 if (!sub.category || typeof sub.category !== 'string') {
  throw new Error(`Invalid subscription data at index ${index}: category is required`);
 }

 if (typeof sub.amount !== 'number' || Number.isNaN(sub.amount)) {
  throw new Error(`Invalid subscription data at index ${index}: amount must be a number`);
 }

 if (!sub.period || typeof sub.period !== 'string' || !SUBSCRIPTION_PERIODS.has(sub.period)) {
  throw new Error(`Invalid subscription data at index ${index}: period is invalid`);
 }

 if (!sub.lastPaymentDate || typeof sub.lastPaymentDate !== 'string') {
  throw new Error(`Invalid subscription data at index ${index}: lastPaymentDate is required`);
 }

 if (!sub.nextPaymentDate || typeof sub.nextPaymentDate !== 'string') {
  throw new Error(`Invalid subscription data at index ${index}: nextPaymentDate is required`);
 }

 if (sub.currency && !SUBSCRIPTION_CURRENCIES.has(sub.currency)) {
  throw new Error(`Invalid subscription data at index ${index}: currency is invalid`);
 }

 return normalizeSubscription(sub);
};

const normalizeImportCategory = (
 category: Partial<Category>,
 index: number,
 seenIds: Set<string>
): Category => {
 if (!category.id || typeof category.id !== 'string') {
  throw new Error(`Invalid category data at index ${index}: id is required`);
 }

 if (seenIds.has(category.id)) {
  throw new Error(`Invalid category data: duplicate id "${category.id}"`);
 }
 seenIds.add(category.id);

 if (!category.name || typeof category.name !== 'string') {
  throw new Error(`Invalid category data at index ${index}: name is required`);
 }

 return {
  id: category.id,
  name: category.name,
  order: typeof category.order === 'number' ? category.order : index,
  isBuiltIn: category.isBuiltIn ?? false,
  isHidden: category.isHidden ?? false
 };
};

const hasSameSubscriptionContent = (left: Subscription, right: Subscription): boolean => {
 return left.name === right.name &&
  left.category === right.category &&
  left.amount === right.amount &&
  left.currency === right.currency &&
  left.period === right.period &&
  left.lastPaymentDate === right.lastPaymentDate &&
  left.nextPaymentDate === right.nextPaymentDate &&
  (left.customDate || '') === (right.customDate || '') &&
  (left.notificationEnabled ?? true) === (right.notificationEnabled ?? true);
};

const hasSameCategoryContent = (left: Category, right: Category): boolean => {
 return left.name === right.name &&
  left.order === right.order &&
  left.isBuiltIn === right.isBuiltIn &&
  left.isHidden === right.isHidden;
};

/**
 * 导出所有数据为 JSON 文件
 */
export function exportData(): void {
 const data: ExportData = {
 version: packageJson.version,
 exportDate: new Date().toISOString(),
 subscriptions: loadSubscriptions(),
 categories: loadCategories()
 };

 // 创建 Blob 并下载
 const blob = new Blob([JSON.stringify(data, null, 2)], {
 type: 'application/json'
 });
 const url = URL.createObjectURL(blob);
 const link = document.createElement('a');
 link.href = url;
 link.download = `subscription-manager-backup-${Date.now()}.json`;
 link.click();
 URL.revokeObjectURL(url);
}

/**
 * 读取并校验 JSON 导入文件
 */
export function readImportData(file: File): Promise<ExportData> {
 return new Promise((resolve, reject) => {
 const reader = new FileReader();

 reader.onload = (e) => {
 try {
 const content = e.target?.result as string;
 resolve(parseImportPayload(content));
 } catch (error) {
 if (error instanceof Error) {
 reject(new Error(`Failed to parse import file: ${error.message}`));
 } else {
 reject(new Error('Failed to parse import file'));
 }
 }
 };

 reader.onerror = () => {
 reject(new Error('Failed to read file'));
 };

 reader.readAsText(file);
 });
}

export function buildSubscriptionImportPlan(
 currentSubscriptions: Subscription[],
 importedSubscriptions: Subscription[]
): ImportPlan<Subscription> {
 const currentMap = new Map(
  currentSubscriptions.map(subscription => [subscription.id, normalizeSubscription(subscription)])
 );
 const importedMap = new Map(
  importedSubscriptions.map(subscription => [subscription.id, normalizeSubscription(subscription)])
 );

 const create = importedSubscriptions
  .map(subscription => normalizeSubscription(subscription))
  .filter(subscription => !currentMap.has(subscription.id));

 const update = importedSubscriptions
  .map(subscription => normalizeSubscription(subscription))
  .filter(subscription => {
   const current = currentMap.get(subscription.id);
   return current ? !hasSameSubscriptionContent(current, subscription) : false;
  });

 const deleteIds = currentSubscriptions
  .map(subscription => subscription.id)
  .filter(subscriptionId => !importedMap.has(subscriptionId));

 return { create, update, deleteIds };
}

export function buildCategoryImportPlan(
 currentCategories: Category[],
 importedCategories: Category[]
): ImportPlan<Category> {
 const currentMap = new Map(currentCategories.map(category => [category.id, category]));
 const importedMap = new Map(importedCategories.map(category => [category.id, category]));

 const create = importedCategories.filter(category => !currentMap.has(category.id));
 const update = importedCategories.filter(category => {
  const current = currentMap.get(category.id);
  return current ? !hasSameCategoryContent(current, category) : false;
 });
 const deleteIds = currentCategories
  .map(category => category.id)
  .filter(categoryId => !importedMap.has(categoryId));

 return { create, update, deleteIds };
}

/**
 * 验证导入文件内容（不实际导入，用于预览）
 */
export function validateImportData(file: File): Promise<ExportData> {
 return readImportData(file);
}
