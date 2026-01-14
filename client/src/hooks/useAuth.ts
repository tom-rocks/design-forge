import { useState, useEffect, useCallback } from 'react'
import { API_URL } from '../config'

export interface User {
  id: string
  email: string
  name: string | null
  avatarUrl: string | null
}

interface AuthState {
  loading: boolean
  authenticated: boolean
  user: User | null
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    loading: true,
    authenticated: false,
    user: null,
  })

  // Check authentication status
  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/auth/me`, {
        credentials: 'include',
      })
      const data = await res.json()
      
      setState({
        loading: false,
        authenticated: data.authenticated,
        user: data.user,
      })
    } catch (err) {
      console.error('Auth check failed:', err)
      setState({
        loading: false,
        authenticated: false,
        user: null,
      })
    }
  }, [])

  // Login with Google
  const login = useCallback(() => {
    window.location.href = `${API_URL}/api/auth/google`
  }, [])

  // Logout
  const logout = useCallback(async () => {
    try {
      await fetch(`${API_URL}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      })
      setState({
        loading: false,
        authenticated: false,
        user: null,
      })
    } catch (err) {
      console.error('Logout failed:', err)
    }
  }, [])

  // Check auth on mount and when URL changes (for OAuth callback)
  useEffect(() => {
    checkAuth()
    
    // Check if we just completed OAuth
    const params = new URLSearchParams(window.location.search)
    if (params.get('auth') === 'success' || params.get('auth') === 'failed') {
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [checkAuth])

  return {
    ...state,
    login,
    logout,
    refresh: checkAuth,
  }
}
