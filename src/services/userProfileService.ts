import { supabase } from '../lib/supabase'
import { config } from '../lib/config'
import { resolveUserProfileNickname } from '../utils/userProfile'

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
 if (!config.hasSupabaseConfig || !supabase) {
 return null
 }

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
 if (!config.hasSupabaseConfig || !supabase) {
 throw new Error('User profiles not available')
 }

 const normalizedNickname = resolveUserProfileNickname(nickname)

 const { data, error } = await supabase
 .from('user_profiles')
 .upsert({
 user_id: userId,
 nickname: normalizedNickname
 }, { onConflict: 'user_id' })
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
 if (!config.hasSupabaseConfig || !supabase) {
 throw new Error('User profiles not available')
 }

 return await this.createUserProfile(userId, nickname)
 }

 // 获取或创建用户资料
 static async getOrCreateUserProfile(userId: string, nickname?: string): Promise<UserProfile | null> {
 if (!config.hasSupabaseConfig || !supabase) {
 return null
 }

 try {
 // 首先尝试获取现有资料
 const profile = await this.getUserProfile(userId)
 if (profile) {
 return profile
 }

 // 如果没有资料且提供了昵称，则创建新资料
 return await this.createUserProfile(userId, nickname || resolveUserProfileNickname(undefined))
 } catch (error) {
 console.error('Error in getOrCreateUserProfile:', error)
 return null
 }
 }
}
