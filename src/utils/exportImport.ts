import { Subscription } from '../types';
import { loadSubscriptions, saveSubscriptions } from './storage';
import { loadCategories, saveCategories, Category } from './categories';

export interface ExportData {
  version: string;
  exportDate: string;
  subscriptions: Subscription[];
  categories: Category[];
}

export interface ImportResult {
  success: boolean;
  subscriptionCount: number;
  categoryCount: number;
}

/**
 * 导出所有数据为 JSON 文件
 */
export function exportData(): void {
  const data: ExportData = {
    version: '1.7.1',
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
 * 从 JSON 文件导入数据
 */
export function importData(file: File): Promise<ImportResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const data = JSON.parse(content) as ExportData;

        // 验证数据格式
        if (!data.subscriptions || !Array.isArray(data.subscriptions)) {
          reject(new Error('Invalid data format: subscriptions array is required'));
          return;
        }

        // 验证订阅数据结构
        for (const sub of data.subscriptions) {
          if (!sub.id || !sub.name || !sub.category || !sub.amount || !sub.period) {
            reject(new Error('Invalid subscription data: missing required fields'));
            return;
          }
        }

        // 导入订阅数据
        saveSubscriptions(data.subscriptions);

        // 导入类型数据（如果有）
        let categoryCount = 0;
        if (data.categories && Array.isArray(data.categories)) {
          saveCategories(data.categories);
          categoryCount = data.categories.length;
        }

        resolve({
          success: true,
          subscriptionCount: data.subscriptions.length,
          categoryCount
        });
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

/**
 * 验证导入文件内容（不实际导入，用于预览）
 */
export function validateImportData(file: File): Promise<ExportData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const data = JSON.parse(content) as ExportData;

        // 验证数据格式
        if (!data.subscriptions || !Array.isArray(data.subscriptions)) {
          reject(new Error('Invalid data format'));
          return;
        }

        resolve(data);
      } catch (error) {
        reject(new Error('Invalid JSON file'));
      }
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };

    reader.readAsText(file);
  });
}
