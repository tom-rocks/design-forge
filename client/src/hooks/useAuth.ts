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

  const login = useCallback(async (password?: string) => {
    const pw = password || window.prompt('Enter access code:')
    if (!pw) return false
    
    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password: pw }),
      })
      
      if (!res.ok) return false
      
      const data = await res.json()
      setState({
        loading: false,
        authenticated: data.authenticated,
        user: data.user,
      })
      return true
    } catch (err) {
      console.error('Login failed:', err)
      return false
    }
  }, [])

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

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  return {
    ...state,
    login,
    logout,
    refresh: checkAuth,
  }
}
