import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Smartphone, Globe, Upload, Download, Zap, ArrowRight,
  Loader2, Package, Star, X, Code2, Link, CheckCircle2, Circle,
  AlertCircle, Clock, FolderOpen, FileText, Terminal, ChevronDown,
  ChevronUp, Cpu, FilePlus, FileEdit, Copy,
  User, LogOut, History, Calendar, Search, Type, Image as ImageIcon,
  MousePointerClick, ShoppingCart, MapPin, Mail, Phone, Trash2, Plus,
  Palette, Layers, Eye, LayoutTemplate, Wand2, MoveUp, MoveDown
} from 'lucide-react'
import axios from 'axios'
import toast, { Toaster } from 'react-hot-toast'
import { AuthProvider } from './contexts/AuthContext'
import { useAuth } from './contexts/useAuth'
import Login from './components/Login'
import { API_CANDIDATES, API_URL } from './config'

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

const formatApiError = (err, action = 'conectar ao backend') => {
  const serverMessage = err.response?.data?.error
  if (serverMessage) return serverMessage

  if (err.response?.status) {
    return `Backend respondeu ${err.response.status} ao tentar ${action}. Confira se ${API_URL} e o servico Render correto.`
  }

  if (err.code === 'ECONNABORTED') {
    return `Tempo esgotado ao tentar ${action}. O Render pode estar acordando; tente novamente em alguns segundos.`
  }

  if (err.message === 'Network Error') {
    return `Erro de rede ao tentar ${action}. Confira se VITE_API_BASE_URL no Vercel aponta para a URL correta do backend no Render. URLs testadas: ${API_CANDIDATES.join(', ')}.`
  }

  return err.message || `Erro ao tentar ${action}.`
}

const DECOMPILE_MODE_OPTIONS = [
  { id: 'full', label: 'Completo', desc: 'Smali + Java (maior)' },
  { id: 'java', label: 'So Java', desc: 'Apenas JADX (menor)' },
  { id: 'smali', label: 'So Smali', desc: 'Apenas Apktool' },
]

// ─── Sub-components ───────────────────────────────────────────────────────────
function ModeToggle({ mode, onChange, compact = false }) {
  return (
    <div style={{
      display: 'flex',
      background: 'rgba(255,255,255,0.05)',
      borderRadius: compact ? 12 : 14,
      padding: compact ? 4 : 4,
      gap: compact ? 4 : 4,
      border: '1px solid var(--border)',
      width: compact ? '100%' : 'auto',
    }}>
      {[
        { id: 'url', label: 'URL do Site', icon: <Link size={15} /> },
        { id: 'builder', label: 'Criador do Zero', icon: <Wand2 size={15} /> },
        { id: 'html', label: 'Código HTML', icon: <Code2 size={15} /> },
      ].map(opt => (
        <button key={opt.id} id={`mode-${opt.id}`} onClick={() => onChange(opt.id)} style={{
          flex: 1, padding: compact ? '10px 14px' : '10px 16px', borderRadius: 10, border: 'none', cursor: 'pointer',
          fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: compact ? '0.88rem' : '0.88rem',
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

function BuildConsole({ jobId, onComplete, onError, apiUrl = API_URL }) {
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
  const logsEndRef = useRef()
  const timerRef = useRef()

  useEffect(() => {
    timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000)
    return () => clearInterval(timerRef.current)
  }, [])

  useEffect(() => {
    if (!jobId) return
    const sse = new EventSource(`${apiUrl}/build-events/${jobId}`)

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
          onComplete(`${apiUrl}${ev.downloadUrl}`, ev.appName, ev.apkSize)
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
  }, [apiUrl, jobId, onComplete, onError])

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

function FeatureCard({ icon, title, desc, color, compact = false }) {
  return (
    <div className={`glass-card-sm feature-card-shell ${compact ? 'compact' : ''}`}>
      <div className="feature-icon" style={{ background: color, flexShrink: 0 }}>{icon}</div>
      <div>
        <p className="feature-card-title">{title}</p>
        <p className="feature-card-desc">{desc}</p>
      </div>
    </div>
  )
}

const FEATURE_SLIDES = [
  {
    icon: <Link size={22} color="white" />,
    color: 'rgba(99,102,241,0.3)',
    title: 'Modo URL',
    desc: 'Informe o endereço do seu site. O app abrirá ele como WebView — sempre atualizado.',
  },
  {
    icon: <Code2 size={22} color="white" />,
    color: 'rgba(14,165,233,0.25)',
    title: 'Modo HTML',
    desc: 'Cole o código HTML diretamente. O arquivo fica embutido no APK e funciona offline.',
  },
  {
    icon: <Terminal size={22} color="white" />,
    color: 'rgba(168,85,247,0.2)',
    title: 'Build Console ao Vivo',
    desc: 'Veja cada etapa da compilação em tempo real, com cronômetro e árvore de arquivos.',
  },
]

// ─── Visual Builder ──────────────────────────────────────────────────────────
const BUILDER_THEMES = [
  { id: 'midnight', name: 'Noite Pro', primary: '#7c3aed', accent: '#14b8a6', background: '#0f172a', surface: '#111827', text: '#f8fafc' },
  { id: 'clean', name: 'Claro Loja', primary: '#2563eb', accent: '#f59e0b', background: '#f8fafc', surface: '#ffffff', text: '#111827' },
  { id: 'health', name: 'Saude', primary: '#059669', accent: '#38bdf8', background: '#ecfdf5', surface: '#ffffff', text: '#10221b' },
  { id: 'food', name: 'Delivery', primary: '#dc2626', accent: '#f97316', background: '#fff7ed', surface: '#ffffff', text: '#1f1308' },
]

const BUILDER_LIBRARY = [
  { type: 'hero', label: 'Capa', icon: <LayoutTemplate size={17} />, hint: 'Titulo, chamada e botao', group: 'estrutura', tags: 'inicio destaque topo' },
  { type: 'text', label: 'Texto', icon: <Type size={17} />, hint: 'Bloco de conteudo', group: 'estrutura', tags: 'paragrafo artigo descricao' },
  { type: 'image', label: 'Imagem', icon: <ImageIcon size={17} />, hint: 'Banner por URL', group: 'estrutura', tags: 'foto galeria capa' },
  { type: 'button', label: 'Botao', icon: <MousePointerClick size={17} />, hint: 'Link ou WhatsApp', group: 'acao', tags: 'cta chamar contato' },
  { type: 'card', label: 'Card', icon: <Layers size={17} />, hint: 'Destaque com descricao', group: 'estrutura', tags: 'servico bloco recurso' },
  { type: 'list', label: 'Lista', icon: <CheckCircle2 size={17} />, hint: 'Beneficios ou recursos', group: 'estrutura', tags: 'vantagens topicos itens' },
  { type: 'product', label: 'Produto', icon: <ShoppingCart size={17} />, hint: 'Oferta com preco', group: 'vendas', tags: 'loja ecommerce oferta' },
  { type: 'testimonial', label: 'Depoimento', icon: <Star size={17} />, hint: 'Prova social com autor', group: 'vendas', tags: 'avaliacao cliente feedback' },
  { type: 'faq', label: 'FAQ', icon: <FileText size={17} />, hint: 'Perguntas e respostas', group: 'vendas', tags: 'duvidas suporte respostas' },
  { type: 'contact', label: 'Contato', icon: <Phone size={17} />, hint: 'Telefone e email', group: 'contato', tags: 'telefone email atendimento' },
  { type: 'form', label: 'Formulario', icon: <Mail size={17} />, hint: 'Captura simples', group: 'contato', tags: 'leads cadastro nome' },
  { type: 'map', label: 'Mapa', icon: <MapPin size={17} />, hint: 'Endereco no mapa', group: 'contato', tags: 'localizacao endereco rota' },
  { type: 'social', label: 'Redes', icon: <Globe size={17} />, hint: 'Instagram, WhatsApp e site', group: 'contato', tags: 'social bio links' },
  { type: 'hours', label: 'Horario', icon: <Calendar size={17} />, hint: 'Dias e horarios de atendimento', group: 'contato', tags: 'abertura funcionamento agenda' },
  { type: 'spacer', label: 'Espaco', icon: <Layers size={17} />, hint: 'Respiro entre blocos', group: 'estrutura', tags: 'espacador altura margem' },
]

const BUILDER_GROUPS = [
  { id: 'all', label: 'Todos' },
  { id: 'estrutura', label: 'Estrutura' },
  { id: 'acao', label: 'Acoes' },
  { id: 'vendas', label: 'Vendas' },
  { id: 'contato', label: 'Contato' },
]

const BUILDER_STARTERS = [
  { id: 'business', label: 'Negocio Local', desc: 'Capa, servicos, horario e contato' },
  { id: 'catalog', label: 'Catalogo', desc: 'Produto, lista de vantagens e oferta' },
  { id: 'event', label: 'Evento', desc: 'Programacao, FAQ e inscricao' },
]

const BUILDER_LABELS = BUILDER_LIBRARY.reduce((acc, item) => {
  acc[item.type] = item.label
  return acc
}, {})

const cloneElements = (items = []) => items.map(item => ({ ...item }))

const splitLines = (value = '') => String(value || '').split('\n').map(line => line.trim()).filter(Boolean)

const parseFaqRows = (value = '') => splitLines(value).map((line, index) => {
  const [question, ...answerParts] = line.split('|')
  const answer = answerParts.join('|').trim()
  return {
    id: `faq-${index}-${question}`,
    question: (question || '').trim(),
    answer: answer || 'Edite este item para incluir a resposta completa.',
  }
}).filter(item => item.question)

const getElementTitle = (element) => element.title || element.label || BUILDER_LABELS[element.type] || 'Bloco'

const getElementSubtitle = (element) => {
  if (element.type === 'spacer') return `${Number(element.size || 32)}px`
  return BUILDER_LABELS[element.type] || element.type
}

const makeElement = (type) => {
  const id = `${type}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  const base = { id, type }
  const defaults = {
    hero: {
      title: 'Seu aplicativo profissional',
      text: 'Crie uma experiencia bonita para clientes, alunos ou visitantes.',
      label: 'Comecar agora',
      url: '#contato',
      imageUrl: '',
    },
    text: {
      title: 'Sobre o app',
      text: 'Escreva aqui a apresentacao do seu servico, produto, comunidade ou conteudo.',
    },
    image: {
      title: 'Imagem destaque',
      imageUrl: 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=900&q=80',
      text: 'Troque pela URL da sua imagem.',
    },
    button: {
      label: 'Abrir WhatsApp',
      url: 'https://wa.me/5500000000000',
      text: 'Use este botao para levar o usuario para compra, contato ou agenda.',
    },
    card: {
      title: 'Servico em destaque',
      text: 'Mostre uma vantagem, pacote, aula, produto ou funcionalidade importante.',
    },
    list: {
      title: 'O que o app oferece',
      items: 'Catalogo completo\nContato rapido\nAtualizacoes em tempo real',
    },
    product: {
      title: 'Produto principal',
      text: 'Descricao curta do produto ou servico.',
      price: 'R$ 49,90',
      label: 'Comprar',
      url: 'https://wa.me/5500000000000',
      imageUrl: '',
    },
    contact: {
      title: 'Fale conosco',
      text: 'Atendimento de segunda a sexta.',
      phone: '+55 00 00000-0000',
      email: 'contato@seudominio.com',
    },
    form: {
      title: 'Receba novidades',
      text: 'Deixe seu nome e contato para receber atualizacoes.',
      label: 'Enviar',
    },
    map: {
      title: 'Nossa localizacao',
      address: 'Sao Paulo, Brasil',
      text: 'Troque pelo endereco do seu negocio.',
    },
    faq: {
      title: 'Perguntas frequentes',
      qa: 'Como comprar?|Clique no botao comprar e fale no WhatsApp.\nTem suporte?|Sim, atendimento em horario comercial.',
    },
    testimonial: {
      title: 'Quem usa recomenda',
      quote: 'O app ficou rapido e ajudou minhas vendas no primeiro dia.',
      name: 'Cliente satisfeito',
      role: 'Proprietario',
    },
    social: {
      title: 'Acompanhe nossos canais',
      text: 'Publique os links principais para facilitar seu atendimento.',
      site: 'https://seusite.com',
      instagram: 'https://instagram.com/seuperfil',
      whatsapp: 'https://wa.me/5500000000000',
    },
    hours: {
      title: 'Horario de atendimento',
      schedule: 'Seg a Sex | 09:00 - 18:00\nSabado | 09:00 - 13:00\nDomingo | Fechado',
      text: 'Atualize os horarios conforme sua rotina.',
    },
    spacer: {
      size: '32',
    },
  }
  return { ...base, ...(defaults[type] || defaults.text) }
}

const createDefaultElements = () => [
  makeElement('hero'),
  makeElement('card'),
  makeElement('product'),
  makeElement('list'),
  makeElement('contact'),
]

const createStarterElements = (id) => {
  if (id === 'catalog') {
    return [
      makeElement('hero'),
      makeElement('product'),
      makeElement('list'),
      makeElement('faq'),
      makeElement('contact'),
    ]
  }

  if (id === 'event') {
    const hero = makeElement('hero')
    hero.title = 'Evento imperdivel'
    hero.text = 'Organize sua agenda, divulgue detalhes e receba inscricoes.'
    hero.label = 'Garantir vaga'
    hero.url = '#inscricao'

    const agenda = makeElement('hours')
    agenda.title = 'Programacao'
    agenda.schedule = 'Abertura | 08:30\nPalestra principal | 10:00\nNetworking | 14:00'
    agenda.text = 'Ajuste os horarios e os temas.'

    const form = makeElement('form')
    form.title = 'Inscricao rapida'
    form.text = 'Preencha nome e contato para receber confirmacao.'
    form.label = 'Quero participar'

    return [hero, makeElement('text'), agenda, makeElement('faq'), form]
  }

  return [
    makeElement('hero'),
    makeElement('card'),
    makeElement('hours'),
    makeElement('social'),
    makeElement('contact'),
  ]
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function safeUrl(value = '#') {
  const url = String(value || '#').trim()
  if (url.startsWith('#') || url.startsWith('mailto:') || url.startsWith('tel:') || url.startsWith('https://') || url.startsWith('http://')) {
    return escapeHtml(url)
  }
  return '#'
}

function renderBuilderElementHtml(el) {
  const title = escapeHtml(el.title)
  const text = escapeHtml(el.text)
  const label = escapeHtml(el.label || 'Abrir')
  const url = safeUrl(el.url)
  const imageUrl = safeUrl(el.imageUrl)
  switch (el.type) {
    case 'hero':
      return `<section class="hero-section">${el.imageUrl ? `<img class="hero-image" src="${imageUrl}" alt="">` : ''}<div><p class="eyebrow">App criado no Web2APK</p><h1>${title}</h1><p>${text}</p><a class="primary-button" href="${url}">${label}</a></div></section>`
    case 'text':
      return `<section class="content-section"><h2>${title}</h2><p>${text}</p></section>`
    case 'image':
      return `<section class="content-section"><img class="wide-image" src="${imageUrl}" alt="${title}"><h2>${title}</h2><p>${text}</p></section>`
    case 'button':
      return `<section class="content-section center"><p>${text}</p><a class="primary-button" href="${url}">${label}</a></section>`
    case 'card':
      return `<section class="feature-card"><h2>${title}</h2><p>${text}</p></section>`
    case 'list': {
      const items = String(el.items || '').split('\n').filter(Boolean).map(item => `<li>${escapeHtml(item)}</li>`).join('')
      return `<section class="content-section"><h2>${title}</h2><ul class="check-list">${items}</ul></section>`
    }
    case 'product':
      return `<section class="product-card">${el.imageUrl ? `<img src="${imageUrl}" alt="${title}">` : ''}<div><h2>${title}</h2><p>${text}</p><strong>${escapeHtml(el.price)}</strong><a class="primary-button" href="${url}">${label}</a></div></section>`
    case 'contact':
      return `<section id="contato" class="content-section"><h2>${title}</h2><p>${text}</p><div class="contact-grid"><a href="tel:${escapeHtml(el.phone)}">${escapeHtml(el.phone)}</a><a href="mailto:${escapeHtml(el.email)}">${escapeHtml(el.email)}</a></div></section>`
    case 'form':
      return `<section class="content-section"><h2>${title}</h2><p>${text}</p><form class="lead-form" onsubmit="event.preventDefault(); alert('Recebido com sucesso.');"><input placeholder="Seu nome"><input placeholder="Telefone ou email"><button>${label}</button></form></section>`
    case 'map':
      return `<section class="content-section"><h2>${title}</h2><p>${text}</p><iframe class="map-frame" loading="lazy" src="https://maps.google.com/maps?q=${encodeURIComponent(el.address || '')}&output=embed"></iframe></section>`
    case 'faq': {
      const rows = parseFaqRows(el.qa)
      const content = rows.length
        ? rows.map(row => `<article><h3>${escapeHtml(row.question)}</h3><p>${escapeHtml(row.answer)}</p></article>`).join('')
        : '<article><h3>Pergunta</h3><p>Resposta</p></article>'
      return `<section class="content-section"><h2>${title}</h2><div class="faq-list">${content}</div></section>`
    }
    case 'testimonial':
      return `<section class="feature-card testimonial-card"><h2>${title}</h2><blockquote>${escapeHtml(el.quote)}</blockquote><p class="author">${escapeHtml(el.name || 'Cliente')} • ${escapeHtml(el.role || '')}</p></section>`
    case 'social': {
      const links = [
        { label: 'Site', href: safeUrl(el.site) },
        { label: 'Instagram', href: safeUrl(el.instagram) },
        { label: 'WhatsApp', href: safeUrl(el.whatsapp) },
      ].filter(link => link.href !== '#')
      const html = links.length
        ? links.map(link => `<a href="${link.href}">${escapeHtml(link.label)}</a>`).join('')
        : '<span class="helper-note">Adicione links para suas redes.</span>'
      return `<section class="content-section"><h2>${title}</h2><p>${text}</p><div class="social-grid">${html}</div></section>`
    }
    case 'hours': {
      const schedule = splitLines(el.schedule).map(line => `<li>${escapeHtml(line)}</li>`).join('')
      return `<section class="content-section"><h2>${title}</h2><p>${text}</p><ul class="hours-list">${schedule}</ul></section>`
    }
    case 'spacer':
      return `<div style="height:${Number(el.size || 32)}px"></div>`
    default:
      return `<div style="height:${Number(el.size || 32)}px"></div>`
  }
}

function generateBuilderHtml(appName, elements, theme) {
  const title = escapeHtml(appName || 'Meu App')
  const body = elements.map(renderBuilderElementHtml).join('\n')
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    :root{--primary:${theme.primary};--accent:${theme.accent};--bg:${theme.background};--surface:${theme.surface};--text:${theme.text};}
    *{box-sizing:border-box} body{margin:0;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:var(--bg);color:var(--text);} a{color:inherit}
    .app-shell{min-height:100vh;padding:18px;display:flex;flex-direction:column;gap:16px}
    .topbar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 4px;font-weight:800}
    .brand{display:flex;align-items:center;gap:10px}.brand-mark{width:34px;height:34px;border-radius:10px;background:linear-gradient(135deg,var(--primary),var(--accent))}
    section{border-radius:22px}.hero-section{min-height:360px;display:grid;align-items:end;overflow:hidden;padding:26px;background:linear-gradient(145deg,var(--surface),rgba(255,255,255,.04));position:relative}
    .hero-image{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.35}.hero-section>div{position:relative;z-index:1}.eyebrow{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:var(--accent);font-weight:800}
    h1{font-size:40px;line-height:1;margin:8px 0 14px}h2{font-size:24px;margin:0 0 10px}p{line-height:1.6;opacity:.82}
    .content-section,.feature-card,.product-card{background:var(--surface);padding:22px;box-shadow:0 16px 50px rgba(0,0,0,.12)}
    .center{text-align:center}.primary-button,.lead-form button{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 18px;border-radius:14px;background:linear-gradient(135deg,var(--primary),var(--accent));color:white;text-decoration:none;font-weight:800;border:0;margin-top:12px}
    .wide-image,.product-card img{width:100%;border-radius:18px;object-fit:cover;max-height:260px}.check-list{list-style:none;padding:0;margin:14px 0 0}.check-list li{padding:12px 0;border-bottom:1px solid rgba(127,127,127,.18)}.check-list li:before{content:"✓";color:var(--accent);font-weight:900;margin-right:10px}
    .product-card{display:grid;gap:16px}.product-card strong{display:block;font-size:28px;color:var(--accent);margin:10px 0}.contact-grid{display:grid;gap:10px}.contact-grid a{padding:14px;border-radius:14px;background:rgba(127,127,127,.12);text-decoration:none;font-weight:700}
    .faq-list{display:grid;gap:10px}.faq-list article{padding:14px;border-radius:14px;background:rgba(127,127,127,.12)}.faq-list h3{font-size:18px;margin:0 0 6px}
    .testimonial-card blockquote{margin:8px 0 0;font-size:20px;line-height:1.5;font-weight:600}.testimonial-card .author{margin:14px 0 0;font-weight:700;color:var(--accent)}
    .social-grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));margin-top:12px}.social-grid a{padding:12px;border-radius:12px;background:rgba(127,127,127,.12);text-decoration:none;font-weight:700;text-align:center}.helper-note{opacity:.72;font-size:14px}
    .hours-list{margin:14px 0 0;padding:0;list-style:none;display:grid;gap:8px}.hours-list li{padding:10px 12px;border-radius:12px;background:rgba(127,127,127,.12)}
    .lead-form{display:grid;gap:10px;margin-top:14px}.lead-form input{min-height:48px;border:1px solid rgba(127,127,127,.25);border-radius:14px;padding:0 14px;background:rgba(255,255,255,.08);color:var(--text);font:inherit}.map-frame{width:100%;height:260px;border:0;border-radius:18px;margin-top:12px}
    @media(max-width:520px){.app-shell{padding:12px}h1{font-size:34px}.hero-section{min-height:320px;padding:22px}}
  </style>
</head>
<body>
  <main class="app-shell">
    <header class="topbar"><div class="brand"><span class="brand-mark"></span>${title}</div></header>
    ${body}
  </main>
</body>
</html>`
}

function BuilderPreviewElement({ element, theme }) {
  const box = { background: theme.surface, color: theme.text }
  if (element.type === 'hero') {
    return (
      <section className="builder-phone-hero" style={box}>
        {element.imageUrl && <img src={element.imageUrl} alt="" />}
        <div>
          <small style={{ color: theme.accent }}>App criado no Web2APK</small>
          <h3>{element.title}</h3>
          <p>{element.text}</p>
          <span style={{ background: `linear-gradient(135deg, ${theme.primary}, ${theme.accent})` }}>{element.label}</span>
        </div>
      </section>
    )
  }
  if (element.type === 'image') {
    return <section className="builder-phone-block" style={box}><img className="builder-phone-image" src={element.imageUrl} alt="" /><h4>{element.title}</h4><p>{element.text}</p></section>
  }
  if (element.type === 'button') {
    return <section className="builder-phone-block center" style={box}><p>{element.text}</p><span style={{ background: `linear-gradient(135deg, ${theme.primary}, ${theme.accent})` }}>{element.label}</span></section>
  }
  if (element.type === 'list') {
    return <section className="builder-phone-block" style={box}><h4>{element.title}</h4>{String(element.items || '').split('\n').filter(Boolean).map(item => <p key={item} className="builder-mini-row">{item}</p>)}</section>
  }
  if (element.type === 'product') {
    return <section className="builder-phone-block" style={box}>{element.imageUrl && <img className="builder-phone-image" src={element.imageUrl} alt="" />}<h4>{element.title}</h4><p>{element.text}</p><strong style={{ color: theme.accent }}>{element.price}</strong><span style={{ background: `linear-gradient(135deg, ${theme.primary}, ${theme.accent})` }}>{element.label}</span></section>
  }
  if (element.type === 'contact') {
    return <section className="builder-phone-block" style={box}><h4>{element.title}</h4><p>{element.text}</p><p className="builder-mini-row">{element.phone}</p><p className="builder-mini-row">{element.email}</p></section>
  }
  if (element.type === 'form') {
    return <section className="builder-phone-block" style={box}><h4>{element.title}</h4><p>{element.text}</p><div className="builder-preview-input">Seu nome</div><div className="builder-preview-input">Telefone ou email</div><span style={{ background: `linear-gradient(135deg, ${theme.primary}, ${theme.accent})` }}>{element.label}</span></section>
  }
  if (element.type === 'map') {
    return <section className="builder-phone-block" style={box}><h4>{element.title}</h4><p>{element.text}</p><div className="builder-map-fake"><MapPin size={20} /> {element.address}</div></section>
  }
  if (element.type === 'faq') {
    return (
      <section className="builder-phone-block" style={box}>
        <h4>{element.title}</h4>
        {parseFaqRows(element.qa).slice(0, 3).map(row => (
          <div key={row.id} className="builder-mini-row">
            <strong>{row.question}</strong>
            <p>{row.answer}</p>
          </div>
        ))}
      </section>
    )
  }
  if (element.type === 'testimonial') {
    return (
      <section className="builder-phone-block" style={box}>
        <h4>{element.title}</h4>
        <p>"{element.quote}"</p>
        <p className="builder-mini-row">{element.name} • {element.role}</p>
      </section>
    )
  }
  if (element.type === 'social') {
    return (
      <section className="builder-phone-block" style={box}>
        <h4>{element.title}</h4>
        <p>{element.text}</p>
        <div className="builder-social-preview">
          {['Site', 'Instagram', 'WhatsApp'].map(item => <span key={item}>{item}</span>)}
        </div>
      </section>
    )
  }
  if (element.type === 'hours') {
    return (
      <section className="builder-phone-block" style={box}>
        <h4>{element.title}</h4>
        {splitLines(element.schedule).map(line => <p key={line} className="builder-mini-row">{line}</p>)}
      </section>
    )
  }
  if (element.type === 'spacer') {
    return <div className="builder-spacer" style={{ height: Number(element.size || 32) }}>Espaco {Number(element.size || 32)}px</div>
  }
  return <section className="builder-phone-block" style={box}><h4>{element.title}</h4><p>{element.text}</p></section>
}

function Field({ label, value, onChange, multiline = false, placeholder = '', type = 'text', min, max, step }) {
  return (
    <label className="builder-field">
      <span>{label}</span>
      {multiline ? (
        <textarea value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={4} />
      ) : (
        <input type={type} min={min} max={max} step={step} value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
      )}
    </label>
  )
}

function VisualBuilder({ appName, elements, setElements, selectedId, setSelectedId, theme, setTheme, onExportHtml }) {
  const [toolQuery, setToolQuery] = useState('')
  const [openGroups, setOpenGroups] = useState(() => (
    BUILDER_GROUPS
      .filter(group => group.id !== 'all')
      .reduce((acc, group) => ({ ...acc, [group.id]: true }), {})
  ))
  const [previewDevice, setPreviewDevice] = useState('phone')
  const historyRef = useRef([])
  const redoRef = useRef([])
  const [, forceHistoryRefresh] = useState(0)
  const selected = elements.find(el => el.id === selectedId) || elements[0]
  const selectedIndex = selected ? elements.findIndex(el => el.id === selected.id) : -1
  const commitHistory = useCallback(() => {
    historyRef.current.push({
      elements: cloneElements(elements),
      selectedId: selected?.id || selectedId || elements[0]?.id || '',
    })
    if (historyRef.current.length > 60) historyRef.current.shift()
    redoRef.current = []
    forceHistoryRefresh(value => value + 1)
  }, [elements, selected, selectedId])

  const undo = useCallback(() => {
    const previous = historyRef.current.pop()
    if (!previous) return
    redoRef.current.push({
      elements: cloneElements(elements),
      selectedId: selected?.id || selectedId || elements[0]?.id || '',
    })
    setElements(previous.elements)
    setSelectedId(previous.selectedId || previous.elements[0]?.id || '')
    forceHistoryRefresh(value => value + 1)
  }, [elements, selected, selectedId, setElements, setSelectedId])

  const redo = useCallback(() => {
    const next = redoRef.current.pop()
    if (!next) return
    historyRef.current.push({
      elements: cloneElements(elements),
      selectedId: selected?.id || selectedId || elements[0]?.id || '',
    })
    setElements(next.elements)
    setSelectedId(next.selectedId || next.elements[0]?.id || '')
    forceHistoryRefresh(value => value + 1)
  }, [elements, selected, selectedId, setElements, setSelectedId])

  useEffect(() => {
    const onKeyDown = (event) => {
      if (!(event.metaKey || event.ctrlKey)) return
      const key = event.key.toLowerCase()
      if (key === 'z') {
        event.preventDefault()
        if (event.shiftKey) {
          redo()
        } else {
          undo()
        }
      }
      if (key === 'y') {
        event.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [redo, undo])

  const updateSelected = (patch) => {
    if (!selected) return
    commitHistory()
    setElements(prev => prev.map(el => el.id === selected.id ? { ...el, ...patch } : el))
  }
  const addElement = (type) => {
    const next = makeElement(type)
    commitHistory()
    setElements(prev => {
      if (!selected) return [...prev, next]
      const anchor = prev.findIndex(el => el.id === selected.id)
      if (anchor < 0) return [...prev, next]
      const copy = [...prev]
      copy.splice(anchor + 1, 0, next)
      return copy
    })
    setSelectedId(next.id)
  }
  const removeSelected = () => {
    if (!selected) return
    commitHistory()
    const next = elements.filter(el => el.id !== selected.id)
    setElements(next)
    setSelectedId(next[0]?.id || '')
  }
  const moveSelected = (direction) => {
    if (!selected) return
    const index = elements.findIndex(el => el.id === selected.id)
    const target = index + direction
    if (target < 0 || target >= elements.length) return
    commitHistory()
    setElements(prev => {
      const index = prev.findIndex(el => el.id === selected.id)
      const target = index + direction
      if (target < 0 || target >= prev.length) return prev
      const copy = [...prev]
      const [item] = copy.splice(index, 1)
      copy.splice(target, 0, item)
      return copy
    })
  }
  const duplicateSelected = () => {
    if (!selected) return
    commitHistory()
    const copy = { ...selected, id: `${selected.type}-${Date.now()}` }
    setElements(prev => {
      const index = prev.findIndex(el => el.id === selected.id)
      if (index < 0) return [...prev, copy]
      const next = [...prev]
      next.splice(index + 1, 0, copy)
      return next
    })
    setSelectedId(copy.id)
  }

  const resetDefaultLayout = () => {
    commitHistory()
    const next = createDefaultElements()
    setElements(next)
    setSelectedId(next[0]?.id || '')
  }

  const clearLayout = () => {
    if (!elements.length) return
    commitHistory()
    setElements([])
    setSelectedId('')
  }

  const applyStarter = (starterId) => {
    commitHistory()
    const next = createStarterElements(starterId)
    setElements(next)
    setSelectedId(next[0]?.id || '')
  }

  const matchesToolQuery = useCallback((item) => {
    const query = toolQuery.trim().toLowerCase()
    if (!query) return true
    const text = `${item.label} ${item.hint} ${item.tags || ''}`.toLowerCase()
    return text.includes(query)
  }, [toolQuery])

  const groupedTools = BUILDER_GROUPS
    .filter(group => group.id !== 'all')
    .map(group => ({
      ...group,
      items: BUILDER_LIBRARY.filter(item => item.group === group.id && matchesToolQuery(item)),
    }))
    .filter(group => group.items.length > 0 || !toolQuery.trim())

  const hasAnyTool = groupedTools.some(group => group.items.length > 0)

  const canUndo = historyRef.current.length > 0
  const canRedo = redoRef.current.length > 0

  return (
    <div className="builder-studio">
      <div className="builder-panel">
        <div className="builder-panel-title"><Plus size={16} /> Biblioteca</div>
        <label className="builder-search">
          <Search size={14} />
          <input value={toolQuery} onChange={e => setToolQuery(e.target.value)} placeholder="Buscar elemento..." />
        </label>
        <div className="builder-tree">
          {groupedTools.map(group => {
            const isOpen = openGroups[group.id] ?? true
            const count = group.items.length
            return (
              <div key={group.id} className="builder-tree-group">
                <button
                  type="button"
                  className="builder-tree-toggle"
                  onClick={() => setOpenGroups(prev => ({ ...prev, [group.id]: !isOpen }))}
                >
                  {isOpen ? <ChevronDown size={14} /> : <ArrowRight size={14} />}
                  <span>{group.label}</span>
                  <small>{count}</small>
                </button>
                {isOpen && (
                  <div className="builder-tree-children">
                    {group.items.map(item => (
                      <button key={item.type} type="button" className="builder-tree-leaf" onClick={() => addElement(item.type)}>
                        <span className="builder-tree-leaf-icon">{item.icon}</span>
                        <span className="builder-tree-leaf-text">
                          <strong>{item.label}</strong>
                          <small>{item.hint}</small>
                        </span>
                      </button>
                    ))}
                    {!count && <p className="builder-empty-note">Sem itens nessa categoria.</p>}
                  </div>
                )}
              </div>
            )
          })}
          {!hasAnyTool && <p className="builder-empty-note">Nenhum elemento encontrado com esse filtro.</p>}
        </div>

        <div className="builder-panel-title" style={{ marginTop: 16 }}><Layers size={16} /> Camadas ({elements.length})</div>
        <div className="builder-layer-list">
          {elements.map((element, index) => (
            <button key={element.id} type="button" className={`builder-layer-item ${selected?.id === element.id ? 'active' : ''}`} onClick={() => setSelectedId(element.id)}>
              <span className="builder-layer-index">{index + 1}</span>
              <span className="builder-layer-content">
                <strong>{getElementTitle(element)}</strong>
                <small>{getElementSubtitle(element)}</small>
              </span>
            </button>
          ))}
          {elements.length === 0 && <p className="builder-empty-note">Sem camadas. Adicione um bloco.</p>}
        </div>

        <div className="builder-panel-title" style={{ marginTop: 16 }}><Palette size={16} /> Tema</div>
        <div className="builder-theme-grid">
          {BUILDER_THEMES.map(t => (
            <button key={t.id} type="button" className={`builder-theme ${theme.id === t.id ? 'active' : ''}`} onClick={() => setTheme(t)}>
              <span style={{ background: `linear-gradient(135deg, ${t.primary}, ${t.accent})` }} />
              {t.name}
            </button>
          ))}
        </div>
      </div>

      <div className="builder-preview-wrap">
        <div className="builder-preview-top">
          <div className="builder-panel-title"><Eye size={16} /> Previa do app</div>
          <div className="builder-device-toggle">
            <button type="button" className={previewDevice === 'phone' ? 'active' : ''} onClick={() => setPreviewDevice('phone')} title="Visual de celular">
              <Smartphone size={14} />
            </button>
            <button type="button" className={previewDevice === 'tablet' ? 'active' : ''} onClick={() => setPreviewDevice('tablet')} title="Visual de tablet">
              <LayoutTemplate size={14} />
            </button>
          </div>
        </div>
        <div className={`builder-phone ${previewDevice === 'tablet' ? 'tablet' : ''}`} style={{ background: theme.background, color: theme.text }}>
          <div className="builder-phone-top">
            <span style={{ background: `linear-gradient(135deg, ${theme.primary}, ${theme.accent})` }} />
            <strong>{appName || 'Meu App'}</strong>
          </div>
          <div className="builder-phone-screen">
            {elements.length === 0 && (
              <div className="builder-empty-preview">
                <Wand2 size={18} />
                <p>Adicione elementos para montar seu app</p>
              </div>
            )}
            {elements.map(el => (
              <button key={el.id} type="button" className={`builder-selectable ${selected?.id === el.id ? 'active' : ''}`} onClick={() => setSelectedId(el.id)}>
                <BuilderPreviewElement element={el} theme={theme} />
              </button>
            ))}
          </div>
        </div>
        <div className="builder-preview-actions">
          <button type="button" className="btn-secondary builder-export" onClick={onExportHtml}>
            <Code2 size={16} /> Ver HTML gerado
          </button>
          <button type="button" className="btn-secondary builder-export" onClick={() => addElement('spacer')}>
            <Plus size={16} /> Inserir espaco
          </button>
        </div>
      </div>

      <div className="builder-panel">
        <div className="builder-panel-title"><FileEdit size={16} /> Propriedades</div>
        <div className="builder-quick-actions">
          <button type="button" className="builder-icon-btn" onClick={undo} disabled={!canUndo} title="Desfazer (Ctrl+Z)">
            <ArrowRight size={14} style={{ transform: 'rotate(180deg)' }} />
          </button>
          <button type="button" className="builder-icon-btn" onClick={redo} disabled={!canRedo} title="Refazer (Ctrl+Y)">
            <ArrowRight size={14} />
          </button>
          <button type="button" className="builder-text-btn" onClick={resetDefaultLayout} title="Voltar para layout padrao">
            <Wand2 size={14} /> Padrao
          </button>
          <button type="button" className="builder-text-btn danger" onClick={clearLayout} title="Limpar todos os blocos">
            <Trash2 size={14} /> Limpar
          </button>
        </div>
        <div className="builder-panel-title" style={{ marginTop: 14 }}><LayoutTemplate size={16} /> Modelos rapidos</div>
        <div className="builder-starter-grid">
          {BUILDER_STARTERS.map(starter => (
            <button key={starter.id} type="button" className="builder-starter" onClick={() => applyStarter(starter.id)}>
              <strong>{starter.label}</strong>
              <small>{starter.desc}</small>
            </button>
          ))}
        </div>

        {selected ? (
          <>
            <div className="builder-layer-actions">
              <button type="button" onClick={() => moveSelected(-1)}><MoveUp size={15} /></button>
              <button type="button" onClick={() => moveSelected(1)}><MoveDown size={15} /></button>
              <button type="button" onClick={duplicateSelected}><Copy size={15} /></button>
              <button type="button" onClick={removeSelected}><Trash2 size={15} /></button>
            </div>
            {'title' in selected && <Field label="Titulo" value={selected.title} onChange={v => updateSelected({ title: v })} />}
            {'text' in selected && <Field label="Texto" value={selected.text} onChange={v => updateSelected({ text: v })} multiline />}
            {'label' in selected && <Field label="Texto do botao" value={selected.label} onChange={v => updateSelected({ label: v })} />}
            {'url' in selected && <Field label="Link do botao" value={selected.url} onChange={v => updateSelected({ url: v })} />}
            {'imageUrl' in selected && <Field label="URL da imagem" value={selected.imageUrl} onChange={v => updateSelected({ imageUrl: v })} />}
            {'items' in selected && <Field label="Itens da lista" value={selected.items} onChange={v => updateSelected({ items: v })} multiline />}
            {'price' in selected && <Field label="Preco" value={selected.price} onChange={v => updateSelected({ price: v })} />}
            {'phone' in selected && <Field label="Telefone" value={selected.phone} onChange={v => updateSelected({ phone: v })} />}
            {'email' in selected && <Field label="Email" value={selected.email} onChange={v => updateSelected({ email: v })} />}
            {'address' in selected && <Field label="Endereco" value={selected.address} onChange={v => updateSelected({ address: v })} />}
            {'qa' in selected && <Field label="FAQ (pergunta|resposta por linha)" value={selected.qa} onChange={v => updateSelected({ qa: v })} multiline />}
            {'quote' in selected && <Field label="Depoimento" value={selected.quote} onChange={v => updateSelected({ quote: v })} multiline />}
            {'name' in selected && <Field label="Nome" value={selected.name} onChange={v => updateSelected({ name: v })} />}
            {'role' in selected && <Field label="Cargo" value={selected.role} onChange={v => updateSelected({ role: v })} />}
            {'site' in selected && <Field label="Site" value={selected.site} onChange={v => updateSelected({ site: v })} />}
            {'instagram' in selected && <Field label="Instagram" value={selected.instagram} onChange={v => updateSelected({ instagram: v })} />}
            {'whatsapp' in selected && <Field label="WhatsApp" value={selected.whatsapp} onChange={v => updateSelected({ whatsapp: v })} />}
            {'schedule' in selected && <Field label="Horario (linha por item)" value={selected.schedule} onChange={v => updateSelected({ schedule: v })} multiline />}
            {'size' in selected && <Field label="Altura do espaco (px)" type="number" min={8} max={160} step={2} value={selected.size} onChange={v => updateSelected({ size: String(Math.max(8, Number(v) || 8)) })} />}
            <p className="builder-selection-note">
              Bloco {selectedIndex + 1} de {elements.length}: {BUILDER_LABELS[selected.type] || selected.type}
            </p>
          </>
        ) : (
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.86rem' }}>Adicione um elemento para editar.</p>
        )}
      </div>
    </div>
  )
}

// ─── History View ─────────────────────────────────────────────────────────────
function HistoryView({ apiUrl }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await axios.get(`${apiUrl}/history`)
        setItems(res.data)
      } catch {
        toast.error('Erro ao buscar histórico')
      } finally {
        setLoading(false)
      }
    }
    fetchHistory()
  }, [apiUrl])

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
            <a href={`${apiUrl}${item.downloadUrl}`} className="btn-primary" style={{ padding: '8px 16px', fontSize: '0.8rem', borderRadius: 8, textDecoration: 'none' }}>
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
  const [apiBase, setApiBase] = useState(API_URL)
  const [step, setStep] = useState(0)
  const [inputMode, setInputMode] = useState('url')
  const [url, setUrl] = useState('')
  const [htmlCode, setHtmlCode] = useState('')
  const [builderState, setBuilderState] = useState(() => {
    const elements = createDefaultElements()
    return { elements, selectedId: elements[0]?.id || '' }
  })
  const [builderTheme, setBuilderTheme] = useState(BUILDER_THEMES[0])
  const [showGeneratedHtml, setShowGeneratedHtml] = useState(false)
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
  const [decompileJobId, setDecompileJobId] = useState(null)
  const [decompileError, setDecompileError] = useState(null)
  const [decompileZipLink, setDecompileZipLink] = useState(null)
  const [decompileOutputMode, setDecompileOutputMode] = useState('full')

  const isValidUrl = (s) => { try { new URL(s); return true } catch { return false } }
  const builderElements = builderState.elements
  const selectedElementId = builderState.selectedId
  const setBuilderElements = useCallback((updater) => {
    setBuilderState(prev => ({
      ...prev,
      elements: typeof updater === 'function' ? updater(prev.elements) : updater,
    }))
  }, [])
  const setSelectedElementId = useCallback((updater) => {
    setBuilderState(prev => ({
      ...prev,
      selectedId: typeof updater === 'function' ? updater(prev.selectedId) : updater,
    }))
  }, [])
  const builderHtml = generateBuilderHtml(appName || 'Meu App', builderElements, builderTheme)
  const isStep0Valid = inputMode === 'url'
    ? (url.trim() && isValidUrl(url))
    : inputMode === 'html'
      ? htmlCode.trim().length >= 10
      : builderElements.length > 0

  const resolveApiBase = useCallback(async () => {
    const errors = []
    for (const candidate of API_CANDIDATES) {
      for (const timeout of [20000, 70000]) {
        try {
          await axios.get(`${candidate}/health`, { timeout })
          setApiBase(candidate)
          return candidate
        } catch (err) {
          errors.push(`${candidate} [${timeout}ms]: ${err.response?.status || err.message}`)
        }
      }
    }
    throw new Error(`Nenhum backend respondeu em /health. ${errors.join(' | ')}`)
  }, [])

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
      const base = await resolveApiBase()

      const formData = new FormData()
      formData.append('appName', appName)
      formData.append('packageName', packageName || `com.app.${appName.toLowerCase().replace(/\s+/g, '')}`)
      formData.append('mode', inputMode === 'url' ? 'url' : 'html')
      if (inputMode === 'url') formData.append('url', url)
      else formData.append('htmlContent', inputMode === 'builder' ? builderHtml : htmlCode)
      if (iconFile) formData.append('icon', iconFile)

      const res = await axios.post(`${base}/build`, formData, { timeout: 120000 })
      setJobId(res.data.jobId)
    } catch (err) {
      setLoading(false)
      const msg = formatApiError(err, 'iniciar o build')
      setBuildError(msg)
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
    const defaults = createDefaultElements()
    setBuilderState({ elements: defaults, selectedId: defaults[0]?.id || '' }); setBuilderTheme(BUILDER_THEMES[0]); setShowGeneratedHtml(false)
    setDecompileJobId(null); setDecompileError(null); setDecompileZipLink(null)
    setDecompileOutputMode('full')
  }

  const handleDecompile = async (file) => {
    if (!file) return
    setDecompileError(null)
    setDecompileZipLink(null)
    setDecompileJobId(null)
    const selectedMode = ['full', 'java', 'smali'].includes(decompileOutputMode) ? decompileOutputMode : 'full'

    try {
      const base = await resolveApiBase()

      const formData = new FormData()
      formData.append('apk', file)
      formData.append('outputMode', selectedMode)
      const res = await axios.post(`${base}/decompile`, formData, { timeout: 120000 })
      setDecompileJobId(res.data.jobId)
    } catch (err) {
      const msg = formatApiError(err, 'iniciar a descompilacao')
      setDecompileError(msg)
      toast.error(msg)
    }
  }

  if (authLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <div style={{ textAlign: 'center' }}>
          <Loader2 size={36} color="#6366f1" style={{ animation: 'spin 1s linear infinite' }} />
          <p style={{ marginTop: 12, color: 'var(--text-secondary)' }}>Carregando...</p>
        </div>
      </div>
    )
  }

  // ── Steps ──────────────────────────────────────────────────────────────────

  const Step0 = (
    <div className="fade-in-up" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ textAlign: 'center' }}>
        <div className="float-anim" style={{ display: 'inline-block', marginBottom: 16 }}>
          <div style={{
            width: 80, height: 80, borderRadius: 24, margin: '0 auto',
            background: inputMode === 'url'
              ? 'linear-gradient(135deg, #6366f1, #a855f7)'
              : inputMode === 'builder'
                ? 'linear-gradient(135deg, #14b8a6, #6366f1)'
                : 'linear-gradient(135deg, #0ea5e9, #6366f1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 20px 60px rgba(99,102,241,0.4)', transition: 'background 0.4s',
          }}>
            {inputMode === 'url' ? <Globe size={40} color="white" /> : inputMode === 'builder' ? <Wand2 size={40} color="white" /> : <Code2 size={40} color="white" />}
          </div>
        </div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: 8 }}>
          {inputMode === 'url' ? 'URL do seu site' : inputMode === 'builder' ? 'Crie o aplicativo do zero' : 'Seu código HTML'}
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          {inputMode === 'url'
            ? 'Cole o endereço completo do site que virará um app'
            : inputMode === 'builder'
              ? 'Monte telas com elementos prontos, tema, links, produtos, contato e formulario'
              : 'Cole ou escreva o código HTML da sua página'}
        </p>
      </div>

      {inputMode === 'url' ? (
        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8 }}>Endereço do site (URL)</label>
          <input id="url-input" className="input-field" type="url" placeholder="https://meusite.com" value={url} onChange={e => setUrl(e.target.value)} inputMode="url" />
          {url && !isValidUrl(url) && <p style={{ color: 'var(--error)', fontSize: '0.8rem', marginTop: 6 }}>URL inválida. Inclua https://</p>}
        </div>
      ) : inputMode === 'builder' ? (
        <div>
          <VisualBuilder
            appName={appName}
            elements={builderElements}
            setElements={setBuilderElements}
            selectedId={selectedElementId}
            setSelectedId={setSelectedElementId}
            theme={builderTheme}
            setTheme={setBuilderTheme}
            onExportHtml={() => {
              setHtmlCode(builderHtml)
              setShowGeneratedHtml(v => !v)
            }}
          />
          {showGeneratedHtml && (
            <div style={{ marginTop: 14 }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8 }}>HTML gerado pelo criador</label>
              <HtmlEditor value={builderHtml} onChange={setHtmlCode} />
            </div>
          )}
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
        <button id="generate-btn" className="btn-primary" style={{ padding: '14px', flex: 1 }} onClick={() => { setStep(3); handleBuild() }} disabled={loading}>
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {loading ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <Zap size={18} />}
            {loading ? 'Iniciando...' : 'Gerar Meu App!'}
          </span>
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
              ['Tipo', inputMode === 'url' ? 'Site (URL)' : inputMode === 'builder' ? 'Criador do Zero' : 'HTML Embutido'],
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
          onComplete={handleBuildComplete}
          onError={handleBuildError}
          apiUrl={apiBase}
        />
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  const stepsEl = [Step0, Step1, Step2, Step3]
  const isBuilderStep = mainTab === 'build' && step === 0 && inputMode === 'builder'
  const headerContextLabel = mainTab === 'build' ? 'URL ou HTML → APK' : 'Análise APK'

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Toaster position="top-center" toastOptions={{
        style: { background: '#1e1b4b', color: '#f8fafc', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 12, fontFamily: 'Outfit, sans-serif' },
      }} />

      <header className="app-header">
        <div className="app-brand">
          <div className="app-brand-mark">
            <Smartphone size={20} color="white" />
          </div>
          <span className="app-brand-name">Web2<span className="gradient-text">APK</span></span>
        </div>
        <div className="app-header-title">
          Transforme seu site em um <span className="gradient-text">App Android</span>
        </div>
        <div className="app-header-actions">
          <div className="header-mode-switch">
            <button
              onClick={() => { reset(); setMainTab('build') }}
              className={`top-mode-btn ${mainTab === 'build' ? 'active build' : ''}`}
            >
              <Wand2 size={16} /> Gerador
            </button>
            <button
              onClick={() => { reset(); setMainTab('decompile') }}
              className={`top-mode-btn ${mainTab === 'decompile' ? 'active decompile' : ''}`}
            >
              <Search size={16} /> Descompilador
            </button>
          </div>
          {mainTab === 'build' && step === 0 && (
            <div className="header-builder-toggle">
              <ModeToggle mode={inputMode} onChange={setInputMode} compact />
            </div>
          )}
          <div className="badge app-header-context">
            {mainTab === 'build' ? <Zap size={12} /> : <Package size={12} />}
            {headerContextLabel}
          </div>
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

      <main style={{ flex: 1, padding: isBuilderStep ? '10px 12px 22px' : '10px 16px 28px', maxWidth: isBuilderStep ? 'min(1520px, calc(100vw - 20px))' : 540, margin: '0 auto', width: '100%' }}>
        {mainTab === 'build' && (
          <div className={`glass-card fade-in-up fade-in-up-delay-3 ${isBuilderStep ? 'builder-shell-card' : ''}`} style={{ padding: step === 0 ? '16px 14px' : '28px 24px' }}>
            <div style={{ marginBottom: step === 0 ? 14 : 24 }}>
              <StepIndicator current={step} />
              <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: 10 }}>
                Passo {step + 1} de {STEPS.length} — {STEPS[step]}
              </p>
            </div>
            {stepsEl[step]}
          </div>
        )}

        {mainTab === 'decompile' && (
          <div className="glass-card fade-in-up fade-in-up-delay-3" style={{ padding: '20px 18px' }}>
            {!decompileJobId && !decompileZipLink && (
              <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div style={{ width: 64, height: 64, borderRadius: 18, background: 'linear-gradient(135deg, #ec4899, #f43f5e)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', boxShadow: '0 14px 40px rgba(236,72,153,0.35)' }}>
                  <Package size={30} color="white" />
                </div>
                <div>
                  <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: 8 }}>Descompilar APK</h2>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.84rem' }}>Escolha o formato de saída e envie um APK para extrair</p>
                </div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                  gap: 8,
                  width: '100%',
                }}>
                  {DECOMPILE_MODE_OPTIONS.map((opt) => {
                    const selected = decompileOutputMode === opt.id
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setDecompileOutputMode(opt.id)}
                        style={{
                          border: selected ? '1px solid rgba(236,72,153,0.55)' : '1px solid var(--border)',
                          background: selected ? 'rgba(236,72,153,0.16)' : 'rgba(255,255,255,0.03)',
                          borderRadius: 10,
                          padding: '10px 8px',
                          color: selected ? '#fda4af' : 'var(--text-secondary)',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 4,
                          minHeight: 76,
                          justifyContent: 'center',
                        }}
                      >
                        <span style={{ fontWeight: 700, fontSize: '0.82rem' }}>{opt.label}</span>
                        <span style={{ fontSize: '0.72rem', lineHeight: 1.3 }}>{opt.desc}</span>
                      </button>
                    )
                  })}
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
                {decompileError && (
                  <div className="glass-card-sm" style={{ padding: 14, textAlign: 'left' }}>
                    <p style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#fca5a5', lineHeight: 1.6, wordBreak: 'break-word' }}>{decompileError}</p>
                  </div>
                )}
              </div>
            )}

            {decompileJobId && !decompileZipLink && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div style={{ textAlign: 'center' }}>
                  <Loader2 size={40} color="#ec4899" style={{ animation: 'spin 1s linear infinite', marginBottom: 12 }} />
                  <h2 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Extraindo dados...</h2>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', marginTop: 8 }}>
                    Modo: {DECOMPILE_MODE_OPTIONS.find(opt => opt.id === decompileOutputMode)?.label || 'Completo'}
                  </p>
                </div>
                <BuildConsole 
                  jobId={decompileJobId} 
                  onComplete={(link) => { setDecompileZipLink(link); toast.success('Extração concluída!') }}
                  onError={(msg) => { setDecompileError(msg); setDecompileJobId(null) }}
                  apiUrl={apiBase}
                />
              </div>
            )}

            {decompileZipLink && (
              <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(34,197,94,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid rgba(34,197,94,0.3)', margin: '0 auto' }}>
                  <Download size={30} color="#22c55e" />
                </div>
                <div>
                  <h2 style={{ fontSize: '1.16rem', fontWeight: 700 }}>Pronto para Download!</h2>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.84rem' }}>
                    Saída: {DECOMPILE_MODE_OPTIONS.find(opt => opt.id === decompileOutputMode)?.label || 'Completo'}
                  </p>
                </div>
                <a href={decompileZipLink} style={{ textDecoration: 'none' }}>
                  <button className="btn-primary" style={{ background: '#22c55e', width: '100%', padding: 14 }}>
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}><FileText size={20} /> Baixar Código Fonte (.zip)</span>
                  </button>
                </a>
                <button className="btn-secondary" style={{ width: '100%' }} onClick={reset}>Analisar outro APK</button>
              </div>
            )}
          </div>
        )}

        {mainTab === 'history' && (
          <HistoryView apiUrl={apiBase} />
        )}

        {mainTab === 'build' && step === 0 && inputMode !== 'builder' && (
          <div className="feature-slider-wrap" aria-label="Recursos do gerador">
            <div className="feature-slider-track">
              {[...FEATURE_SLIDES, ...FEATURE_SLIDES].map((item, index) => (
                <div key={`${item.title}-${index}`} className="feature-slide">
                  <FeatureCard
                    icon={item.icon}
                    color={item.color}
                    title={item.title}
                    desc={item.desc}
                    compact
                  />
                </div>
              ))}
            </div>
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
