// 环境配置检测
export const config = {
  // 检测是否有Supabase配置
  hasSupabaseConfig: Boolean(
    import.meta.env.VITE_SUPABASE_URL &&
    import.meta.env.VITE_SUPABASE_ANON_KEY
  ),

  // 检测是否有Stripe配置
  hasStripeConfig: Boolean(
    import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY &&
    import.meta.env.VITE_STRIPE_PRICE_ID
  ),

  // Supabase配置
  supabase: {
    url: import.meta.env.VITE_SUPABASE_URL || '',
    anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || ''
  },

  // Stripe配置
  stripe: {
    publishableKey: import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '',
    priceId: import.meta.env.VITE_STRIPE_PRICE_ID || ''
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
    ),
    payment: Boolean(
      import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY &&
      import.meta.env.VITE_STRIPE_PRICE_ID
    )
  }
}

// 开发环境下的调试信息
if (import.meta.env.DEV) {
  console.log('🔧 Environment Config:', {
    hasSupabaseConfig: config.hasSupabaseConfig,
    hasStripeConfig: config.hasStripeConfig,
    cloudSyncEnabled: config.features.cloudSync,
    authenticationEnabled: config.features.authentication,
    paymentEnabled: config.features.payment
  })
}