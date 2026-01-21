import { useState, useEffect, useCallback, useRef } from 'react'
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
  
  const popupRef = useRef<Window | null>(null)

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

  // Login with Google - use popup to handle third-party cookie issues
  const login = useCallback(() => {
    // If we're not in an iframe, use direct navigation
    const isInIframe = window.self !== window.top
    
    if (!isInIframe) {
      window.location.href = `${API_URL}/api/auth/google`
      return
    }
    
    // In iframe: use popup window for OAuth (avoids third-party cookie issues)
    const width = 500
    const height = 600
    const left = window.screenX + (window.outerWidth - width) / 2
    const top = window.screenY + (window.outerHeight - height) / 2
    
    popupRef.current = window.open(
      `${API_URL}/api/auth/google?popup=true`,
      'Design Forge Login',
      `width=${width},height=${height},left=${left},top=${top},popup=yes`
    )
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
    
    // Check if we just completed OAuth (direct navigation)
    const params = new URLSearchParams(window.location.search)
    if (params.get('auth') === 'success' || params.get('auth') === 'failed') {
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [checkAuth])
  
  // Listen for popup auth completion
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      console.log('[Auth] Received message:', event.data, 'from:', event.origin)
      
      if (event.data?.type === 'auth-complete') {
        console.log('[Auth] Auth complete message received')
        
        // Close popup if still open
        popupRef.current?.close()
        popupRef.current = null
        
        // If user data is included, use it directly (avoids third-party cookie issues)
        if (event.data.user) {
          console.log('[Auth] Using user data from popup:', event.data.user)
          setState({
            loading: false,
            authenticated: true,
            user: event.data.user,
          })
        } else {
          // Fallback to checking auth (may not work in iframe due to cookies)
          checkAuth()
        }
      }
    }
    
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [checkAuth])

  return {
    ...state,
    login,
    logout,
    refresh: checkAuth,
  }
}
