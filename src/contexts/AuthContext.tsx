import React, { createContext, useContext, useEffect, useState } from 'react'
import { User, Session, AuthError } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { UserProfile, UserProfileService } from '../services/userProfileService'
import { config } from '../lib/config'
import { setRememberMe, isRememberMeEnabled, clearRememberMe, shouldAttemptAutoRestore, refreshRememberMeTimestamp } from '../utils/rememberMe'

type OAuthProvider = 'github' | 'google'

interface AuthContextType {
 user: User | null
 userProfile: UserProfile | null
 session: Session | null
 loading: boolean
 signUp: (email: string, password: string, nickname?: string) => Promise<{ error: AuthError | null }>
 signIn: (email: string, password: string, rememberMe?: boolean) => Promise<{ error: AuthError | null }>
 signInWithOAuth: (provider: OAuthProvider) => Promise<{ error: AuthError | null }>
 signOut: () => Promise<void>
 refreshUserProfile: () => Promise<void>
 updateUserNickname: (nickname: string) => Promise<void>
 updateUserEmail: (newEmail: string) => Promise<{ error: AuthError | null }>
 updateUserPassword: (newPassword: string) => Promise<{ error: AuthError | null }>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
 const [user, setUser] = useState<User | null>(null)
 const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
 const [session, setSession] = useState<Session | null>(null)
 const [loading, setLoading] = useState(true)

 // 清理URL中的敏感认证参数
 const cleanUrlFromAuthParams = () => {
 if (typeof window !== 'undefined') {
 const url = new URL(window.location.href)
 const hasAuthParams = url.hash.includes('access_token') ||
 url.hash.includes('refresh_token') ||
 url.searchParams.has('code')

 if (hasAuthParams) {
 console.log('🔒 Cleaning sensitive auth parameters from URL for security')

 // 记录安全事件（不记录实际token值）
 const authParamsFound = []
 if (url.hash.includes('access_token')) authParamsFound.push('access_token')
 if (url.hash.includes('refresh_token')) authParamsFound.push('refresh_token')
 if (url.searchParams.has('code')) authParamsFound.push('code')

 console.log(`🔒 Security: Found and cleaning auth params: ${authParamsFound.join(', ')}`)

 // 清除hash中的认证参数
 if (url.hash.includes('access_token')) {
 url.hash = ''
 }
 // 清除查询参数中的认证相关参数
 url.searchParams.delete('code')
 url.searchParams.delete('state')

 // 使用replaceState避免在浏览器历史中留下包含token的URL
 window.history.replaceState({}, document.title, url.pathname + url.search)

 console.log('✅ Security: URL cleaned successfully')
 }
 }
 }

 // 安全检查函数
 const performSecurityChecks = (session: Session | null) => {
 if (session?.user) {
 // 检查session有效性
 const now = Math.floor(Date.now() / 1000)
 const expiresAt = session.expires_at || 0

 if (expiresAt < now) {
 console.warn('⚠️ Security: Session appears to be expired')
 return false
 }

 // 检查用户ID格式
 if (!session.user.id || session.user.id.length < 20) {
 console.warn('⚠️ Security: Invalid user ID format detected')
 return false
 }

 // 记录安全登录事件
 console.log(`🔒 Security: Valid session authenticated for user ${session.user.email}`)
 return true
 }
 return false
 }

 // 获取用户资料
 const fetchUserProfile = async (userId: string) => {
 try {
 let profile = await UserProfileService.getUserProfile(userId)

 // 如果没有找到资料，尝试创建一个默认资料
 if (!profile) {
 console.log('No profile found, creating default profile')
 try {
 profile = await UserProfileService.createUserProfile(userId, 'User')
 } catch (createError) {
 console.error('Failed to create default profile:', createError)
 // 即使创建失败，也设置一个null值，避免无限等待
 setUserProfile(null)
 return
 }
 }

 setUserProfile(profile)
 } catch (error) {
 console.error('Error fetching user profile:', error)
 setUserProfile(null)
 }
 }

 // 刷新用户资料
 const refreshUserProfile = async () => {
 if (user) {
 await fetchUserProfile(user.id)
 }
 }

 // 更新用户昵称
 const updateUserNickname = async (nickname: string) => {
 if (!user) {
 throw new Error('User not authenticated')
 }

 if (!nickname.trim()) {
 throw new Error('Nickname cannot be empty')
 }

 if (nickname.trim().length < 2 || nickname.trim().length > 30) {
 throw new Error('Nickname must be between 2 and 30 characters')
 }

 try {
 const updatedProfile = await UserProfileService.updateUserProfile(user.id, nickname.trim())
 setUserProfile(updatedProfile)
 } catch (error) {
 console.error('Error updating nickname:', error)
 throw error
 }
 }

 useEffect(() => {
 // 如果没有Supabase配置，直接设置为未登录状态
 if (!config.features.authentication || !supabase) {
 setLoading(false)
 return
 }

 // 添加超时保护，防止无限加载
 const loadingTimeout = setTimeout(() => {
 console.warn('Authentication initialization timeout, setting loading to false')
 setLoading(false)
 }, 2000) // 2秒超时，认证本身应该很快

 // 获取初始session
 const getSession = async () => {
 try {
 const { data: { session }, error } = await supabase.auth.getSession()

 if (error) {
 console.error('Error getting session:', error)
 // 如果获取session失败但用户选择了记住登录，尝试刷新token
 if (shouldAttemptAutoRestore()) {
 console.log('Attempting to refresh session for remembered user...')
 try {
 const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession()
 if (!refreshError && refreshData.session) {
 setSession(refreshData.session)
 setUser(refreshData.session.user)
 fetchUserProfile(refreshData.session.user.id).catch(profileError => {
 console.error('Error fetching user profile after refresh:', profileError)
 })
 return
 }
 } catch (refreshError) {
 console.error('Failed to refresh session:', refreshError)
 // 如果刷新失败，清除记住登录状态
 clearRememberMe()
 }
 }

 setSession(null)
 setUser(null)
 setUserProfile(null)
 } else {
 setSession(session)
 setUser(session?.user ?? null)

 // 如果有用户，异步获取用户资料并清理URL（不阻塞认证完成）
 if (session?.user) {
 cleanUrlFromAuthParams()
 // 异步获取用户资料，不阻塞认证流程
 fetchUserProfile(session.user.id).catch(profileError => {
 console.error('Error fetching user profile:', profileError)
 })
 }
 }
 } catch (error) {
 console.error('Unexpected error during session initialization:', error)
 setSession(null)
 setUser(null)
 setUserProfile(null)
 } finally {
 // 无论如何都要设置loading为false
 clearTimeout(loadingTimeout)
 setLoading(false)
 }
 }

 getSession()

 // 监听认证状态变化
 const { data: { subscription } } = supabase.auth.onAuthStateChange(
 async (event, session) => {
 console.log('Auth state changed:', event, session?.user?.email)

 try {
 // 在处理认证状态变化后立即清理URL
 if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
 cleanUrlFromAuthParams()
 // 刷新记住登录时间戳
 refreshRememberMeTimestamp()
 }

 // 执行安全检查
 const isSecure = performSecurityChecks(session)
 if (session?.user && !isSecure) {
 console.error('❌ Security: Session failed security checks, signing out')
 await supabase.auth.signOut()
 return
 }

 setSession(session)
 setUser(session?.user ?? null)

 if (session?.user) {
 // 用户登录，异步获取资料（不阻塞状态变化）
 fetchUserProfile(session.user.id).catch(profileError => {
 console.error('Error fetching user profile during auth state change:', profileError)
 })
 } else {
 // 用户登出，清空资料
 setUserProfile(null)
 }
 } catch (error) {
 console.error('Error during auth state change:', error)
 } finally {
 // 确保总是设置loading为false，但不清除超时，因为这是状态变化回调
 setLoading(false)
 }
 }
 )

 return () => {
 subscription.unsubscribe()
 clearTimeout(loadingTimeout)
 }
 }, [])

 const signUp = async (email: string, password: string, nickname?: string) => {
 if (!supabase) {
 throw new Error('Authentication not available')
 }
 const result = await supabase.auth.signUp({
 email,
 password,
 options: {
 emailRedirectTo: window.location.origin,
 data: {
 nickname: nickname || 'User'
 }
 }
 })
 return result
 }

 const signIn = async (email: string, password: string, rememberMe?: boolean) => {
 if (!supabase) {
 throw new Error('Authentication not available')
 }

 // 设置记住登录状态
 setRememberMe(rememberMe || false)

 const result = await supabase.auth.signInWithPassword({ email, password })
 return result
 }

 const signInWithOAuth = async (provider: OAuthProvider) => {
 if (!supabase) {
 throw new Error('Authentication not available')
 }

 const result = await supabase.auth.signInWithOAuth({
 provider,
 options: {
 redirectTo: window.location.origin
 }
 })
 return result
 }

 const signOut = async () => {
 if (!supabase) {
 throw new Error('Authentication not available')
 }

 // 检查是否是记住登录状态
 const rememberMeEnabled = isRememberMeEnabled()

 if (rememberMeEnabled) {
 // 如果是记住登录，只退出当前会话，但不清除存储的token
 await supabase.auth.signOut({ scope: 'local' })
 } else {
 // 如果不是记住登录，完全退出并清除所有信息
 await supabase.auth.signOut()
 clearRememberMe()
 }
 }

 const updateUserEmail = async (newEmail: string) => {
 if (!supabase) {
 throw new Error('Authentication not available')
 }

 if (!user) {
 throw new Error('User not authenticated')
 }

 const result = await supabase.auth.updateUser({
 email: newEmail
 })

 return result
 }

 const updateUserPassword = async (newPassword: string) => {
 if (!supabase) {
 throw new Error('Authentication not available')
 }

 if (!user) {
 throw new Error('User not authenticated')
 }

 const result = await supabase.auth.updateUser({
 password: newPassword
 })

 return result
 }

 return (
 <AuthContext.Provider value={{
 user,
 userProfile,
 session,
 loading,
 signUp,
 signIn,
 signInWithOAuth,
 signOut,
 refreshUserProfile,
 updateUserNickname,
 updateUserEmail,
 updateUserPassword
 }}>
 {children}
 </AuthContext.Provider>
 )
}

export const useAuth = () => {
 const context = useContext(AuthContext)
 if (context === undefined) {
 throw new Error('useAuth must be used within an AuthProvider')
 }
 return context
}