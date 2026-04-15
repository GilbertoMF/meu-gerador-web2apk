import { useState, useEffect } from 'react'
import axios from 'axios'
import { API_URL } from '../config'
import { AuthContext } from './auth-context'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(localStorage.getItem('web2apk_token'))
  const [loading, setLoading] = useState(true)

  // Configure axios with token
  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
    } else {
      delete axios.defaults.headers.common['Authorization']
    }
  }, [token])

  // Check if user is logged in on mount
  useEffect(() => {
    const checkAuth = async () => {
      const storedToken = localStorage.getItem('web2apk_token')
      if (storedToken) {
        try {
          axios.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`
          const res = await axios.get(`${API_URL}/auth/me`)
          setUser(res.data.user)
          setToken(storedToken)
        } catch {
          // Token invalid or expired
          localStorage.removeItem('web2apk_token')
          setToken(null)
          setUser(null)
        }
      }
      setLoading(false)
    }
    checkAuth()
  }, [])

  const login = async (email, password) => {
    const res = await axios.post(`${API_URL}/auth/login`, { email, password })
    const { user, token } = res.data
    localStorage.setItem('web2apk_token', token)
    setToken(token)
    setUser(user)
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
    return user
  }

  const register = async (name, email, password) => {
    const res = await axios.post(`${API_URL}/auth/register`, { name, email, password })
    const { user, token } = res.data
    localStorage.setItem('web2apk_token', token)
    setToken(token)
    setUser(user)
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
    return user
  }

  const logout = () => {
    localStorage.removeItem('web2apk_token')
    setToken(null)
    setUser(null)
    delete axios.defaults.headers.common['Authorization']
  }

  const value = {
    user,
    token,
    loading,
    isAuthenticated: !!user,
    login,
    register,
    logout
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}
