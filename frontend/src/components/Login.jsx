import { useState } from 'react'
import { useAuth } from '../contexts/useAuth'
import { Mail, Lock, User, ArrowRight, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'

export default function Login({ onClose }) {
  const [isLogin, setIsLogin] = useState(true)
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: ''
  })
  const { login, register } = useAuth()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      if (isLogin) {
        await login(formData.email, formData.password)
        toast.success('Login realizado com sucesso!')
      } else {
        if (formData.password.length < 6) {
          toast.error('A senha precisa ter pelo menos 6 caracteres')
          setLoading(false)
          return
        }
        await register(formData.name, formData.email, formData.password)
        toast.success('Conta criada com sucesso!')
      }
      onClose()
    } catch (err) {
      const message = err.response?.data?.error || err.message || 'Ocorreu um erro'
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.8)',
      backdropFilter: 'blur(10px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: 20
    }}>
      <div style={{
        background: 'linear-gradient(145deg, #1a1a2e 0%, #16213e 100%)',
        borderRadius: 24,
        padding: '40px 32px',
        width: '100%',
        maxWidth: 420,
        border: '1px solid rgba(99,102,241,0.2)',
        boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
        position: 'relative'
      }}>
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            background: 'transparent',
            border: 'none',
            color: '#64748b',
            cursor: 'pointer',
            padding: 8,
            borderRadius: 8,
            transition: 'all 0.2s'
          }}
          onMouseEnter={e => e.target.style.color = '#e2e8f0'}
          onMouseLeave={e => e.target.style.color = '#64748b'}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 64,
            height: 64,
            borderRadius: 20,
            background: 'linear-gradient(135deg, #6366f1, #a855f7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px',
            boxShadow: '0 10px 30px rgba(99,102,241,0.4)'
          }}>
            {isLogin ? <Lock size={28} color="white" /> : <User size={28} color="white" />}
          </div>
          <h2 style={{
            fontSize: '1.5rem',
            fontWeight: 700,
            marginBottom: 8,
            color: '#e2e8f0'
          }}>
            {isLogin ? 'Entrar' : 'Criar Conta'}
          </h2>
          <p style={{ color: '#64748b', fontSize: '0.9rem' }}>
            {isLogin ? 'Acesse sua conta para continuar' : 'Cadastre-se para começar a gerar apps'}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {!isLogin && (
            <div>
              <label style={{
                display: 'block',
                fontSize: '0.85rem',
                fontWeight: 500,
                color: '#94a3b8',
                marginBottom: 6
              }}>
                Nome completo
              </label>
              <div style={{ position: 'relative' }}>
                <User size={18} color="#64748b" style={{
                  position: 'absolute',
                  left: 14,
                  top: '50%',
                  transform: 'translateY(-50%)'
                }} />
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                placeholder="Seu nome"
                  required={!isLogin}
                  style={{
                    width: '100%',
                    padding: '14px 14px 14px 44px',
                    borderRadius: 12,
                    border: '1px solid rgba(99,102,241,0.2)',
                    background: 'rgba(0,0,0,0.3)',
                    color: '#e2e8f0',
                    fontSize: '0.95rem',
                    outline: 'none',
                    transition: 'all 0.2s'
                  }}
                  onFocus={e => e.target.style.borderColor = 'rgba(99,102,241,0.5)'}
                  onBlur={e => e.target.style.borderColor = 'rgba(99,102,241,0.2)'}
                />
              </div>
            </div>
          )}

          <div>
            <label style={{
              display: 'block',
              fontSize: '0.85rem',
              fontWeight: 500,
              color: '#94a3b8',
              marginBottom: 6
            }}>
              E-mail
            </label>
            <div style={{ position: 'relative' }}>
              <Mail size={18} color="#64748b" style={{
                position: 'absolute',
                left: 14,
                top: '50%',
                transform: 'translateY(-50%)'
              }} />
              <input
                type="email"
                value={formData.email}
                onChange={e => setFormData({ ...formData, email: e.target.value })}
                placeholder="you@example.com"
                required
                style={{
                  width: '100%',
                  padding: '14px 14px 14px 44px',
                  borderRadius: 12,
                  border: '1px solid rgba(99,102,241,0.2)',
                  background: 'rgba(0,0,0,0.3)',
                  color: '#e2e8f0',
                  fontSize: '0.95rem',
                  outline: 'none',
                  transition: 'all 0.2s'
                }}
                onFocus={e => e.target.style.borderColor = 'rgba(99,102,241,0.5)'}
                onBlur={e => e.target.style.borderColor = 'rgba(99,102,241,0.2)'}
              />
            </div>
          </div>

          <div>
            <label style={{
              display: 'block',
              fontSize: '0.85rem',
              fontWeight: 500,
              color: '#94a3b8',
              marginBottom: 6
            }}>
              Senha
            </label>
            <div style={{ position: 'relative' }}>
              <Lock size={18} color="#64748b" style={{
                position: 'absolute',
                left: 14,
                top: '50%',
                transform: 'translateY(-50%)'
              }} />
              <input
                type="password"
                value={formData.password}
                onChange={e => setFormData({ ...formData, password: e.target.value })}
                placeholder="••••••••"
                required
                minLength={6}
                style={{
                  width: '100%',
                  padding: '14px 14px 14px 44px',
                  borderRadius: 12,
                  border: '1px solid rgba(99,102,241,0.2)',
                  background: 'rgba(0,0,0,0.3)',
                  color: '#e2e8f0',
                  fontSize: '0.95rem',
                  outline: 'none',
                  transition: 'all 0.2s'
                }}
                onFocus={e => e.target.style.borderColor = 'rgba(99,102,241,0.5)'}
                onBlur={e => e.target.style.borderColor = 'rgba(99,102,241,0.2)'}
              />
            </div>
            {!isLogin && (
              <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 6 }}>
                Pelo menos 6 caracteres
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '16px',
              borderRadius: 12,
              border: 'none',
              background: 'linear-gradient(135deg, #6366f1, #a855f7)',
              color: 'white',
              fontWeight: 600,
              fontSize: '1rem',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              marginTop: 8,
              boxShadow: '0 10px 30px rgba(99,102,241,0.3)',
              transition: 'all 0.2s'
            }}
          >
            {loading ? (
              <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
            ) : (
              <>
                {isLogin ? 'Entrar' : 'Criar conta'}
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>

        {/* Toggle */}
        <div style={{
          textAlign: 'center',
          marginTop: 24,
          paddingTop: 24,
          borderTop: '1px solid rgba(255,255,255,0.1)'
        }}>
          <p style={{ color: '#64748b', fontSize: '0.9rem' }}>
            {isLogin ? 'Ainda nao tem conta?' : 'Ja tem uma conta?'}
            <button
              onClick={() => setIsLogin(!isLogin)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#818cf8',
                fontWeight: 600,
                cursor: 'pointer',
                marginLeft: 6,
                fontSize: '0.9rem'
              }}
            >
              {isLogin ? 'Criar conta' : 'Entrar'}
            </button>
          </p>
        </div>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
