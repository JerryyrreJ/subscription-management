import { Cloud, CloudOff, RefreshCw, Check, AlertCircle } from 'lucide-react'
import { SyncStatus } from '../hooks/useSubscriptionSync'

interface SyncIndicatorProps {
  status: SyncStatus
  isOnline: boolean
  onSync?: () => void
}

export function SyncIndicator({ status, isOnline, onSync }: SyncIndicatorProps) {
  const getStatusInfo = () => {
    if (!isOnline) {
      return {
        icon: CloudOff,
        text: 'Offline',
        color: 'text-gray-500 dark:text-gray-400',
        bgColor: 'bg-gray-100 dark:bg-gray-800'
      }
    }

    switch (status) {
      case 'syncing':
        return {
          icon: RefreshCw,
          text: 'Syncing...',
          color: 'text-blue-600 dark:text-blue-400',
          bgColor: 'bg-blue-50 dark:bg-blue-900/20',
          animate: 'animate-spin'
        }
      case 'success':
        return {
          icon: Check,
          text: 'Synced',
          color: 'text-green-600 dark:text-green-400',
          bgColor: 'bg-green-50 dark:bg-green-900/20'
        }
      case 'error':
        return {
          icon: AlertCircle,
          text: 'Sync Failed',
          color: 'text-red-600 dark:text-red-400',
          bgColor: 'bg-red-50 dark:bg-red-900/20'
        }
      case 'idle':
      default:
        return {
          icon: Cloud,
          text: 'Online',
          color: 'text-gray-600 dark:text-gray-400',
          bgColor: 'bg-gray-50 dark:bg-gray-800'
        }
    }
  }

  const statusInfo = getStatusInfo()
  const Icon = statusInfo.icon

  return (
    <button
      onClick={onSync}
      disabled={status === 'syncing' || !isOnline}
      className="relative p-2 rounded-lg bg-white dark:bg-gray-800 shadow-md hover:shadow-lg transition-all duration-700 hover:duration-500 ease-in-out group overflow-hidden w-10 hover:w-auto"
    >
      <div className="flex items-center space-x-2">
        <div className="w-6 h-6 flex items-center justify-center flex-shrink-0">
          <Icon className={`w-4 h-4 ${statusInfo.color} ${statusInfo.animate || ''}`} />
        </div>

        {/* 展开的文字区域 */}
        <span className="whitespace-nowrap text-sm font-medium text-gray-700 dark:text-gray-300 opacity-0 group-hover:opacity-100 transition-all duration-700 hover:duration-500 ease-in-out max-w-0 group-hover:max-w-xs overflow-hidden">
          {isOnline ? (status === 'syncing' ? 'Syncing...' : 'Click to sync') : 'Offline'}
        </span>
      </div>
    </button>
  )
}