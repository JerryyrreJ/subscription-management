/**
 * 订阅类型管理工具函数
 * 支持默认类型和用户自定义类型
 */

const CUSTOM_CATEGORIES_KEY = 'subscription_custom_categories'

// 默认的订阅类型
export const DEFAULT_CATEGORIES = [
  'Entertainment',
  'Software',
  'Music',
  'Productivity',
  'Other'
] as const

/**
 * 获取用户自定义的类型
 */
export function getCustomCategories(): string[] {
  try {
    const stored = localStorage.getItem(CUSTOM_CATEGORIES_KEY)
    return stored ? JSON.parse(stored) : []
  } catch (error) {
    console.error('Error loading custom categories:', error)
    return []
  }
}

/**
 * 获取所有可用的类型（默认类型 + 用户自定义类型）
 */
export function getAllCategories(): string[] {
  const defaultCategories = [...DEFAULT_CATEGORIES]
  const customCategories = getCustomCategories()

  // 合并并去重
  const allCategories = [...defaultCategories, ...customCategories]
  return [...new Set(allCategories)]
}

/**
 * 添加新的自定义类型
 */
export function addCustomCategory(category: string): boolean {
  if (!category || typeof category !== 'string') {
    return false
  }

  const trimmedCategory = category.trim()

  // 检查是否为空或过长
  if (trimmedCategory.length === 0 || trimmedCategory.length > 50) {
    return false
  }

  // 检查是否已存在（不区分大小写）
  const allCategories = getAllCategories()
  const exists = allCategories.some(cat =>
    cat.toLowerCase() === trimmedCategory.toLowerCase()
  )

  if (exists) {
    return false
  }

  try {
    const customCategories = getCustomCategories()
    const updatedCategories = [...customCategories, trimmedCategory]
    localStorage.setItem(CUSTOM_CATEGORIES_KEY, JSON.stringify(updatedCategories))
    console.log(`Added custom category: ${trimmedCategory}`)
    return true
  } catch (error) {
    console.error('Error saving custom category:', error)
    return false
  }
}

/**
 * 删除自定义类型（只能删除用户自定义的，不能删除默认类型）
 */
export function removeCustomCategory(category: string): boolean {
  if (!category || (DEFAULT_CATEGORIES as readonly string[]).includes(category)) {
    return false
  }

  try {
    const customCategories = getCustomCategories()
    const updatedCategories = customCategories.filter(cat => cat !== category)
    localStorage.setItem(CUSTOM_CATEGORIES_KEY, JSON.stringify(updatedCategories))
    console.log(`Removed custom category: ${category}`)
    return true
  } catch (error) {
    console.error('Error removing custom category:', error)
    return false
  }
}

/**
 * 检查是否为用户自定义类型
 */
export function isCustomCategory(category: string): boolean {
  const customCategories = getCustomCategories()
  return customCategories.includes(category)
}

/**
 * 验证类型名称是否有效
 */
export function validateCategoryName(category: string): {
  isValid: boolean;
  error?: string
} {
  if (!category || typeof category !== 'string') {
    return { isValid: false, error: 'Category name is required' }
  }

  const trimmed = category.trim()

  if (trimmed.length === 0) {
    return { isValid: false, error: 'Category name cannot be empty' }
  }

  if (trimmed.length > 50) {
    return { isValid: false, error: 'Category name must be 50 characters or less' }
  }

  // 检查是否已存在
  const allCategories = getAllCategories()
  const exists = allCategories.some(cat =>
    cat.toLowerCase() === trimmed.toLowerCase()
  )

  if (exists) {
    return { isValid: false, error: 'This category already exists' }
  }

  // 检查特殊字符
  if (!/^[a-zA-Z0-9\s\-&]+$/.test(trimmed)) {
    return {
      isValid: false,
      error: 'Category name can only contain letters, numbers, spaces, hyphens, and &'
    }
  }

  return { isValid: true }
}