/**
 * 订阅类型管理工具函数
 * 支持默认类型、用户自定义类型、软删除、拖拽排序
 */

const CATEGORIES_STORAGE_KEY = 'subscription_categories_v2'

// 类型数据结构
export interface Category {
  id: string
  name: string
  order: number
  isBuiltIn: boolean // 是否为内置类型
  isHidden: boolean  // 软删除标记（仅对内置类型有效）
}

// 默认的订阅类型（内置类型）
export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'entertainment', name: 'Entertainment', order: 0, isBuiltIn: true, isHidden: false },
  { id: 'software', name: 'Software', order: 1, isBuiltIn: true, isHidden: false },
  { id: 'music', name: 'Music', order: 2, isBuiltIn: true, isHidden: false },
  { id: 'productivity', name: 'Productivity', order: 3, isBuiltIn: true, isHidden: false },
  { id: 'other', name: 'Other', order: 4, isBuiltIn: true, isHidden: false }
]

// 兜底类型（不可删除）
export const FALLBACK_CATEGORY = 'Uncategorized'

/**
 * 从 localStorage 加载所有类型数据
 * 包含数据迁移逻辑：从旧版本 v1 迁移到 v2
 */
function loadCategories(): Category[] {
  try {
    const stored = localStorage.getItem(CATEGORIES_STORAGE_KEY)

    if (stored) {
      const categories: Category[] = JSON.parse(stored)
      return categories
    }

    // 数据迁移：检查是否有旧版本数据
    const oldCustomCategories = localStorage.getItem('subscription_custom_categories')
    if (oldCustomCategories) {
      console.log('Migrating categories from v1 to v2...')
      const oldCustom: string[] = JSON.parse(oldCustomCategories)

      // 合并默认类型和旧的自定义类型
      const migratedCategories: Category[] = [
        ...DEFAULT_CATEGORIES,
        ...oldCustom.map((name, index) => ({
          id: `custom-${Date.now()}-${index}`,
          name,
          order: DEFAULT_CATEGORIES.length + index,
          isBuiltIn: false,
          isHidden: false
        }))
      ]

      // 保存迁移后的数据
      saveCategories(migratedCategories)

      // 删除旧数据
      localStorage.removeItem('subscription_custom_categories')

      return migratedCategories
    }

    // 首次使用，返回默认类型
    const defaultCategories = [...DEFAULT_CATEGORIES]
    saveCategories(defaultCategories)
    return defaultCategories
  } catch (error) {
    console.error('Error loading categories:', error)
    return [...DEFAULT_CATEGORIES]
  }
}

/**
 * 保存类型数据到 localStorage
 */
function saveCategories(categories: Category[]): void {
  try {
    localStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(categories))
  } catch (error) {
    console.error('Error saving categories:', error)
  }
}

/**
 * 获取所有可见的类型（排除隐藏的内置类型）
 * 返回类型名称数组，用于向后兼容
 */
export function getAllCategories(): string[] {
  const categories = loadCategories()
  return categories
    .filter(cat => !cat.isHidden)
    .sort((a, b) => a.order - b.order)
    .map(cat => cat.name)
}

/**
 * 获取完整的类型对象数组（包含隐藏的）
 * 用于类型管理界面
 */
export function getAllCategoriesWithDetails(): Category[] {
  return loadCategories().sort((a, b) => a.order - b.order)
}

/**
 * 获取所有可见的类型对象
 */
export function getVisibleCategories(): Category[] {
  return loadCategories()
    .filter(cat => !cat.isHidden)
    .sort((a, b) => a.order - b.order)
}

/**
 * 添加新的自定义类型
 */
export function addCustomCategory(categoryName: string): boolean {
  if (!categoryName || typeof categoryName !== 'string') {
    return false
  }

  const trimmed = categoryName.trim()

  // 验证类型名称
  const validation = validateCategoryName(trimmed)
  if (!validation.isValid) {
    return false
  }

  try {
    const categories = loadCategories()

    // 检查是否已存在（包括隐藏的）
    const exists = categories.some(cat =>
      cat.name.toLowerCase() === trimmed.toLowerCase()
    )

    if (exists) {
      // 如果是隐藏的内置类型，恢复它
      const hiddenCategory = categories.find(
        cat => cat.name.toLowerCase() === trimmed.toLowerCase() && cat.isHidden
      )
      if (hiddenCategory) {
        hiddenCategory.isHidden = false
        saveCategories(categories)
        console.log(`Restored hidden category: ${trimmed}`)
        return true
      }
      return false
    }

    // 创建新的自定义类型
    const maxOrder = Math.max(...categories.map(cat => cat.order), -1)
    const newCategory: Category = {
      id: `custom-${Date.now()}`,
      name: trimmed,
      order: maxOrder + 1,
      isBuiltIn: false,
      isHidden: false
    }

    categories.push(newCategory)
    saveCategories(categories)
    console.log(`Added custom category: ${trimmed}`)
    return true
  } catch (error) {
    console.error('Error adding custom category:', error)
    return false
  }
}

/**
 * 删除/隐藏类型（软删除）
 * - 内置类型：标记为隐藏
 * - 自定义类型：彻底删除
 * - 兜底类型（Uncategorized）：不可删除
 */
export function deleteCategory(categoryName: string): boolean {
  if (!categoryName || categoryName === FALLBACK_CATEGORY) {
    return false
  }

  try {
    const categories = loadCategories()
    const categoryIndex = categories.findIndex(cat => cat.name === categoryName)

    if (categoryIndex === -1) {
      return false
    }

    const category = categories[categoryIndex]

    if (category.isBuiltIn) {
      // 内置类型：软删除（标记为隐藏）
      category.isHidden = true
      console.log(`Hidden built-in category: ${categoryName}`)
    } else {
      // 自定义类型：彻底删除
      categories.splice(categoryIndex, 1)
      console.log(`Deleted custom category: ${categoryName}`)
    }

    saveCategories(categories)
    return true
  } catch (error) {
    console.error('Error deleting category:', error)
    return false
  }
}

/**
 * 恢复隐藏的内置类型
 */
export function restoreCategory(categoryName: string): boolean {
  try {
    const categories = loadCategories()
    const category = categories.find(cat => cat.name === categoryName && cat.isHidden)

    if (!category) {
      return false
    }

    category.isHidden = false
    saveCategories(categories)
    console.log(`Restored category: ${categoryName}`)
    return true
  } catch (error) {
    console.error('Error restoring category:', error)
    return false
  }
}

/**
 * 恢复所有默认类型（重置为初始状态）
 */
export function restoreDefaultCategories(): void {
  try {
    const categories = loadCategories()

    // 将所有内置类型设为可见
    categories.forEach(cat => {
      if (cat.isBuiltIn) {
        cat.isHidden = false
      }
    })

    // 检查是否缺少默认类型，如果缺少则添加
    DEFAULT_CATEGORIES.forEach(defaultCat => {
      const exists = categories.find(cat => cat.id === defaultCat.id)
      if (!exists) {
        categories.push({ ...defaultCat })
      }
    })

    saveCategories(categories)
    console.log('Restored all default categories')
  } catch (error) {
    console.error('Error restoring default categories:', error)
  }
}

/**
 * 更新类型顺序
 */
export function updateCategoriesOrder(reorderedCategories: Category[]): void {
  try {
    // 更新 order 字段
    reorderedCategories.forEach((cat, index) => {
      cat.order = index
    })
    saveCategories(reorderedCategories)
    console.log('Updated categories order')
  } catch (error) {
    console.error('Error updating categories order:', error)
  }
}

/**
 * 检查是否为用户自定义类型
 */
export function isCustomCategory(categoryName: string): boolean {
  const categories = loadCategories()
  const category = categories.find(cat => cat.name === categoryName)
  return category ? !category.isBuiltIn : false
}

/**
 * 验证类型名称是否有效
 */
export function validateCategoryName(categoryName: string, excludeId?: string): {
  isValid: boolean
  error?: string
} {
  if (!categoryName || typeof categoryName !== 'string') {
    return { isValid: false, error: 'Category name is required' }
  }

  const trimmed = categoryName.trim()

  if (trimmed.length === 0) {
    return { isValid: false, error: 'Category name cannot be empty' }
  }

  if (trimmed.length > 50) {
    return { isValid: false, error: 'Category name must be 50 characters or less' }
  }

  // 检查特殊字符
  if (!/^[a-zA-Z0-9\s\-&]+$/.test(trimmed)) {
    return {
      isValid: false,
      error: 'Category name can only contain letters, numbers, spaces, hyphens, and &'
    }
  }

  // 检查是否已存在（排除当前编辑的类型）
  const categories = loadCategories()
  const exists = categories.some(cat =>
    cat.id !== excludeId && cat.name.toLowerCase() === trimmed.toLowerCase()
  )

  if (exists) {
    return { isValid: false, error: 'This category already exists' }
  }

  return { isValid: true }
}

/**
 * 重命名类型
 */
export function renameCategory(categoryId: string, newName: string): boolean {
  const trimmed = newName.trim()
  const validation = validateCategoryName(trimmed, categoryId)

  if (!validation.isValid) {
    return false
  }

  try {
    const categories = loadCategories()
    const category = categories.find(cat => cat.id === categoryId)

    if (!category) {
      return false
    }

    category.name = trimmed
    saveCategories(categories)
    console.log(`Renamed category to: ${trimmed}`)
    return true
  } catch (error) {
    console.error('Error renaming category:', error)
    return false
  }
}