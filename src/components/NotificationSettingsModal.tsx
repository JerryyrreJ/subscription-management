import { useState, useEffect } from 'react';
import { X, Bell, Send, ChevronDown, ChevronUp, Download, Key, Copy, Globe, ExternalLink } from 'lucide-react';
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
  const [isGuideExpanded, setIsGuideExpanded] = useState(true);
  const [barkUrl, setBarkUrl] = useState('');

  // Parse Bark URL to extract server and device key
  const parseBarkUrl = (url: string) => {
    try {
      // Remove trailing content after device key (e.g., /推送标题/推送内容)
      // Expected format: https://api.day.app/DEVICE_KEY or https://api.day.app/DEVICE_KEY/...
      const trimmedUrl = url.trim();

      // Try to parse as URL
      const urlObj = new URL(trimmedUrl);
      const serverUrl = `${urlObj.protocol}//${urlObj.host}`;

      // Extract device key (first path segment after /)
      const pathParts = urlObj.pathname.split('/').filter(part => part.length > 0);
      const deviceKey = pathParts[0] || '';

      return { serverUrl, deviceKey, valid: deviceKey.length > 0 };
    } catch (error) {
      return { serverUrl: '', deviceKey: '', valid: false };
    }
  };

  // Handle Bark URL input change
  const handleBarkUrlChange = (url: string) => {
    setBarkUrl(url);
    const parsed = parseBarkUrl(url);

    if (parsed.valid) {
      setLocalSettings({
        ...localSettings,
        barkPush: {
          ...localSettings.barkPush,
          serverUrl: parsed.serverUrl,
          deviceKey: parsed.deviceKey
        }
      });
    }
  };

  useEffect(() => {
    setLocalSettings(settings);
    // Initialize Bark URL if server and device key exist
    if (settings.barkPush.serverUrl && settings.barkPush.deviceKey) {
      setBarkUrl(`${settings.barkPush.serverUrl}/${settings.barkPush.deviceKey}`);
    }
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

            {/* Setup Guide - Collapsible */}
            <div className="mb-4 border border-indigo-200 dark:border-indigo-800 rounded-lg overflow-hidden bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20">
              <button
                onClick={() => setIsGuideExpanded(!isGuideExpanded)}
                className="w-full flex items-center justify-between p-4 hover:bg-indigo-100/50 dark:hover:bg-indigo-800/30 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Bell className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  <span className="font-medium text-gray-900 dark:text-white">
                    📖 Setup Guide
                  </span>
                </div>
                {isGuideExpanded ? (
                  <ChevronUp className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                )}
              </button>

              {isGuideExpanded && (
                <div className="px-4 pb-4 space-y-4">
                  {/* What is Bark */}
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-indigo-100 dark:border-indigo-900">
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                      <span className="text-lg">🔔</span>
                      What is Bark?
                    </h4>
                    <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                      Bark is a <strong>free, open-source iOS app</strong> that lets you receive push notifications from web apps.
                      It works even when this app is closed! Perfect for getting timely reminders about your subscription renewals.
                    </p>
                  </div>

                  {/* Download */}
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-indigo-100 dark:border-indigo-900">
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                      <Download className="w-4 h-4" />
                      Download Bark
                    </h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                      📱 <strong>Important:</strong> Download it on your phone (not on this computer)
                    </p>
                    <a
                      href="https://apps.apple.com/app/bark-customed-notifications/id1403753865"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 bg-black hover:bg-gray-800 text-white rounded-lg transition-colors text-sm font-medium"
                    >
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                      </svg>
                      Get on App Store
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>

                  {/* How to get Bark URL */}
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-indigo-100 dark:border-indigo-900">
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                      <Copy className="w-4 h-4" />
                      How to get your Bark URL
                    </h4>
                    <div className="space-y-3">
                      <div className="flex gap-3">
                        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold">
                          1
                        </div>
                        <div className="flex-1">
                          <p className="text-sm text-gray-700 dark:text-gray-300">
                            <strong>Download and open Bark</strong> from the App Store
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold">
                          2
                        </div>
                        <div className="flex-1">
                          <p className="text-sm text-gray-700 dark:text-gray-300">
                            <strong>Tap "Server"</strong> at the bottom of the Bark app
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold">
                          3
                        </div>
                        <div className="flex-1">
                          <p className="text-sm text-gray-700 dark:text-gray-300">
                            <strong>Copy any example URL</strong> from the Server page
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold">
                          4
                        </div>
                        <div className="flex-1">
                          <p className="text-sm text-gray-700 dark:text-gray-300">
                            <strong>Paste the URL below</strong> - we'll extract the key automatically!
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Tip */}
                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                    <p className="text-xs text-amber-800 dark:text-amber-200">
                      💡 <strong>Tip:</strong> After setup, use the "Test Push" button below to verify everything works!
                    </p>
                  </div>
                </div>
              )}
            </div>

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
                      Bark URL
                    </label>
                    <input
                      type="text"
                      value={barkUrl}
                      onChange={(e) => handleBarkUrlChange(e.target.value)}
                      placeholder="https://api.day.app/AbCd1234EfGh5678"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono text-sm"
                    />
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      📋 Copy any example URL from Bark's Server page and paste it here
                    </p>
                    {barkUrl && parseBarkUrl(barkUrl).valid && (
                      <div className="mt-2 p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded text-xs">
                        <p className="text-green-800 dark:text-green-200">
                          ✓ Valid! Server: <code className="font-mono">{parseBarkUrl(barkUrl).serverUrl}</code>
                          {' • '}
                          Device Key: <code className="font-mono">{parseBarkUrl(barkUrl).deviceKey}</code>
                        </p>
                      </div>
                    )}
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
