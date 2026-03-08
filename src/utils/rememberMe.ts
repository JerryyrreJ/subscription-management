/**
 * 记住登录功能的工具函数
 *
 * 安全实现说明：
 * 1. 只存储记住登录的偏好设置，不存储敏感token
 * 2. 使用时间戳验证，防止无限期记住
 * 3. Supabase的refresh token机制提供安全保障
 */

const REMEMBER_ME_KEY = 'auth_remember_me'
const REMEMBER_ME_TIMESTAMP_KEY = 'auth_remember_me_timestamp'
const REMEMBER_ME_DURATION = 30 * 24 * 60 * 60 * 1000 // 30天

/**
 * 设置记住登录状态
 */
export function setRememberMe(remember: boolean): void {
 if (remember) {
 const timestamp = Date.now()
 localStorage.setItem(REMEMBER_ME_KEY, 'true')
 localStorage.setItem(REMEMBER_ME_TIMESTAMP_KEY, timestamp.toString())
 console.log('🔐 Remember me enabled - will persist for 30 days')
 } else {
 localStorage.removeItem(REMEMBER_ME_KEY)
 localStorage.removeItem(REMEMBER_ME_TIMESTAMP_KEY)
 console.log('🔐 Remember me disabled - session-only login')
 }
}

/**
 * 检查是否启用了记住登录（带过期检查）
 */
export function isRememberMeEnabled(): boolean {
 const rememberMe = localStorage.getItem(REMEMBER_ME_KEY) === 'true'

 if (!rememberMe) {
 return false
 }

 // 检查是否过期
 const timestampStr = localStorage.getItem(REMEMBER_ME_TIMESTAMP_KEY)
 if (!timestampStr) {
 // 没有时间戳，清除记住登录状态
 clearRememberMe()
 return false
 }

 const timestamp = parseInt(timestampStr, 10)
 const now = Date.now()

 if (now - timestamp > REMEMBER_ME_DURATION) {
 // 已过期，清除状态
 console.log('🔐 Remember me expired, clearing status')
 clearRememberMe()
 return false
 }

 return true
}

/**
 * 清除记住登录状态
 */
export function clearRememberMe(): void {
 localStorage.removeItem(REMEMBER_ME_KEY)
 localStorage.removeItem(REMEMBER_ME_TIMESTAMP_KEY)
 console.log('🔐 Remember me status cleared')
}

/**
 * 检查是否应该尝试自动恢复登录
 */
export function shouldAttemptAutoRestore(): boolean {
 return isRememberMeEnabled()
}

/**
 * 刷新记住登录的时间戳（在成功登录后调用）
 */
export function refreshRememberMeTimestamp(): void {
 if (isRememberMeEnabled()) {
 const timestamp = Date.now()
 localStorage.setItem(REMEMBER_ME_TIMESTAMP_KEY, timestamp.toString())
 console.log('🔐 Remember me timestamp refreshed')
 }
}