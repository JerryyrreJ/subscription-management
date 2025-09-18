import { createClient } from '@supabase/supabase-js'
import { config } from './config'

// 条件创建Supabase客户端
export const supabase = config.hasSupabaseConfig
  ? createClient(config.supabase.url, config.supabase.anonKey, {
  auth: {
    // 使用更安全的存储配置
    storage: {
      getItem: (key: string) => {
        // 使用sessionStorage而不是localStorage来存储敏感token
        // sessionStorage在浏览器标签关闭时会自动清除
        return sessionStorage.getItem(key)
      },
      setItem: (key: string, value: string) => {
        // 在存储前添加安全检查
        if (typeof value === 'string' && value.length > 0) {
          sessionStorage.setItem(key, value)
        }
      },
      removeItem: (key: string) => {
        sessionStorage.removeItem(key)
      }
    },
    // 自动刷新token
    autoRefreshToken: true,
    // 检测session变化
    detectSessionInUrl: true,
    // 持久化session
    persistSession: true,
    // 设置更短的token刷新间隔以提高安全性
    // refreshIntervalSeconds: 3600 // 1小时
  }
})
  : null // 没有配置时返回null

export type { User, Session } from '@supabase/supabase-js'