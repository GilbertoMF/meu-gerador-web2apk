import { createContext, useContext, useState, useEffect } from 'react'
import axios from 'axios'

const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:3001'
  : 'https://appforge-api-xodz.onrender.com'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(localStorage.getItem('appforge_token'))
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
      const storedToken = localStorage.getItem('appforge_token')
      if (storedToken) {
        try {
          axios.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`
          const res = await axios.get(`${API_URL}/auth/me`)
          setUser(res.data.user)
          setToken(storedToken)
        } catch (err) {
          // Token invalid or expired
          localStorage.removeItem('appforge_token')
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
    localStorage.setItem('appforge_token', token)
    setToken(token)
    setUser(user)
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
    return user
  }

  const register = async (name, email, password) => {
    const res = await axios.post(`${API_URL}/auth/register`, { name, email, password })
    const { user, token } = res.data
    localStorage.setItem('appforge_token', token)
    setToken(token)
    setUser(user)
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
    return user
  }

  const logout = () => {
    localStorage.removeItem('appforge_token')
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

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
