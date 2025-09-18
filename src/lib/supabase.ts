import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
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

export type { User, Session } from '@supabase/supabase-js'