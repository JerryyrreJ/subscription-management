import { supabase } from '../lib/supabase'

export interface UserProfile {
  id: string
  user_id: string
  nickname: string
  created_at: string
  updated_at: string
}

export class UserProfileService {
  // 获取用户资料
  static async getUserProfile(userId: string): Promise<UserProfile | null> {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle() // 使用maybeSingle()而不是single()

      if (error) {
        console.error('Error fetching user profile:', error)
        throw error
      }

      return data
    } catch (error) {
      console.error('Error in getUserProfile:', error)
      return null
    }
  }

  // 创建用户资料
  static async createUserProfile(userId: string, nickname: string): Promise<UserProfile> {
    const { data, error } = await supabase
      .from('user_profiles')
      .insert([{
        user_id: userId,
        nickname: nickname
      }])
      .select()
      .single()

    if (error) {
      console.error('Error creating user profile:', error)
      throw error
    }

    return data
  }

  // 更新用户资料
  static async updateUserProfile(userId: string, nickname: string): Promise<UserProfile> {
    // 首先检查用户资料是否存在
    const existingProfile = await this.getUserProfile(userId)

    if (!existingProfile) {
      // 如果不存在，创建新的资料
      console.log('Profile does not exist, creating new profile')
      return await this.createUserProfile(userId, nickname)
    }

    // 如果存在，更新现有资料
    const { data, error } = await supabase
      .from('user_profiles')
      .update({ nickname })
      .eq('user_id', userId)
      .select()
      .maybeSingle()

    if (error) {
      console.error('Error updating user profile:', error)
      throw error
    }

    if (!data) {
      throw new Error('Profile update failed - no data returned')
    }

    return data
  }

  // 获取或创建用户资料
  static async getOrCreateUserProfile(userId: string, nickname?: string): Promise<UserProfile | null> {
    try {
      // 首先尝试获取现有资料
      const profile = await this.getUserProfile(userId)
      if (profile) {
        return profile
      }

      // 如果没有资料且提供了昵称，则创建新资料
      if (nickname) {
        return await this.createUserProfile(userId, nickname)
      }

      return null
    } catch (error) {
      console.error('Error in getOrCreateUserProfile:', error)
      return null
    }
  }
}