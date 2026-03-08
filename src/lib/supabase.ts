import { createClient } from '@supabase/supabase-js'
import { config } from './config'
import { isRememberMeEnabled } from '../utils/rememberMe'

// 安全的存储适配器
const createSecureStorage = () => ({
 getItem: (key: string) => {
 // 根据记住登录状态决定存储位置
 const rememberMe = isRememberMeEnabled()

 if (rememberMe) {
 // 记住登录：使用localStorage，但只存储refresh token相关信息
 return localStorage.getItem(key)
 } else {
 // 普通登录：使用sessionStorage，关闭浏览器后自动清除
 return sessionStorage.getItem(key)
 }
 },
 setItem: (key: string, value: string) => {
 if (typeof value === 'string' && value.length > 0) {
 const rememberMe = isRememberMeEnabled()

 if (rememberMe) {
 // 记住登录：持久化存储
 localStorage.setItem(key, value)
 console.log('🔐 Auth token stored persistently (remember me enabled)')
 } else {
 // 普通登录：会话存储
 sessionStorage.setItem(key, value)
 console.log('🔐 Auth token stored in session (remember me disabled)')
 }
 }
 },
 removeItem: (key: string) => {
 // 从两个存储中都删除
 localStorage.removeItem(key)
 sessionStorage.removeItem(key)
 console.log('🔐 Auth token removed from both storages')
 }
})

// 条件创建Supabase客户端
export const supabase = config.hasSupabaseConfig
 ? createClient(config.supabase.url, config.supabase.anonKey, {
 auth: {
 // 使用动态存储配置
 storage: createSecureStorage(),
 // 自动刷新token（这是关键！）
 autoRefreshToken: true,
 // 检测URL中的session
 detectSessionInUrl: true,
 // 启用session持久化
 persistSession: true,
 // 更频繁的token刷新以提高安全性
 refreshIntervalSeconds: 3600, // 1小时刷新一次
 }
})
 : null // 没有配置时返回null

export type { User, Session } from '@supabase/supabase-js'