// 环境配置检测
export const config = {
  // 检测是否有Supabase配置
  hasSupabaseConfig: Boolean(
    import.meta.env.VITE_SUPABASE_URL &&
    import.meta.env.VITE_SUPABASE_ANON_KEY
  ),

  // Supabase配置
  supabase: {
    url: import.meta.env.VITE_SUPABASE_URL || '',
    anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || ''
  },

  // 功能开关
  features: {
    cloudSync: Boolean(
      import.meta.env.VITE_SUPABASE_URL &&
      import.meta.env.VITE_SUPABASE_ANON_KEY
    ),
    authentication: Boolean(
      import.meta.env.VITE_SUPABASE_URL &&
      import.meta.env.VITE_SUPABASE_ANON_KEY
    )
  }
}

// 开发环境下的调试信息
if (import.meta.env.DEV) {
  console.log('🔧 Environment Config:', {
    hasSupabaseConfig: config.hasSupabaseConfig,
    cloudSyncEnabled: config.features.cloudSync,
    authenticationEnabled: config.features.authentication
  })
}