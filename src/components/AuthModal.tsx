import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { X, Mail, Lock, User, AlertCircle, CheckCircle, Github } from 'lucide-react'

interface AuthModalProps {
  isOpen: boolean
  onClose: () => void
}

export function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nickname, setNickname] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const { signIn, signUp, signInWithOAuth } = useAuth()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      if (isLogin) {
        const { error } = await signIn(email, password, rememberMe)
        if (error) throw error

        setSuccess('Login successful!')
        setTimeout(() => {
          onClose()
          resetForm()
        }, 1000)
      } else {
        const { error } = await signUp(email, password, nickname)
        if (error) throw error

        setSuccess('Sign up successful! Please check your email to confirm your account before logging in.')
        setTimeout(() => {
          setIsLogin(true)
          setSuccess('')
        }, 3000)
      }
    } catch (error: unknown) {
      console.error('Auth error:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)

      if (errorMessage.includes('Invalid login credentials')) {
        setError('Invalid email or password. Please check and try again.')
      } else if (errorMessage.includes('User already registered')) {
        setError('This email is already registered. Please login directly.')
      } else if (errorMessage.includes('Password should be at least 6 characters')) {
        setError('Password must be at least 6 characters.')
      } else {
        setError(errorMessage || 'Operation failed. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleOAuthLogin = async (provider: 'github' | 'google') => {
    setLoading(true)
    setError('')

    try {
      const { error } = await signInWithOAuth(provider)
      if (error) throw error
      // OAuth登录会跳转,所以不需要关闭模态框
    } catch (error: unknown) {
      console.error('OAuth login error:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      setError(errorMessage || `Failed to login with ${provider}. Please try again.`)
      setLoading(false)
    }
  }

  const resetForm = () => {
    setEmail('')
    setPassword('')
    setNickname('')
    setRememberMe(false)
    setError('')
    setSuccess('')
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  const switchMode = () => {
    setIsLogin(!isLogin)
    setError('')
    setSuccess('')
    setNickname('')
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center p-4 z-50 modal-overlay">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6 modal-content">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800 dark:text-white">
            {isLogin ? 'Login Account' : 'Create Account'}
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Nickname
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-5 h-5" />
                <input
                  type="text"
                  required
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors"
                  placeholder="Your display name"
                  disabled={loading}
                  minLength={2}
                  maxLength={30}
                />
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                This will be displayed instead of your email
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-5 h-5" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors"
                placeholder="your@email.com"
                disabled={loading}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-5 h-5" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors"
                placeholder="••••••••"
                minLength={6}
                disabled={loading}
              />
            </div>
            {!isLogin && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Password must be at least 6 characters
              </p>
            )}
          </div>

          {isLogin && (
            <div className="flex items-center">
              <input
                id="rememberMe"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
                disabled={loading}
              />
              <label htmlFor="rememberMe" className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
                Remember me (trust this device)
              </label>
            </div>
          )}

          {error && (
            <div className="flex items-center space-x-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="flex items-center space-x-2 text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 p-3 rounded-lg">
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
              <span>{success}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 px-4 rounded-lg transition-colors font-medium"
          >
            {loading ? (
              <div className="flex items-center justify-center space-x-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Processing...</span>
              </div>
            ) : (
              isLogin ? 'Login' : 'Sign Up'
            )}
          </button>
        </form>

        {isLogin && (
          <>
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300 dark:border-gray-600"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                  Or continue with
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleOAuthLogin('github')}
                disabled={loading}
                className="flex items-center justify-center px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Github className="w-5 h-5 mr-2" />
                <span className="text-sm font-medium">GitHub</span>
              </button>

              <button
                type="button"
                onClick={() => handleOAuthLogin('google')}
                disabled={loading}
                className="flex items-center justify-center px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                <span className="text-sm font-medium">Google</span>
              </button>
            </div>
          </>
        )}

        <div className="mt-6 text-center">
          <button
            onClick={switchMode}
            disabled={loading}
            className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 text-sm font-medium transition-colors"
          >
            {isLogin ? 'Don\'t have an account? Sign up' : 'Already have an account? Login'}
          </button>
        </div>

        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
            Sync your subscription data across multiple devices after login
          </p>
        </div>
      </div>
    </div>
  )
}