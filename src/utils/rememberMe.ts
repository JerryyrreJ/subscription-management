/**
 * 记住登录功能的工具函数
 */

const REMEMBER_ME_KEY = 'auth_remember_me'

/**
 * 设置记住登录状态
 */
export function setRememberMe(remember: boolean): void {
  if (remember) {
    localStorage.setItem(REMEMBER_ME_KEY, 'true')
    console.log('🔐 Remember me enabled - user will stay logged in')
  } else {
    localStorage.removeItem(REMEMBER_ME_KEY)
    console.log('🔐 Remember me disabled - normal session behavior')
  }
}

/**
 * 检查是否启用了记住登录
 */
export function isRememberMeEnabled(): boolean {
  return localStorage.getItem(REMEMBER_ME_KEY) === 'true'
}

/**
 * 清除记住登录状态
 */
export function clearRememberMe(): void {
  localStorage.removeItem(REMEMBER_ME_KEY)
  console.log('🔐 Remember me status cleared')
}

/**
 * 检查是否应该尝试自动恢复登录
 */
export function shouldAttemptAutoRestore(): boolean {
  return isRememberMeEnabled()
}