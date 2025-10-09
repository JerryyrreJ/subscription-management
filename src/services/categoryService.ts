import { supabase } from '../lib/supabase'
import { Category } from '../utils/categories'
import { config } from '../lib/config'

export interface SupabaseCategory {
  id: string
  user_id: string
  category_id: string
  name: string
  order: number
  is_built_in: boolean
  is_hidden: boolean
  created_at: string
  updated_at: string
}

export class CategoryService {
  // 获取云端类别数据
  static async getCategories(): Promise<Category[]> {
    if (!config.hasSupabaseConfig || !supabase) {
      throw new Error('Cloud sync not available')
    }

    const { data, error } = await supabase
      .from('user_categories')
      .select('*')
      .order('order', { ascending: true })

    if (error) {
      console.error('Error fetching categories:', error)
      throw error
    }

    return data ? data.map(this.transformFromSupabase) : []
  }

  // 创建类别
  static async createCategory(category: Category): Promise<Category> {
    if (!config.hasSupabaseConfig || !supabase) {
      throw new Error('Cloud sync not available')
    }

    // 获取当前用户ID
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      throw new Error('User not authenticated')
    }

    const { data, error } = await supabase
      .from('user_categories')
      .insert([{
        user_id: user.id,
        category_id: category.id,
        name: category.name,
        order: category.order,
        is_built_in: category.isBuiltIn,
        is_hidden: category.isHidden
      }])
      .select()
      .single()

    if (error) {
      console.error('Error creating category:', error)
      throw error
    }

    return this.transformFromSupabase(data)
  }

  // 更新类别
  static async updateCategory(category: Category): Promise<Category> {
    if (!config.hasSupabaseConfig || !supabase) {
      throw new Error('Cloud sync not available')
    }

    const { data, error } = await supabase
      .from('user_categories')
      .update({
        name: category.name,
        order: category.order,
        is_hidden: category.isHidden
      })
      .eq('category_id', category.id)
      .select()
      .single()

    if (error) {
      console.error('Error updating category:', error)
      throw error
    }

    return this.transformFromSupabase(data)
  }

  // 删除类别
  static async deleteCategory(categoryId: string): Promise<void> {
    if (!config.hasSupabaseConfig || !supabase) {
      throw new Error('Cloud sync not available')
    }

    const { error } = await supabase
      .from('user_categories')
      .delete()
      .eq('category_id', categoryId)

    if (error) {
      console.error('Error deleting category:', error)
      throw error
    }
  }

  // 批量同步 - 下载模式（云端为准）
  static async syncCategories(localCategories: Category[]): Promise<Category[]> {
    if (!config.hasSupabaseConfig || !supabase) {
      throw new Error('Cloud sync not available')
    }

    try {
      // 直接获取云端数据，以云端为权威数据源
      const cloudCategories = await this.getCategories()

      console.log(`Category sync completed: ${cloudCategories.length} categories from cloud (authoritative)`)
      console.log(`Local data (${localCategories.length} items) will be replaced by cloud data`)

      return cloudCategories
    } catch (error) {
      console.error('Error syncing categories:', error)
      // 如果同步失败，返回本地数据作为降级方案
      return localCategories
    }
  }

  // 批量上传本地类别到云端（带去重检查）
  static async uploadLocalCategories(categories: Category[]): Promise<Category[]> {
    if (!config.hasSupabaseConfig || !supabase) {
      throw new Error('Cloud sync not available')
    }

    try {
      // 获取当前用户ID
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        throw new Error('User not authenticated')
      }

      // 1. 获取云端现有数据进行去重检查
      const cloudCategories = await this.getCategories()

      // 2. 创建云端类别ID映射
      const cloudCategoryIds = new Set(cloudCategories.map(c => c.id))

      // 3. 过滤需要上传的类别（避免重复）
      const categoriesToUpload = categories.filter(cat => {
        if (cloudCategoryIds.has(cat.id)) {
          console.log(`Skipping upload for category ${cat.name}: ID already exists in cloud`)
          return false
        }
        return true
      })

      console.log(`Uploading ${categoriesToUpload.length} unique local categories`)

      // 4. 上传独有的类别
      const uploadPromises = categoriesToUpload.map(async (cat) => {
        try {
          return await this.createCategory(cat)
        } catch (error) {
          console.error(`Failed to upload category ${cat.name}:`, error)
          return cat // 保留原始数据
        }
      })

      const uploadedCategories = await Promise.all(uploadPromises)

      // 5. 返回所有云端数据（包括原有的和新上传的）
      const allCategories = [...cloudCategories, ...uploadedCategories]

      // 根据ID去重，确保数据一致性
      const uniqueCategories = allCategories.reduce((acc, current) => {
        const existing = acc.find(item => item.id === current.id)
        if (!existing) {
          acc.push(current)
        }
        return acc
      }, [] as Category[])

      return uniqueCategories
    } catch (error) {
      console.error('Error uploading categories:', error)
      return categories
    }
  }

  // 批量更新类别顺序
  static async updateCategoriesOrder(categories: Category[]): Promise<void> {
    if (!config.hasSupabaseConfig || !supabase) {
      throw new Error('Cloud sync not available')
    }

    try {
      // 批量更新每个类别的 order 字段
      const updatePromises = categories.map(async (cat) => {
        return await supabase
          .from('user_categories')
          .update({ order: cat.order })
          .eq('category_id', cat.id)
      })

      await Promise.all(updatePromises)
      console.log('Categories order updated in cloud')
    } catch (error) {
      console.error('Error updating categories order:', error)
      throw error
    }
  }

  // 数据格式转换：Supabase -> App
  private static transformFromSupabase(data: SupabaseCategory): Category {
    return {
      id: data.category_id,
      name: data.name,
      order: data.order,
      isBuiltIn: data.is_built_in,
      isHidden: data.is_hidden
    }
  }
}
