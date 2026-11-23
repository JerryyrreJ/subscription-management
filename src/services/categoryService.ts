import { supabase } from '../lib/supabase'
import { Category } from '../utils/categories'
import { config } from '../lib/config'
import { buildCategoryImportPlan } from '../utils/exportImport'
import { scopeCategoryQueryToUser, scopeCategoryQueryToUserAndId } from '../utils/categoryTenantScope'

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
 private static async getAuthenticatedUserId(expectedUserId?: string): Promise<string> {
  if (!supabase) {
   throw new Error('Cloud sync not available')
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
   throw new Error('User not authenticated')
  }

  if (expectedUserId && user.id !== expectedUserId) {
   throw new Error('Authenticated user changed during category operation')
  }

  return user.id
 }

 // 获取云端类别数据
 static async getCategories(expectedUserId?: string): Promise<Category[]> {
  if (!config.hasSupabaseConfig || !supabase) {
   throw new Error('Cloud sync not available')
  }

  const client = supabase
  const userId = await CategoryService.getAuthenticatedUserId(expectedUserId)

  const { data, error } = await scopeCategoryQueryToUser(
   client
    .from('user_categories')
    .select('*')
    .order('order', { ascending: true }),
   userId
  )

  if (error) {
   console.error('Error fetching categories:', error)
   throw error
  }

  return data ? data.map(CategoryService.transformFromSupabase) : []
 }

 // 创建类别
 static async createCategory(category: Category, expectedUserId?: string): Promise<Category> {
  if (!config.hasSupabaseConfig || !supabase) {
   throw new Error('Cloud sync not available')
  }

  const client = supabase
  const userId = await CategoryService.getAuthenticatedUserId(expectedUserId)

  const { data, error } = await client
   .from('user_categories')
   .insert([{
    user_id: userId,
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

  return CategoryService.transformFromSupabase(data)
 }

 // 更新类别
 static async updateCategory(category: Category, expectedUserId?: string): Promise<Category> {
  if (!config.hasSupabaseConfig || !supabase) {
   throw new Error('Cloud sync not available')
  }

  const client = supabase
  const userId = await CategoryService.getAuthenticatedUserId(expectedUserId)

  const { data, error } = await scopeCategoryQueryToUserAndId(
   client
    .from('user_categories')
    .update({
     name: category.name,
     order: category.order,
     is_hidden: category.isHidden
    }),
   userId,
   category.id
  )
   .select()
   .single()

  if (error) {
   console.error('Error updating category:', error)
   throw error
  }

  return CategoryService.transformFromSupabase(data)
 }

 // 删除类别
 static async deleteCategory(categoryId: string, expectedUserId?: string): Promise<void> {
  if (!config.hasSupabaseConfig || !supabase) {
   throw new Error('Cloud sync not available')
  }

  const userId = await CategoryService.getAuthenticatedUserId(expectedUserId)

  const { error } = await scopeCategoryQueryToUserAndId(
   supabase
    .from('user_categories')
    .delete(),
   userId,
   categoryId
  )

  if (error) {
   console.error('Error deleting category:', error)
   throw error
  }
 }

 // 批量同步 - 下载模式（云端为准）
 static async syncCategories(localCategories: Category[], expectedUserId?: string): Promise<Category[]> {
  if (!config.hasSupabaseConfig || !supabase) {
   throw new Error('Cloud sync not available')
  }

  const cloudCategories = await CategoryService.getCategories(expectedUserId)

  console.log(`Category sync completed: ${cloudCategories.length} categories from cloud (authoritative)`)
  console.log(`Local data (${localCategories.length} items) will be replaced by cloud data`)

  return cloudCategories
 }

 static async reconcileCategories(localCategories: Category[], expectedUserId?: string): Promise<Category[]> {
  if (!config.hasSupabaseConfig || !supabase) {
   throw new Error('Cloud sync not available')
  }

  const userId = await CategoryService.getAuthenticatedUserId(expectedUserId)
  const cloudCategories = await CategoryService.getCategories(userId)
  const syncPlan = buildCategoryImportPlan(cloudCategories, localCategories)

  for (const categoryId of syncPlan.deleteIds) {
   await CategoryService.deleteCategory(categoryId, userId)
  }

  for (const category of syncPlan.update) {
   await CategoryService.updateCategory(category, userId)
  }

  for (const category of syncPlan.create) {
   await CategoryService.createCategory(category, userId)
  }

  return CategoryService.getCategories(userId)
 }

 // Legacy helper kept for compatibility. Prefer useCategorySync + reconcileCategories.
 static async uploadLocalCategories(categories: Category[], expectedUserId?: string): Promise<Category[]> {
  return CategoryService.reconcileCategories(categories, expectedUserId)
 }

 // 批量更新类别顺序
 static async updateCategoriesOrder(categories: Category[], expectedUserId?: string): Promise<void> {
  if (!config.hasSupabaseConfig || !supabase) {
   throw new Error('Cloud sync not available')
  }

  const client = supabase
  const userId = await CategoryService.getAuthenticatedUserId(expectedUserId)

  try {
   // 批量更新每个类别的 order 字段
   const updatePromises = categories.map(async (cat) => {
    const { error } = await scopeCategoryQueryToUserAndId(
     client
      .from('user_categories')
      .update({ order: cat.order }),
     userId,
     cat.id
    )

    if (error) {
     throw error
    }
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
