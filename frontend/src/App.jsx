import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Smartphone, Globe, Upload, Download, Zap, Shield, ArrowRight,
  Loader2, Package, Star, X, Code2, Link, CheckCircle2, Circle,
  AlertCircle, Clock, FolderOpen, FileText, Terminal, ChevronDown,
  ChevronUp, Cpu, FilePlus, FileEdit, Copy, GitBranch, ArrowUpRight,
  User, LogOut, History, Calendar, Search
} from 'lucide-react'
import axios from 'axios'
import toast, { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Login from './components/Login'

const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:3001'
  : 'https://web2apk-api.onrender.com'
const STEPS = ['Conteúdo', 'Info do App', 'Ícone', 'Gerar']
const PHASE_NAMES = [
  'Copiar template',
  'Salvar HTML',
  'Configurar arquivos',
  'Compilar com Gradle',
  'Empacotar APK',
]

// ─── Helpers ─────────────────────────────────────────────────────────────────
const formatTime = (s) => {
  const m = Math.floor(s / 60).toString().padStart(2, '0')
  const sec = (s % 60).toString().padStart(2, '0')
  return `${m}:${sec}`
}

const formatSize = (bytes) => {
  if (!bytes) return ''
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024).toFixed(0)} KB`
}

const formatDuration = (ms) => {
  if (!ms) return ''
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function ModeToggle({ mode, onChange }) {
  return (
    <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: 14, padding: 4, gap: 4, border: '1px solid var(--border)' }}>
      {[{ id: 'url', label: 'URL do Site', icon: <Link size={15} /> }, { id: 'html', label: 'Código HTML', icon: <Code2 size={15} /> }].map(opt => (
        <button key={opt.id} id={`mode-${opt.id}`} onClick={() => onChange(opt.id)} style={{
          flex: 1, padding: '10px 16px', borderRadius: 10, border: 'none', cursor: 'pointer',
          fontFamily: 'Outfit, sans-serif', fontWeight: 600, fontSize: '0.88rem',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
          transition: 'all 0.25s ease',
          background: mode === opt.id ? 'linear-gradient(135deg, #6366f1, #a855f7)' : 'transparent',
          color: mode === opt.id ? 'white' : 'var(--text-secondary)',
          boxShadow: mode === opt.id ? '0 4px 20px rgba(99,102,241,0.4)' : 'none',
        }}>{opt.icon} {opt.label}</button>
      ))}
    </div>
  )
}

function HtmlEditor({ value, onChange }) {
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ position: 'absolute', top: 12, right: 14, display: 'flex', gap: 6, zIndex: 2 }}>
        {['#ef4444', '#f59e0b', '#22c55e'].map(c => <div key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c }} />)}
      </div>
      <textarea id="html-editor" value={value} onChange={e => onChange(e.target.value)}
        placeholder={`<!DOCTYPE html>\n<html lang="pt-BR">\n<head>\n  <meta charset="UTF-8" />\n  <title>Meu App</title>\n</head>\n<body>\n  <h1>Olá mundo! 🚀</h1>\n</body>\n</html>`}
        style={{
          width: '100%', minHeight: 240, background: 'rgba(0,0,0,0.5)',
          border: '1px solid rgba(99,102,241,0.3)', borderRadius: 14,
          color: '#e2e8f0', fontFamily: '"Courier New", monospace', fontSize: '0.82rem',
          lineHeight: 1.7, padding: '40px 16px 24px', outline: 'none', resize: 'vertical',
        }}
        onFocus={e => { e.target.style.borderColor = 'rgba(99,102,241,0.7)' }}
        onBlur={e => { e.target.style.borderColor = 'rgba(99,102,241,0.3)' }}
        spellCheck={false} autoCorrect="off" autoCapitalize="off"
      />
      <div style={{ position: 'absolute', bottom: 10, right: 14, fontSize: '0.72rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
        {value.length} chars
      </div>
    </div>
  )
}

// ─── Build Console ────────────────────────────────────────────────────────────
const LOG_COLORS = {
  info: '#94a3b8', detail: '#64748b', task: '#818cf8',
  warn: '#f59e0b', error: '#ef4444', success: '#22c55e',
}

const FILE_ICONS = {
  create: { icon: <FilePlus size={13} />, color: '#22c55e', label: 'novo' },
  modify: { icon: <FileEdit size={13} />, color: '#818cf8', label: 'editado' },
  copy: { icon: <Copy size={13} />, color: '#64748b', label: 'cópia' },
}

const PHASE_ICONS = {
  pending: <Circle size={16} color="#475569" />,
  running: <Loader2 size={16} color="#818cf8" style={{ animation: 'spin 1s linear infinite' }} />,
  done: <CheckCircle2 size={16} color="#22c55e" />,
  skip: <Circle size={16} color="#334155" />,
}

function BuildConsole({ jobId, appName, onComplete, onError }) {
  const [elapsed, setElapsed] = useState(0)
  const [phases, setPhases] = useState(
    PHASE_NAMES.map((name, i) => ({ step: i + 1, name, status: 'pending', duration: null }))
  )
  const [files, setFiles] = useState([])
  const [logs, setLogs] = useState([])
  const [progress, setProgress] = useState(0)
  const [activeTab, setActiveTab] = useState('overview')
  const [consoleOpen, setConsoleOpen] = useState(true)
  const [done, setDone] = useState(false)
  const [apkInfo, setApkInfo] = useState(null)
  const [cloudInfo, setCloudInfo] = useState({ active: false, url: '' })
  const logsEndRef = useRef()
  const timerRef = useRef()

  useEffect(() => {
    timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000)
    return () => clearInterval(timerRef.current)
  }, [])

  useEffect(() => {
    if (!jobId) return
    const sse = new EventSource(`${API_URL}/build-events/${jobId}`)

    sse.onmessage = (e) => {
      const ev = JSON.parse(e.data)
      switch (ev.type) {
        case 'phase':
          setPhases(prev => prev.map(p => p.step === ev.step ? { ...p, status: 'running' } : p))
          // mark previous running phases as done if starting a new one
          setPhases(prev => prev.map(p => p.step < ev.step && p.status === 'running' ? { ...p, status: 'done' } : p))
          break
        case 'phase_done':
          setPhases(prev => prev.map(p => p.step === ev.step ? { ...p, status: 'done', duration: ev.duration } : p))
          break
        case 'phase_skip':
          setPhases(prev => prev.map(p => p.step === ev.step ? { ...p, status: 'skip' } : p))
          break
        case 'file':
          setFiles(prev => [...prev.slice(-60), { path: ev.path, action: ev.action, ts: Date.now() }])
          break
        case 'log':
          setLogs(prev => [...prev.slice(-300), { text: ev.text, level: ev.level, ts: Date.now() }])
          break
        case 'progress':
          setProgress(ev.value)
          break
        case 'done':
          clearInterval(timerRef.current)
          setProgress(100)
          setDone(true)
          setApkInfo({ size: ev.apkSize, name: ev.apkName })
          onComplete(`${API_URL}${ev.downloadUrl}`, ev.appName, ev.apkSize)
          setPhases(prev => prev.map(p => p.status !== 'skip' ? { ...p, status: 'done' } : p))
          sse.close()
          break
        case 'error':
          clearInterval(timerRef.current)
          setPhases(prev => prev.map(p => p.status === 'running' ? { ...p, status: 'error' } : p))
          onError(ev.message)
          sse.close()
          break
      }
    }

    sse.onerror = () => {
      sse.close()
    }

    return () => sse.close()
  }, [jobId])

  useEffect(() => {
    if (activeTab === 'logs' && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, activeTab])

  const tabs = [
    { id: 'overview', label: 'Visão Geral', icon: <Cpu size={14} /> },
    { id: 'files', label: `Arquivos (${files.length})`, icon: <FolderOpen size={14} /> },
    { id: 'logs', label: 'Log Gradle', icon: <Terminal size={14} /> },
  ]

  return (
    <div style={{ marginTop: 20, border: '1px solid rgba(99,102,241,0.2)', borderRadius: 16, overflow: 'hidden', background: 'rgba(0,0,0,0.5)' }}>
      {/* Console Header */}
      <div
        onClick={() => setConsoleOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', cursor: 'pointer',
          background: 'rgba(99,102,241,0.08)',
          borderBottom: consoleOpen ? '1px solid rgba(99,102,241,0.15)' : 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Terminal size={16} color="#818cf8" />
          <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#e2e8f0' }}>Build Console</span>
          {!done && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', animation: 'pulse-ring 1.5s infinite', position: 'relative' }}>
            <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'rgba(34,197,94,0.4)', animation: 'pulse-ring 1.5s infinite' }} />
          </div>}
          {done && <span style={{ fontSize: '0.75rem', color: '#22c55e', fontWeight: 600 }}>✅ Concluído</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: '4px 10px' }}>
            <Clock size={13} color="#818cf8" />
            <span style={{ fontFamily: 'monospace', fontSize: '0.9rem', color: '#818cf8', fontWeight: 700, letterSpacing: 2 }}>
              {formatTime(elapsed)}
            </span>
          </div>
          {consoleOpen ? <ChevronUp size={16} color="#64748b" /> : <ChevronDown size={16} color="#64748b" />}
        </div>
      </div>

      {consoleOpen && (
        <>
          {/* Progress bar */}
          <div style={{ height: 3, background: 'rgba(255,255,255,0.05)' }}>
            <div style={{
              height: '100%',
              background: done ? '#22c55e' : 'linear-gradient(90deg, #6366f1, #a855f7, #22d3ee)',
              backgroundSize: '200% 100%',
              animation: done ? 'none' : 'shimmer 1.5s infinite linear',
              width: `${progress}%`,
              transition: 'width 0.6s ease',
            }} />
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '0 12px' }}>
            {tabs.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                padding: '10px 14px', border: 'none', background: 'transparent',
                cursor: 'pointer', fontFamily: 'Outfit, sans-serif', fontWeight: 500,
                fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6,
                color: activeTab === tab.id ? '#818cf8' : '#64748b',
                borderBottom: activeTab === tab.id ? '2px solid #6366f1' : '2px solid transparent',
                transition: 'all 0.2s',
              }}>
                {tab.icon} {tab.label}
              </button>
            ))}
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', paddingRight: 4 }}>
              <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#475569' }}>
                {progress.toFixed(0)}%
              </span>
            </div>
          </div>

          {/* Tab content */}
          <div style={{ maxHeight: 320, overflowY: 'auto', overflowX: 'hidden' }}>

            {/* OVERVIEW: Phase list */}
            {activeTab === 'overview' && (
              <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {phases.map(ph => (
                  <div key={ph.step} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                    borderRadius: 10, background: ph.status === 'running'
                      ? 'rgba(99,102,241,0.1)' : ph.status === 'done'
                      ? 'rgba(34,197,94,0.05)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${ph.status === 'running' ? 'rgba(99,102,241,0.3)' : ph.status === 'done' ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.05)'}`,
                    transition: 'all 0.3s ease',
                  }}>
                    <div style={{ flexShrink: 0 }}>
                      {ph.status === 'error'
                        ? <AlertCircle size={16} color="#ef4444" />
                        : PHASE_ICONS[ph.status] || PHASE_ICONS.pending}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{
                          fontSize: '0.85rem', fontWeight: ph.status === 'running' ? 600 : 500,
                          color: ph.status === 'done' ? '#94a3b8' : ph.status === 'running' ? '#e2e8f0' : '#475569',
                        }}>
                          {`${ph.step}. ${ph.name}`}
                          {ph.status === 'skip' && <span style={{ fontSize: '0.7rem', color: '#334155', marginLeft: 8 }}>(pulado)</span>}
                        </span>
                        {ph.duration && (
                          <span style={{ fontSize: '0.75rem', color: '#475569', fontFamily: 'monospace', flexShrink: 0, marginLeft: 8 }}>
                            {formatDuration(ph.duration)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {/* APK info when done */}
                {done && apkInfo && (
                  <div style={{
                    marginTop: 4, padding: '10px 14px', borderRadius: 10,
                    background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)',
                    display: 'flex', alignItems: 'center', gap: 10,
                  }}>
                    <Package size={16} color="#22c55e" />
                    <span style={{ fontSize: '0.85rem', color: '#4ade80' }}>
                      {apkInfo.name} ({formatSize(apkInfo.size)})
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* FILES: File tree */}
            {activeTab === 'files' && (
              <div style={{ padding: '8px 0', fontFamily: 'monospace' }}>
                {files.length === 0 ? (
                  <p style={{ textAlign: 'center', color: '#475569', padding: 20, fontSize: '0.85rem' }}>Aguardando arquivos...</p>
                ) : (
                  files.map((f, i) => {
                    const fi = FILE_ICONS[f.action] || FILE_ICONS.copy
                    const isDir = f.path.endsWith('/')
                    const depth = (f.path.match(/\//g) || []).length - (isDir ? 1 : 0)
                    const name = f.path.split('/').filter(Boolean).pop() + (isDir ? '/' : '')
                    return (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '3px 16px', paddingLeft: `${16 + Math.min(depth, 5) * 14}px`,
                        borderBottom: '1px solid rgba(255,255,255,0.02)',
                        animation: 'fadeInUp 0.2s ease forwards',
                      }}>
                        {isDir
                          ? <FolderOpen size={13} color="#f59e0b" />
                          : <FileText size={13} color="#64748b" />}
                        <span style={{ fontSize: '0.8rem', color: '#94a3b8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {name}
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: fi.color, fontSize: '0.72rem', flexShrink: 0 }}>
                          {fi.icon} {fi.label}
                        </span>
                      </div>
                    )
                  })
                )}
              </div>
            )}

            {/* LOGS: Terminal */}
            {activeTab === 'logs' && (
              <div style={{ padding: '12px 16px', fontFamily: 'monospace' }}>
                {logs.length === 0 ? (
                  <p style={{ color: '#475569', fontSize: '0.85rem' }}>Aguardando log do Gradle...</p>
                ) : (
                  logs.map((l, i) => (
                    <div key={i} style={{
                      fontSize: '0.78rem', lineHeight: 1.7,
                      color: LOG_COLORS[l.level] || '#94a3b8',
                      wordBreak: 'break-all',
                      background: l.level === 'error' ? 'rgba(239,68,68,0.06)' : l.level === 'success' ? 'rgba(34,197,94,0.06)' : 'transparent',
                      padding: '1px 4px', borderRadius: 4,
                    }}>
                      {l.level === 'task' && <span style={{ color: '#6366f1', marginRight: 4 }}>▶</span>}
                      {l.level === 'success' && <span style={{ marginRight: 4 }}>✅</span>}
                      {l.level === 'error' && <span style={{ marginRight: 4 }}>❌</span>}
                      {l.level === 'warn' && <span style={{ marginRight: 4 }}>⚠️</span>}
                      {l.text}
                    </div>
                  ))
                )}
                <div ref={logsEndRef} />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ─── StepIndicator ────────────────────────────────────────────────────────────
function StepIndicator({ current }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
      {STEPS.map((_, i) => (
        <div key={i} className={`step-dot ${i === current ? 'active' : ''} ${i < current ? 'done' : ''}`} />
      ))}
    </div>
  )
}

function FeatureCard({ icon, title, desc, color }) {
  return (
    <div className="glass-card-sm" style={{ padding: '20px', display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
      <div className="feature-icon" style={{ background: color, flexShrink: 0 }}>{icon}</div>
      <div>
        <p style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: 4 }}>{title}</p>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.5 }}>{desc}</p>
      </div>
    </div>
  )
}

// ─── History View ─────────────────────────────────────────────────────────────
function HistoryView({ API_URL, onRebuild }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await axios.get(`${API_URL}/history`)
        setItems(res.data)
      } catch (err) {
        toast.error('Erro ao buscar histórico')
      } finally {
        setLoading(false)
      }
    }
    fetchHistory()
  }, [API_URL])

  if (loading) return (
    <div style={{ padding: '60px 0', textAlign: 'center' }}>
      <Loader2 className="spin" size={32} color="#6366f1" />
      <p style={{ marginTop: 12, color: 'var(--text-secondary)' }}>Carregando seu histórico...</p>
    </div>
  )

  if (items.length === 0) return (
    <div className="glass-card" style={{ padding: '60px 24px', textAlign: 'center' }}>
      <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(99,102,241,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
        <History size={32} color="#6366f1" />
      </div>
      <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: 8 }}>Nenhum app encontrado</h3>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', maxWidth: 300, margin: '0 auto' }}>
        Seus apps e análises aparecerão aqui assim que você começar a criar.
      </p>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {items.map(item => (
        <div key={item.id} className="glass-card-sm fade-in-up" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ 
              width: 44, height: 44, borderRadius: 12, 
              background: item.type === 'decompile' ? 'linear-gradient(135deg, #ec4899, #f43f5e)' : 'linear-gradient(135deg, #6366f1, #a855f7)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
            }}>
              {item.type === 'decompile' ? <Search size={20} color="white" /> : <Smartphone size={20} color="white" />}
            </div>
            <div>
              <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 2 }}>{item.appName}</h4>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Calendar size={12} /> {new Date(item.createdAt).toLocaleDateString('pt-BR')}
                </span>
                <span className={`status-badge ${item.status}`} style={{ fontSize: '0.7rem' }}>
                  {item.status === 'done' ? 'Concluído' : item.status === 'error' ? 'Erro' : 'Processando'}
                </span>
              </div>
            </div>
          </div>
          
          {item.status === 'done' && item.downloadUrl && (
            <a href={`${API_URL}${item.downloadUrl}`} className="btn-primary" style={{ padding: '8px 16px', fontSize: '0.8rem', borderRadius: 8, textDecoration: 'none' }}>
              <Download size={14} /> Baixar
            </a>
          )}
        </div>
      ))}
    </div>
  )
}
function AppContent() {
  const { user, logout, isAuthenticated, loading: authLoading } = useAuth()
  const [showLogin, setShowLogin] = useState(false)
  const [step, setStep] = useState(0)
  const [inputMode, setInputMode] = useState('url')
  const [url, setUrl] = useState('')
  const [htmlCode, setHtmlCode] = useState('')
  const [appName, setAppName] = useState('')
  const [packageName, setPackageName] = useState('')
  const [iconFile, setIconFile] = useState(null)
  const [iconPreview, setIconPreview] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef()

  // Build state
  const [jobId, setJobId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [downloadLink, setDownloadLink] = useState(null)
  const [downloadAppName, setDownloadAppName] = useState('')
  const [downloadSize, setDownloadSize] = useState(0)
  const [buildError, setBuildError] = useState(null)

  // Decompile state
  const [mainTab, setMainTab] = useState('build') // 'build' | 'decompile'
  const [decompileFile, setDecompileFile] = useState(null)
  const [decompileJobId, setDecompileJobId] = useState(null)
  const [decompileError, setDecompileError] = useState(null)
  const [decompileZipLink, setDecompileZipLink] = useState(null)
  const [decompileLoading, setDecompileLoading] = useState(false)

  const isValidUrl = (s) => { try { new URL(s); return true } catch { return false } }
  const isStep0Valid = inputMode === 'url' ? (url.trim() && isValidUrl(url)) : htmlCode.trim().length >= 10

  const handleIcon = (file) => {
    if (!file || !file.type.startsWith('image/')) { toast.error('Por favor, envie uma imagem.'); return }
    setIconFile(file)
    const r = new FileReader()
    r.onload = (e) => setIconPreview(e.target.result)
    r.readAsDataURL(file)
  }

  const handleBuild = async () => {
    setLoading(true)
    setDownloadLink(null)
    setBuildError(null)
    setJobId(null)

    try {
      const formData = new FormData()
      formData.append('appName', appName)
      formData.append('packageName', packageName || `com.app.${appName.toLowerCase().replace(/\s+/g, '')}`)
      formData.append('mode', inputMode)
      if (inputMode === 'url') formData.append('url', url)
      else formData.append('htmlContent', htmlCode)
      if (iconFile) formData.append('icon', iconFile)

      const res = await axios.post(`${API_URL}/build`, formData, { timeout: 120000 })
      setJobId(res.data.jobId)
    } catch (err) {
      setLoading(false)
      const msg = err.response?.data?.error 
        || err.message 
        || 'Erro ao iniciar build.'
      console.error('Build error:', err)
      toast.error(msg, { duration: 6000 })
    }
  }

  const handleBuildComplete = useCallback((link, name, size) => {
    setDownloadLink(link)
    setDownloadAppName(name)
    setDownloadSize(size)
    setLoading(false)
    toast.success('APK pronto!')
  }, [])

  const handleBuildError = useCallback((msg) => {
    setBuildError(msg)
    setLoading(false)
    toast.error(msg.split('\n')[0])
  }, [])

  const reset = () => {
    setStep(0); setUrl(''); setHtmlCode(''); setAppName(''); setPackageName('')
    setIconFile(null); setIconPreview(null); setLoading(false)
    setDownloadLink(null); setJobId(null); setBuildError(null); setInputMode('url')
    setDecompileFile(null); setDecompileJobId(null); setDecompileError(null); setDecompileZipLink(null); setDecompileLoading(false)
  }

  const handleDecompile = async (file) => {
    if (!file) return
    setDecompileLoading(true)
    setDecompileError(null)
    setDecompileZipLink(null)
    setDecompileJobId(null)

    try {
      const formData = new FormData()
      formData.append('apk', file)
      const res = await axios.post(`${API_URL}/decompile`, formData, { timeout: 120000 })
      setDecompileJobId(res.data.jobId)
    } catch (err) {
      setDecompileLoading(false)
      toast.error('Erro ao iniciar descompilação.')
    }
  }

  // ── Steps ──────────────────────────────────────────────────────────────────

  const Step0 = (
    <div className="fade-in-up" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ textAlign: 'center' }}>
        <div className="float-anim" style={{ display: 'inline-block', marginBottom: 16 }}>
          <div style={{
            width: 80, height: 80, borderRadius: 24, margin: '0 auto',
            background: inputMode === 'url' ? 'linear-gradient(135deg, #6366f1, #a855f7)' : 'linear-gradient(135deg, #0ea5e9, #6366f1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 20px 60px rgba(99,102,241,0.4)', transition: 'background 0.4s',
          }}>
            {inputMode === 'url' ? <Globe size={40} color="white" /> : <Code2 size={40} color="white" />}
          </div>
        </div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: 8 }}>
          {inputMode === 'url' ? 'URL do seu site' : 'Seu código HTML'}
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          {inputMode === 'url' ? 'Cole o endereço completo do site que virará um app' : 'Cole ou escreva o código HTML da sua página'}
        </p>
      </div>

      <ModeToggle mode={inputMode} onChange={setInputMode} />

      {inputMode === 'url' ? (
        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8 }}>Endereço do site (URL)</label>
          <input id="url-input" className="input-field" type="url" placeholder="https://meusite.com" value={url} onChange={e => setUrl(e.target.value)} inputMode="url" />
          {url && !isValidUrl(url) && <p style={{ color: 'var(--error)', fontSize: '0.8rem', marginTop: 6 }}>URL inválida. Inclua https://</p>}
        </div>
      ) : (
        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8 }}>Código HTML</label>
          <HtmlEditor value={htmlCode} onChange={setHtmlCode} />
          <div className="glass-card-sm" style={{ padding: '10px 14px', marginTop: 10, display: 'flex', gap: 8 }}>
            <span>💡</span>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', lineHeight: 1.5 }}>
              HTML salvo <strong style={{ color: 'var(--text-primary)' }}>dentro do APK</strong> — funciona <strong style={{ color: 'var(--text-primary)' }}>sem internet</strong>.
            </p>
          </div>
        </div>
      )}

      <button id="next-step-0" className="btn-primary" style={{ padding: '16px', width: '100%' }}
        onClick={() => setStep(1)} disabled={!isStep0Valid}>
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>Próximo <ArrowRight size={18} /></span>
      </button>
    </div>
  )

  const Step1 = (
    <div className="fade-in-up" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ textAlign: 'center' }}>
        <div className="float-anim" style={{ display: 'inline-block', marginBottom: 16 }}>
          <div style={{ width: 80, height: 80, borderRadius: 24, background: 'linear-gradient(135deg, #a855f7, #22d3ee)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', boxShadow: '0 20px 60px rgba(168,85,247,0.4)' }}>
            <Package size={40} color="white" />
          </div>
        </div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: 8 }}>Nome do App</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Como o aplicativo vai aparecer na tela do celular</p>
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8 }}>Nome do Aplicativo *</label>
        <input id="app-name-input" className="input-field" type="text" placeholder="Ex: Minha Loja" value={appName} onChange={e => setAppName(e.target.value)} maxLength={30} />
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: 6, textAlign: 'right' }}>{appName.length}/30</p>
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8 }}>ID do App (opcional)</label>
        <input id="package-name-input" className="input-field" type="text" placeholder={`com.app.${appName.toLowerCase().replace(/\s+/g, '') || 'meuapp'}`} value={packageName} onChange={e => setPackageName(e.target.value)} />
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        <button className="btn-secondary" style={{ padding: '14px 20px' }} onClick={() => setStep(0)}>Voltar</button>
        <button id="next-step-1" className="btn-primary" style={{ padding: '14px', flex: 1 }} onClick={() => setStep(2)} disabled={!appName.trim()}>
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>Próximo <ArrowRight size={18} /></span>
        </button>
      </div>
    </div>
  )

  const Step2 = (
    <div className="fade-in-up" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ textAlign: 'center' }}>
        <div className="float-anim" style={{ display: 'inline-block', marginBottom: 16 }}>
          <div style={{ width: 80, height: 80, borderRadius: 24, background: 'linear-gradient(135deg, #22d3ee, #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', boxShadow: '0 20px 60px rgba(34,211,238,0.4)' }}>
            <Upload size={40} color="white" />
          </div>
        </div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: 8 }}>Ícone do App</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Opcional — sem ícone, usaremos um padrão</p>
      </div>
      <div id="icon-upload-zone" className={`upload-zone ${dragOver ? 'drag-over' : ''}`} style={{ padding: 24, cursor: 'pointer' }}
        onClick={() => fileRef.current.click()}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); handleIcon(e.dataTransfer.files[0]) }}
      >
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleIcon(e.target.files[0])} id="icon-file-input" />
        {iconPreview ? (
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <img src={iconPreview} alt="Ícone" style={{ width: 80, height: 80, borderRadius: 20, objectFit: 'cover', border: '2px solid rgba(99,102,241,0.4)' }} />
            <button style={{ position: 'absolute', top: -10, right: -10, background: 'var(--error)', border: 'none', borderRadius: '50%', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'white' }}
              onClick={e => { e.stopPropagation(); setIconFile(null); setIconPreview(null) }}><X size={14} /></button>
          </div>
        ) : (
          <>
            <Upload size={32} color="var(--accent)" />
            <p style={{ fontWeight: 500, fontSize: '0.9rem', marginTop: 4 }}>Toque para escolher a imagem</p>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>PNG, JPG • Recomendado 512×512</p>
          </>
        )}
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        <button className="btn-secondary" style={{ padding: '14px 20px' }} onClick={() => setStep(1)}>Voltar</button>
        <button id="generate-btn" className="btn-primary" style={{ padding: '14px', flex: 1 }} onClick={() => { setStep(3); handleBuild() }}>
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}><Zap size={18} /> Gerar Meu App!</span>
        </button>
      </div>
    </div>
  )

  const Step3 = (
    <div className="fade-in-up" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {!downloadLink && !buildError && (
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(168,85,247,0.2))', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid rgba(99,102,241,0.4)', margin: '0 auto 16px' }}>
            <Loader2 size={40} color="var(--accent)" style={{ animation: 'spin 1s linear infinite' }} />
          </div>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: 6 }}>Construindo seu App…</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Acompanhe o progresso abaixo em tempo real</p>
        </div>
      )}

      {buildError && (
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid rgba(239,68,68,0.3)', margin: '0 auto 16px' }}>
            <AlertCircle size={40} color="#ef4444" />
          </div>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: 6, color: '#ef4444' }}>Erro na compilação</h2>
          <div className="glass-card-sm" style={{ padding: 14, textAlign: 'left', marginBottom: 12 }}>
            <p style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#fca5a5', lineHeight: 1.6, wordBreak: 'break-word' }}>{buildError}</p>
          </div>
          <button className="btn-secondary" style={{ padding: '12px 24px' }} onClick={reset}>Tentar novamente</button>
        </div>
      )}

      {downloadLink && (
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'rgba(34,197,94,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid rgba(34,197,94,0.3)', margin: '0 auto 16px' }}>
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <circle cx="24" cy="24" r="22" stroke="rgba(34,197,94,0.4)" strokeWidth="2" />
              <path className="checkmark-path" d="M13 24l8 8 14-16" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
          </div>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: 6 }}>APK Pronto! 🎉</h2>
          <div className="glass-card-sm" style={{ padding: 14, textAlign: 'left', marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              ['Nome', downloadAppName || appName],
              ['Tipo', inputMode === 'url' ? '🌐 Site (URL)' : '💻 HTML Embutido'],
              ['Tamanho', formatSize(downloadSize)],
              ['ID', packageName || `com.app.${appName.toLowerCase().replace(/\s+/g, '')}`],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', flexShrink: 0 }}>{k}:</span>
                <span style={{ fontSize: '0.85rem', fontWeight: 500, textAlign: 'right', wordBreak: 'break-all' }}>{v}</span>
              </div>
            ))}
          </div>
          <a id="download-apk-btn" href={downloadLink} download={`${(downloadAppName || appName).replace(/\s+/g, '_')}.apk`} style={{ width: '100%', textDecoration: 'none', display: 'block', marginBottom: 10 }}>
            <button className="btn-primary glow" style={{ padding: '18px', width: '100%', fontSize: '1.05rem' }}>
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}><Download size={20} /> Baixar APK</span>
            </button>
          </a>
          <button id="create-another-btn" className="btn-secondary" style={{ padding: '14px', width: '100%' }} onClick={reset}>Criar outro App</button>
        </div>
      )}

      {/* Build Console — always visible in step 3 */}
      {jobId && (
        <BuildConsole
          jobId={jobId}
          appName={appName}
          onComplete={handleBuildComplete}
          onError={handleBuildError}
        />
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  const stepsEl = [Step0, Step1, Step2, Step3]

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Toaster position="top-center" toastOptions={{
        style: { background: '#1e1b4b', color: '#f8fafc', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 12, fontFamily: 'Outfit, sans-serif' },
      }} />

      <header style={{ padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', backdropFilter: 'blur(20px)', position: 'sticky', top: 0, zIndex: 100, background: 'rgba(10,10,15,0.7)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #6366f1, #a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Smartphone size={20} color="white" />
          </div>
          <span style={{ fontWeight: 800, fontSize: '1.2rem', letterSpacing: '-0.5px' }}>App<span className="gradient-text">Forge</span></span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="badge"><Star size={12} /> Grátis</div>
          {isAuthenticated ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 14px',
                background: 'rgba(99,102,241,0.15)',
                borderRadius: 10,
                border: '1px solid rgba(99,102,241,0.3)'
              }}>
                <div style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #6366f1, #a855f7)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <User size={14} color="white" />
                </div>
                <span style={{ fontSize: '0.9rem', fontWeight: 500, color: '#e2e8f0' }}>
                  {user?.name}
                </span>
              </div>
              <button
                onClick={logout}
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: 'none',
                  background: 'rgba(239,68,68,0.15)',
                  color: '#ef4444',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: '0.85rem',
                  fontWeight: 500,
                  transition: 'all 0.2s'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.25)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(239,68,68,0.15)'}
              >
                <LogOut size={14} />
                Sair
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowLogin(true)}
              style={{
                padding: '10px 18px',
                borderRadius: 10,
                border: 'none',
                background: 'linear-gradient(135deg, #6366f1, #a855f7)',
                color: 'white',
                cursor: 'pointer',
                fontSize: '0.9rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: '0 4px 15px rgba(99,102,241,0.3)',
                transition: 'all 0.2s'
              }}
              onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
            >
              <User size={16} />
              Entrar
            </button>
          )}
        </div>
      </header>

      {showLogin && <Login onClose={() => setShowLogin(false)} />}

      <section style={{ padding: '48px 24px 32px', textAlign: 'center', maxWidth: 640, margin: '0 auto', width: '100%' }}>
        <div className="badge fade-in-up" style={{ marginBottom: 20, display: 'inline-flex' }}><Zap size={12} /> URL ou HTML → APK</div>
        <h1 className="fade-in-up fade-in-up-delay-1" style={{ fontSize: 'clamp(2rem, 7vw, 3rem)', fontWeight: 900, lineHeight: 1.1, marginBottom: 16, letterSpacing: '-1px' }}>
          Transforme seu site em um <span className="gradient-text">App Android</span>
        </h1>
        <p className="fade-in-up fade-in-up-delay-2" style={{ color: 'var(--text-secondary)', fontSize: '1rem', lineHeight: 1.7, maxWidth: 420, margin: '0 auto' }}>
          {mainTab === 'build' 
            ? 'Sem código adicional, sem instalação. Funciona do celular, completamente grátis.'
            : 'Extraia recursos, manifesto e assets de qualquer APK para estudo.'}
        </p>

        <div className="fade-in-up fade-in-up-delay-2" style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 24 }}>
          <button onClick={() => { reset(); setMainTab('build') }} style={{
            padding: '10px 20px', borderRadius: 12, border: 'none', cursor: 'pointer',
            background: mainTab === 'build' ? 'linear-gradient(135deg, #6366f1, #a855f7)' : 'rgba(255,255,255,0.05)',
            color: mainTab === 'build' ? 'white' : 'var(--text-secondary)',
            fontWeight: 700, fontSize: '0.9rem', transition: 'all 0.3s',
            boxShadow: mainTab === 'build' ? '0 10px 30px rgba(99,102,241,0.3)' : 'none'
          }}>⚒️ Gerador</button>
          <button onClick={() => { reset(); setMainTab('decompile') }} style={{
            padding: '10px 20px', borderRadius: 12, border: 'none', cursor: 'pointer',
            background: mainTab === 'decompile' ? 'linear-gradient(135deg, #ec4899, #f43f5e)' : 'rgba(255,255,255,0.05)',
            color: mainTab === 'decompile' ? 'white' : 'var(--text-secondary)',
            fontWeight: 700, fontSize: '0.9rem', transition: 'all 0.3s',
            boxShadow: mainTab === 'decompile' ? '0 10px 30px rgba(236,72,153,0.3)' : 'none'
          }}>🔍 Descompilador</button>
          
          {isAuthenticated && (
            <button onClick={() => { reset(); setMainTab('history') }} style={{
              padding: '10px 20px', borderRadius: 12, border: 'none', cursor: 'pointer',
              background: mainTab === 'history' ? 'linear-gradient(135deg, #10b981, #059669)' : 'rgba(255,255,255,0.05)',
              color: mainTab === 'history' ? 'white' : 'var(--text-secondary)',
              fontWeight: 700, fontSize: '0.9rem', transition: 'all 0.3s',
              boxShadow: mainTab === 'history' ? '0 10px 30px rgba(16,185,129,0.3)' : 'none'
            }}>📁 Meus Apps</button>
          )}
        </div>
      </section>

      <main style={{ flex: 1, padding: '0 16px 40px', maxWidth: 540, margin: '0 auto', width: '100%' }}>
        {mainTab === 'build' && (
          <div className="glass-card fade-in-up fade-in-up-delay-3" style={{ padding: '28px 24px' }}>
            <div style={{ marginBottom: 24 }}>
              <StepIndicator current={step} />
              <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: 10 }}>
                Passo {step + 1} de {STEPS.length} — {STEPS[step]}
              </p>
            </div>
            {stepsEl[step]}
          </div>
        )}

        {mainTab === 'decompile' && (
          <div className="glass-card fade-in-up fade-in-up-delay-3" style={{ padding: '28px 24px' }}>
            {!decompileJobId && !decompileZipLink && (
              <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div style={{ width: 80, height: 80, borderRadius: 24, background: 'linear-gradient(135deg, #ec4899, #f43f5e)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', boxShadow: '0 20px 60px rgba(236,72,153,0.4)' }}>
                  <Package size={40} color="white" />
                </div>
                <div>
                  <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: 8 }}>Descompilar APK</h2>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Envie um APK para extrair o código smali e recursos</p>
                </div>
                <div className={`upload-zone ${dragOver ? 'drag-over' : ''}`} style={{ padding: 40, cursor: 'pointer' }}
                  onClick={() => fileRef.current.click()}
                  onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={e => { e.preventDefault(); setDragOver(false); handleDecompile(e.dataTransfer.files[0]) }}
                >
                  <input ref={fileRef} type="file" accept=".apk" style={{ display: 'none' }} onChange={e => handleDecompile(e.target.files[0])} />
                  <Upload size={32} color="#ec4899" />
                  <p style={{ fontWeight: 500, fontSize: '0.9rem', marginTop: 10 }}>Selecione o arquivo .apk</p>
                </div>
              </div>
            )}

            {decompileJobId && !decompileZipLink && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div style={{ textAlign: 'center' }}>
                  <Loader2 size={40} color="#ec4899" style={{ animation: 'spin 1s linear infinite', marginBottom: 12 }} />
                  <h2 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Extraindo dados...</h2>
                </div>
                <BuildConsole 
                  jobId={decompileJobId} 
                  appName="APK" 
                  onComplete={(link) => { setDecompileZipLink(link); setDecompileLoading(false); toast.success('Extração concluída!') }}
                  onError={(msg) => { setDecompileError(msg); setDecompileLoading(false); setDecompileJobId(null) }}
                />
              </div>
            )}

            {decompileZipLink && (
              <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'rgba(34,197,94,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid rgba(34,197,94,0.3)', margin: '0 auto' }}>
                  <Download size={40} color="#22c55e" />
                </div>
                <div>
                  <h2 style={{ fontSize: '1.3rem', fontWeight: 700 }}>Pronto para Download!</h2>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Os recursos foram extraídos com sucesso.</p>
                </div>
                <a href={decompileZipLink} download="source.zip" style={{ textDecoration: 'none' }}>
                  <button className="btn-primary" style={{ background: '#22c55e', width: '100%', padding: 18 }}>
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}><FileText size={20} /> Baixar Código Fonte (.zip)</span>
                  </button>
                </a>
                <button className="btn-secondary" style={{ width: '100%' }} onClick={reset}>Analisar outro APK</button>
              </div>
            )}
          </div>
        )}

        {mainTab === 'history' && (
          <HistoryView API_URL={API_URL} />
        )}

        {mainTab === 'build' && step === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 24 }}>
            <FeatureCard icon={<Link size={22} color="white" />} color="rgba(99,102,241,0.3)" title="Modo URL" desc="Informe o endereço do seu site. O app abrirá ele como WebView — sempre atualizado." />
            <FeatureCard icon={<Code2 size={22} color="white" />} color="rgba(14,165,233,0.25)" title="Modo HTML" desc="Cole o código HTML diretamente. O arquivo fica embutido no APK e funciona offline." />
            <FeatureCard icon={<Terminal size={22} color="white" />} color="rgba(168,85,247,0.2)" title="Build Console ao Vivo" desc="Veja cada etapa da compilação em tempo real, com cronômetro e árvore de arquivos." />
          </div>
        )}
      </main>

      <footer style={{ textAlign: 'center', padding: '20px', color: 'var(--text-secondary)', fontSize: '0.8rem', borderTop: '1px solid var(--border)' }}>
        © 2026 Web2APK — Feito com 💜 para o mundo
      </footer>
    </div>
  )
}

// ─── Main App Wrapper ─────────────────────────────────────────────────────────
export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}
