import { X, AlertTriangle, Upload } from 'lucide-react';
import { ExportData } from '../utils/exportImport';

interface ImportDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  previewData: ExportData | null;
}

export function ImportDataModal({
  isOpen,
  onClose,
  onConfirm,
  previewData
}: ImportDataModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full animate-scale-in">
        <div className="flex justify-between items-center p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-500" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Import Data
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              ⚠️ <strong>Warning:</strong> This will replace all your current data including subscriptions and categories.
            </p>
          </div>

          {previewData && (
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 space-y-2">
              <h3 className="font-medium text-gray-900 dark:text-white mb-3">
                Import Preview:
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Subscriptions:</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {previewData.subscriptions.length}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Categories:</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {previewData.categories?.length || 0}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Export Date:</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {new Date(previewData.exportDate).toLocaleDateString()}
                  </span>
                </div>
                {previewData.version && (
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Version:</span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {previewData.version}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
            >
              <Upload className="w-4 h-4" />
              Import
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
