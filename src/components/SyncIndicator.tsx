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
      className={`
        flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all
        ${statusInfo.bgColor} ${statusInfo.color}
        ${isOnline && status !== 'syncing' ? 'hover:opacity-80 cursor-pointer' : 'cursor-default'}
        disabled:opacity-50
      `}
      title={isOnline ? 'Click to sync data' : 'You are offline'}
    >
      <Icon className={`w-3.5 h-3.5 ${statusInfo.animate || ''}`} />
      <span>{statusInfo.text}</span>
    </button>
  )
}