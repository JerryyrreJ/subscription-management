import React, { createContext, useContext, useEffect, useState } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { UserProfile, UserProfileService } from '../services/userProfileService'

interface AuthContextType {
  user: User | null
  userProfile: UserProfile | null
  session: Session | null
  loading: boolean
  signUp: (email: string, password: string, nickname?: string) => Promise<any>
  signIn: (email: string, password: string) => Promise<any>
  signOut: () => Promise<void>
  refreshUserProfile: () => Promise<void>
  updateUserNickname: (nickname: string) => Promise<void>
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
    // 获取初始session
    const getSession = async () => {
      const { data: { session }, error } = await supabase.auth.getSession()
      if (error) {
        console.error('Error getting session:', error)
      } else {
        setSession(session)
        setUser(session?.user ?? null)

        // 如果有用户，获取用户资料并清理URL
        if (session?.user) {
          await fetchUserProfile(session.user.id)
          cleanUrlFromAuthParams()
        }
      }
      setLoading(false)
    }

    getSession()

    // 监听认证状态变化
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth state changed:', event, session?.user?.email)

        // 在处理认证状态变化后立即清理URL
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          cleanUrlFromAuthParams()
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
          // 用户登录，获取资料
          await fetchUserProfile(session.user.id)
        } else {
          // 用户登出，清空资料
          setUserProfile(null)
        }

        setLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const signUp = async (email: string, password: string, nickname?: string) => {
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

  const signIn = async (email: string, password: string) => {
    const result = await supabase.auth.signInWithPassword({ email, password })
    return result
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{
      user,
      userProfile,
      session,
      loading,
      signUp,
      signIn,
      signOut,
      refreshUserProfile,
      updateUserNickname
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