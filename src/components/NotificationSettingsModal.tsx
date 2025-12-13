import { useState, useEffect } from 'react';
import { X, Bell, Send } from 'lucide-react';
import { ReminderSettings } from '../types';
import { testBarkPush, validateBarkConfig } from '../utils/barkPush';
import { CustomSelect } from './CustomSelect';

interface NotificationSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: ReminderSettings;
  onSave: (settings: ReminderSettings) => void;
}

export function NotificationSettingsModal({
  isOpen,
  onClose,
  settings,
  onSave
}: NotificationSettingsModalProps) {
  const [localSettings, setLocalSettings] = useState<ReminderSettings>(settings);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const handleSave = () => {
    onSave(localSettings);
    onClose();
  };

  const handleTestBark = async () => {
    const validation = validateBarkConfig(
      localSettings.barkPush.serverUrl,
      localSettings.barkPush.deviceKey
    );

    if (!validation.valid) {
      setTestResult({ success: false, message: validation.error || 'Invalid configuration' });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const success = await testBarkPush(
        localSettings.barkPush.serverUrl,
        localSettings.barkPush.deviceKey
      );

      if (success) {
        setTestResult({ success: true, message: 'Test push sent successfully! Check your device.' });
      } else {
        setTestResult({ success: false, message: 'Failed to send test push. Please check your settings.' });
      }
    } catch (error) {
      setTestResult({ success: false, message: 'Error sending test push.' });
    } finally {
      setIsTesting(false);
    }
  };

  const daysOptions = [
    { value: '1', label: '1 day before' },
    { value: '3', label: '3 days before' },
    { value: '7', label: '7 days before' },
    { value: '14', label: '14 days before' }
  ];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto animate-scale-in">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
              <Bell className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Notification Settings
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* 全局提示 */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <p className="text-sm text-blue-800 dark:text-blue-200">
              <strong>Note:</strong> Notifications are sent automatically from our server. You don't need to keep the app open.
              Additionally, you can enable/disable notifications for individual subscriptions when adding or editing them.
            </p>
          </div>

          {/* Bark Push */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              Bark Push Notifications (iOS)
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Receive push notifications on your iOS device via Bark app
            </p>
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 space-y-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={localSettings.barkPush.enabled}
                  onChange={(e) => setLocalSettings({
                    ...localSettings,
                    barkPush: {
                      ...localSettings.barkPush,
                      enabled: e.target.checked
                    }
                  })}
                  className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Enable Bark push notifications
                </span>
              </label>

              {localSettings.barkPush.enabled && (
                <div className="space-y-3 ml-7">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Server URL
                    </label>
                    <input
                      type="url"
                      value={localSettings.barkPush.serverUrl}
                      onChange={(e) => setLocalSettings({
                        ...localSettings,
                        barkPush: {
                          ...localSettings.barkPush,
                          serverUrl: e.target.value
                        }
                      })}
                      placeholder="https://api.day.app"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Device Key
                    </label>
                    <input
                      type="text"
                      value={localSettings.barkPush.deviceKey}
                      onChange={(e) => setLocalSettings({
                        ...localSettings,
                        barkPush: {
                          ...localSettings.barkPush,
                          deviceKey: e.target.value
                        }
                      })}
                      placeholder="your_device_key_here"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      You can use the official server (https://api.day.app) or your own self-hosted Bark server
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-700 dark:text-gray-300">Remind me</span>
                    <div className="w-48">
                      <CustomSelect
                        value={localSettings.barkPush.daysBefore.toString()}
                        onChange={(value) => setLocalSettings({
                          ...localSettings,
                          barkPush: {
                            ...localSettings.barkPush,
                            daysBefore: parseInt(value)
                          }
                        })}
                        options={daysOptions}
                      />
                    </div>
                  </div>

                  {/* Test Button */}
                  <div className="pt-2 border-t border-gray-200 dark:border-gray-600">
                    <button
                      onClick={handleTestBark}
                      disabled={isTesting || !localSettings.barkPush.serverUrl || !localSettings.barkPush.deviceKey}
                      className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white rounded-lg transition-colors"
                    >
                      <Send className="w-4 h-4" />
                      {isTesting ? 'Sending...' : 'Test Push'}
                    </button>

                    {testResult && (
                      <div className={`mt-3 p-3 rounded-lg ${
                        testResult.success
                          ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                          : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
                      }`}>
                        <p className={`text-sm ${
                          testResult.success
                            ? 'text-green-800 dark:text-green-200'
                            : 'text-red-800 dark:text-red-200'
                        }`}>
                          {testResult.message}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-6 border-t border-gray-200 dark:border-gray-700 sticky bottom-0 bg-white dark:bg-gray-800">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors"
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}
