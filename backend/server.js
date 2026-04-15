const express = require('express')
const cors = require('cors')
const multer = require('multer')
const path = require('path')
const fs = require('fs-extra')
const { spawn } = require('child_process')
const { v4: uuidv4 } = require('uuid')
const EventEmitter = require('events')
const archiver = require('archiver')
const { Octokit } = require("@octokit/rest")
const { Base64 } = require("js-base64")
const AdmZip = require('adm-zip')
const { initUsersFile, registerUser, validateLogin, generateToken, authMiddleware, verifyToken } = require('./auth')
const history = require('./history')

const app = express()
const PORT = process.env.PORT || 3001

// CORS — allow any origin (Vercel, local, mobile)
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}))
app.use(express.json({ limit: '50mb' }))

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB
})

const TEMPLATE_DIR = path.join(__dirname, 'android-template')
const BUILDS_DIR = path.join(__dirname, 'builds')
fs.ensureDirSync(BUILDS_DIR)

// ─── GitHub Config ──────────────────────────────────────────────────────────
const GITHUB_TOKEN = process.env.GITHUB_TOKEN
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'GilbertoMF'
const GITHUB_REPO = process.env.GITHUB_REPO || 'meu-gerador-web2apk'

const octokit = GITHUB_TOKEN ? new Octokit({ auth: GITHUB_TOKEN }) : null
if (octokit) console.log(`🚀 Modo CLOUD ativo (GitHub: ${GITHUB_OWNER}/${GITHUB_REPO})`)

// ─── Job Store ───────────────────────────────────────────────────────────────
const jobs = new Map()

function scheduleCleanup(jobId, buildDir, delay = 20 * 60 * 1000) {
  setTimeout(async () => {
    if (buildDir) await fs.remove(buildDir).catch(() => {})
    jobs.delete(jobId)
    console.log(`[${jobId}] Cleaned up`)
  }, delay)
}

// ─── Gradle task → progress % mapping ────────────────────────────────────────
const TASK_PROGRESS = {
  'preBuild': 22,
  'preDebugBuild': 24,
  'compileDebugAidl': 26,
  'generateDebugBuildConfig': 28,
  'checkDebugAarMetadata': 29,
  'generateDebugResValues': 30,
  'generateDebugResources': 32,
  'mergeDebugResources': 36,
  'processDebugMainManifest': 40,
  'processDebugManifest': 42,
  'processDebugManifestForPackage': 44,
  'processDebugResources': 48,
  'compileDebugJavaWithJavac': 56,
  'compileDebugSources': 60,
  'mergeDebugShaders': 62,
  'generateDebugAssets': 64,
  'mergeDebugAssets': 66,
  'mergeDebugJniLibFolders': 68,
  'validateSigningDebug': 70,
  'writeDebugAppMetadata': 72,
  'dexBuilderDebug': 76,
  'mergeLibDexDebug': 79,
  'mergeProjectDexDebug': 82,
  'mergeDebugNativeLibs': 84,
  'mergeDebugJavaResource': 87,
  'packageDebug': 92,
  'createDebugApkListingFileRedirect': 95,
  'assembleDebug': 97,
}

function parseGradleLine(line) {
  if (line.startsWith('> Task :app:')) return { level: 'task', text: line }
  if (line.includes('BUILD SUCCESSFUL')) return { level: 'success', text: line }
  if (line.includes('BUILD FAILED') || line.includes('FAILURE:')) return { level: 'error', text: line }
  if (/\berror:/i.test(line)) return { level: 'error', text: line }
  if (/\bwarning:/i.test(line) || line.startsWith('w:')) return { level: 'warn', text: line }
  if (line.startsWith('> ') || line.startsWith('  ')) return { level: 'detail', text: line }
  return { level: 'info', text: line }
}

// ─── Initialize auth ─────────────────────────────────────────────────────────
initUsersFile().catch(console.error)

// ─── Health ──────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', version: '2.0.0' }))

// ─── Auth Routes ─────────────────────────────────────────────────────────────
// POST /auth/register - Register new user
app.post('/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body
    
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password and name are required' })
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' })
    }
    
    const user = await registerUser(email, password, name)
    const token = generateToken(user)
    
    res.json({ user, token })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// POST /auth/login - Login user
app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' })
    }
    
    const user = await validateLogin(email, password)
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }
    
    const token = generateToken(user)
    res.json({ user, token })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /auth/me - Get current user (protected)
app.get('/auth/me', authMiddleware, (req, res) => {
  res.json({ user: req.user })
})

// ─── POST /build — start async build, return jobId immediately ───────────────
app.post('/build', upload.single('icon'), async (req, res) => {
  const jobId = uuidv4()
  const emitter = new EventEmitter()
  emitter.setMaxListeners(30)

  // Optional authentication for history
  const authHeader = req.headers.authorization
  let userId = null
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const decoded = verifyToken(authHeader.substring(7))
    if (decoded) userId = decoded.userId
  }

  const job = { emitter, status: 'building', apkPath: null, buildDir: null, appName: req.body.appName || 'App', userId, eventBuffer: [] }
  
  if (userId) {
    await history.addBuildToHistory(userId, {
      id: jobId,
      appName: job.appName,
      packageName: req.body.packageName,
      mode: req.body.mode,
      url: req.body.url,
      type: 'build',
      status: 'building'
    })
  }

  // Buffer every event so SSE can replay them if client connects late
  emitter.on('event', (data) => { 
    job.eventBuffer.push(data)
    if (userId && data.type === 'done') {
      history.updateBuildStatus(jobId, 'done', { 
        downloadUrl: data.downloadUrl,
        apkSize: data.apkSize 
      }).catch(console.error)
    } else if (userId && data.type === 'error') {
      history.updateBuildStatus(jobId, 'error').catch(console.error)
    }
  })
  
  jobs.set(jobId, job)
  res.json({ jobId })

  if (octokit) {
    runCloudBuild(jobId, req.body, req.file, emitter).catch(err => {
      const job = jobs.get(jobId)
      if (job) job.status = 'error'
      emitter.emit('event', { type: 'error', message: `Cloud Error: ${err.message}` })
    })
  } else {
    runBuild(jobId, req.body, req.file, emitter).catch(err => {
      const job = jobs.get(jobId)
      if (job) job.status = 'error'
      emitter.emit('event', { type: 'error', message: err.message })
    })
  }
})

// ─── GET /build-events/:jobId — SSE stream ───────────────────────────────────
app.get('/build-events/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId)
  if (!job) return res.status(404).json({ error: 'Job not found' })

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.flushHeaders()

  const send = (data) => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify(data)}\n\n`)
  }

  // Replay any events that happened before SSE connected (fixes race condition)
  if (job.eventBuffer && job.eventBuffer.length > 0) {
    job.eventBuffer.forEach(send)
  }

  const heartbeat = setInterval(() => {
    if (!res.writableEnded) res.write(': ping\n\n')
    else clearInterval(heartbeat)
  }, 20000)

  job.emitter.on('event', send)
  req.on('close', () => {
    job.emitter.off('event', send)
    clearInterval(heartbeat)
  })
})

// ─── GET /history — fetch user build history ────────────────────────────────
app.get('/history', authMiddleware, async (req, res) => {
  try {
    const userHistory = await history.getUserHistory(req.user.userId)
    res.json(userHistory)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── POST /decompile — start async extraction ────────────────────────────────
app.post('/decompile', upload.single('apk'), async (req, res) => {
  const jobId = uuidv4()
  const emitter = new EventEmitter()
  emitter.setMaxListeners(30)
  
  // Optional authentication for history
  const authHeader = req.headers.authorization
  let userId = null
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const decoded = verifyToken(authHeader.substring(7))
    if (decoded) userId = decoded.userId
  }

  const job = { emitter, status: 'decompiling', zipPath: null, buildDir: null, apkName: req.file?.originalname, eventBuffer: [], userId }

  if (userId) {
    await history.addBuildToHistory(userId, {
      id: jobId,
      appName: req.file?.originalname || 'Analysis',
      type: 'decompile',
      status: 'analyzing'
    })
  }

  emitter.on('event', (data) => { 
    job.eventBuffer.push(data)
    if (userId && data.type === 'done') {
      history.updateBuildStatus(jobId, 'done', { downloadUrl: data.downloadUrl }).catch(console.error)
    } else if (userId && data.type === 'error') {
      history.updateBuildStatus(jobId, 'error').catch(console.error)
    }
  })

  jobs.set(jobId, job)
  res.json({ jobId })

  if (octokit) {
    runCloudDecompile(jobId, req.file, emitter).catch(err => {
      const job = jobs.get(jobId)
      if (job) job.status = 'error'
      emitter.emit('event', { type: 'error', message: `Cloud Error: ${err.message}` })
    })
  } else {
    runDecompile(jobId, req.file, emitter).catch(err => {
      const job = jobs.get(jobId)
      if (job) job.status = 'error'
      emitter.emit('event', { type: 'error', message: err.message })
    })
  }
})

// ─── GET /download-zip/:jobId — serve zip ────────────────────────────────────
app.get('/download-zip/:jobId', async (req, res) => {
  const job = jobs.get(req.params.jobId)
  if (!job || !job.zipPath) return res.status(404).json({ error: 'Zip not ready' })

  res.setHeader('Content-Type', 'application/zip')
  res.setHeader('Content-Disposition', `attachment; filename="source_${job.apkName || 'app'}.zip"`)

  const stream = fs.createReadStream(job.zipPath)
  stream.pipe(res)
  stream.on('error', () => res.end())
})

// ─── GET /download/:jobId — serve APK ────────────────────────────────────────
app.get('/download/:jobId', async (req, res) => {
  const job = jobs.get(req.params.jobId)
  if (!job || !job.apkPath) return res.status(404).json({ error: 'APK not ready' })

  const safeName = (job.appName || 'app').replace(/[^a-zA-Z0-9]/g, '_')
  res.setHeader('Content-Type', 'application/vnd.android.package-archive')
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}.apk"`)

  const stream = fs.createReadStream(job.apkPath)
  stream.pipe(res)
  stream.on('error', () => res.end())
})

// ─── Main build runner ────────────────────────────────────────────────────────
async function runBuild(jobId, body, file, emitter) {
  const buildDir = path.join(BUILDS_DIR, jobId)
  const job = jobs.get(jobId)
  if (job) job.buildDir = buildDir

  const emit = (data) => emitter.emit('event', data)
  const phase = (name, step) => emit({ type: 'phase', name, step })
  const phaseDone = (step, ms) => emit({ type: 'phase_done', step, duration: ms })
  const fileEv = (filePath, action) => emit({ type: 'file', path: filePath, action })
  const log = (text, level = 'info') => emit({ type: 'log', text, level })
  const progress = (v) => emit({ type: 'progress', value: v })

  const { url, appName, packageName, htmlContent, mode } = body

  if (!appName) throw new Error('Nome do app é obrigatório.')
  const isHtmlMode = mode === 'html' || (htmlContent && htmlContent.trim().length > 0)
  if (!isHtmlMode && !url) throw new Error('URL é obrigatória no modo URL.')
  if (!isHtmlMode) { try { new URL(url) } catch { throw new Error('URL inválida.') } }
  if (isHtmlMode && (!htmlContent || htmlContent.trim().length < 10)) throw new Error('HTML muito pequeno.')

  const safePackage = (packageName || `com.appforge.${appName.toLowerCase().replace(/[^a-z0-9]/g, '')}`)
    .replace(/[^a-z0-9.]/gi, '')
  const finalUrl = isHtmlMode ? 'file:///android_asset/index.html' : url

  if (job) job.appName = appName

  // ── PHASE 1: Copy template
  let t = Date.now()
  phase('Copiando template do projeto', 1)
  progress(2)
  log('Iniciando cópia do template Android...')

  await fs.copy(TEMPLATE_DIR, buildDir)

  fileEv('app/', 'copy')
  fileEv('app/src/main/', 'copy')
  fileEv('app/src/main/java/', 'copy')
  fileEv('app/src/main/res/', 'copy')
  fileEv('gradle/wrapper/', 'copy')
  fileEv('gradlew.bat', 'copy')
  fileEv('settings.gradle.kts', 'copy')
  fileEv('build.gradle.kts', 'copy')

  log(`Template copiado para: builds/${jobId.slice(0, 8)}...`)
  phaseDone(1, Date.now() - t)
  progress(10)

  // ── PHASE 2: HTML mode
  if (isHtmlMode) {
    t = Date.now()
    phase('Salvando HTML no projeto', 2)
    const assetsDir = path.join(buildDir, 'app', 'src', 'main', 'assets')
    await fs.ensureDir(assetsDir)
    await fs.writeFile(path.join(assetsDir, 'index.html'), htmlContent, 'utf-8')
    fileEv('app/src/main/assets/', 'create')
    fileEv('app/src/main/assets/index.html', 'create')
    log(`✅ index.html salvo (${(htmlContent.length / 1024).toFixed(1)} KB)`)
    phaseDone(2, Date.now() - t)
    progress(16)
  } else {
    emit({ type: 'phase_skip', step: 2 })
    progress(16)
  }

  // ── PHASE 3: Patch files
  t = Date.now()
  phase('Configurando arquivos do app', 3)

  const stringsPath = path.join(buildDir, 'app', 'src', 'main', 'res', 'values', 'strings.xml')
  let stringsXml = await fs.readFile(stringsPath, 'utf-8')
  stringsXml = stringsXml
    .replace(/{{APP_NAME}}/g, appName.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'))
    .replace(/{{APP_URL}}/g, finalUrl)
  await fs.writeFile(stringsPath, stringsXml)
  fileEv('app/src/main/res/values/strings.xml', 'modify')
  log(`  app_name → "${appName}"`)
  log(`  app_url → "${finalUrl}"`)

  const manifestPath = path.join(buildDir, 'app', 'src', 'main', 'AndroidManifest.xml')
  let manifest = await fs.readFile(manifestPath, 'utf-8')
  manifest = manifest.replace(/{{PACKAGE_NAME}}/g, safePackage)
  await fs.writeFile(manifestPath, manifest)
  fileEv('app/src/main/AndroidManifest.xml', 'modify')
  log(`  package → "${safePackage}"`)

  const gradlePath = path.join(buildDir, 'app', 'build.gradle.kts')
  let gradle = await fs.readFile(gradlePath, 'utf-8')
  gradle = gradle.replace(/{{PACKAGE_NAME}}/g, safePackage)
  await fs.writeFile(gradlePath, gradle)
  fileEv('app/build.gradle.kts', 'modify')

  if (file) {
    const ext = path.extname(file.originalname) || '.png'
    for (const dir of ['mipmap-mdpi','mipmap-hdpi','mipmap-xhdpi','mipmap-xxhdpi','mipmap-xxxhdpi']) {
      const iconDir = path.join(buildDir, 'app', 'src', 'main', 'res', dir)
      await fs.ensureDir(iconDir)
      await fs.writeFile(path.join(iconDir, `ic_launcher${ext}`), file.buffer)
      await fs.writeFile(path.join(iconDir, `ic_launcher_round${ext}`), file.buffer)
      fileEv(`app/src/main/res/${dir}/ic_launcher${ext}`, 'create')
    }
    log(`  ícone → ${file.originalname} (${(file.buffer.length / 1024).toFixed(1)} KB)`)
  }

  // Refatorar pacotes Java para o novo pacote (White-label)
  log('  Refatorando pacotes Java...')
  const oldPackageBase = path.join(buildDir, 'app', 'src', 'main', 'java', 'com', 'appforge')
  const oldPackagePath = path.join(oldPackageBase, 'webview')
  const newPackagePath = path.join(buildDir, 'app', 'src', 'main', 'java', ...safePackage.split('.'))
  
  await fs.ensureDir(newPackagePath)
  const javaFiles = await fs.readdir(oldPackagePath)
  for (const f of javaFiles) {
    if (f.endsWith('.java')) {
      const filePath = path.join(oldPackagePath, f)
      let content = await fs.readFile(filePath, 'utf-8')
      content = content.replace(/package com\.appforge\.webview/g, `package ${safePackage}`)
      content = content.replace(/import com\.appforge\.webview\.R/g, `import ${safePackage}.R`)
      
      const newPath = path.join(newPackagePath, f)
      await fs.writeFile(newPath, content)
      fileEv(newPath.replace(buildDir + path.sep, '').replace(/\\/g, '/'), 'create')
    }
  }
  await fs.remove(oldPackageBase)
  log(`  pacote java movido para → "${safePackage.replace(/\./g, '/')}"`)

  phaseDone(3, Date.now() - t)
  progress(20)

  // ── PHASE 4: Gradle build
  t = Date.now()
  phase('Compilando com Gradle', 4)

  const gradlewBat = path.join(buildDir, 'gradlew.bat')
  const gradlewUnix = path.join(buildDir, 'gradlew')
  if (fs.existsSync(gradlewUnix)) await fs.chmod(gradlewUnix, '755')

  const gradlewPath = process.platform === 'win32'
    ? (fs.existsSync(gradlewBat) ? gradlewBat : null)
    : (fs.existsSync(gradlewUnix) ? gradlewUnix : null)

  if (!gradlewPath) throw new Error('Gradle wrapper não encontrado.')

  const gradleCmd = `"${gradlewPath}" assembleDebug --no-daemon`
  log(`Executando: ${gradleCmd}`)

  await new Promise((resolve, reject) => {
    const proc = spawn(gradleCmd, [], {
      shell: true,
      cwd: buildDir,
      env: { ...process.env },
    })

    let lastP = 20

    const handleLine = (line, isErr = false) => {
      if (!line.trim()) return
      const parsed = parseGradleLine(line)
      log(parsed.text, isErr && parsed.level === 'info' ? 'detail' : parsed.level)

      if (line.startsWith('> Task :app:')) {
        const taskName = line.replace('> Task :app:', '').replace(' UP-TO-DATE', '').replace(' SKIPPED', '').trim()
        const p = TASK_PROGRESS[taskName]
        if (p && p > lastP) { lastP = p; progress(p) }
      }
    }

    let stdoutBuf = ''
    let stderrBuf = ''

    proc.stdout.on('data', (chunk) => {
      stdoutBuf += chunk.toString()
      const lines = stdoutBuf.split(/\r?\n/)
      stdoutBuf = lines.pop()
      lines.forEach(l => handleLine(l))
    })

    proc.stderr.on('data', (chunk) => {
      stderrBuf += chunk.toString()
      const lines = stderrBuf.split(/\r?\n/)
      stderrBuf = lines.pop()
      lines.forEach(l => handleLine(l, true))
    })

    proc.on('close', (code) => {
      if (stdoutBuf.trim()) handleLine(stdoutBuf)
      if (stderrBuf.trim()) handleLine(stderrBuf, true)
      if (code === 0) {
        log('✅ BUILD SUCCESSFUL', 'success')
        resolve()
      } else {
        reject(new Error(`Gradle saiu com código ${code}. Verifique o log acima.`))
      }
    })

    proc.on('error', reject)
  })

  phaseDone(4, Date.now() - t)
  progress(98)

  // ── PHASE 5: Locate APK
  t = Date.now()
  phase('Empacotando o APK', 5)

  const apkDir = path.join(buildDir, 'app', 'build', 'outputs', 'apk', 'debug')
  const apkFiles = (await fs.readdir(apkDir)).filter(f => f.endsWith('.apk'))
  if (apkFiles.length === 0) throw new Error('APK não encontrado após compilação.')

  const apkPath = path.join(apkDir, apkFiles[0])
  const stats = await fs.stat(apkPath)
  const sizeMB = (stats.size / 1024 / 1024).toFixed(2)

  fileEv(`app/build/outputs/apk/debug/${apkFiles[0]}`, 'create')
  log(`📦 APK gerado: ${apkFiles[0]} (${sizeMB} MB)`, 'success')

  if (job) { job.status = 'done'; job.apkPath = apkPath }
  phaseDone(5, Date.now() - t)
  progress(100)

  emit({
    type: 'done',
    downloadUrl: `/download/${jobId}`,
    appName,
    apkName: apkFiles[0],
    apkSize: stats.size,
  })

  scheduleCleanup(jobId, buildDir)
}

// ─── Decompile runner ────────────────────────────────────────────────────────
async function runDecompile(jobId, file, emitter) {
  if (!file) throw new Error('Arquivo APK não enviado.')
  
  const buildDir = path.join(BUILDS_DIR, jobId)
  const apkPath = path.join(buildDir, 'app.apk')
  const outDir = path.join(buildDir, 'extracted')
  const zipPath = path.join(buildDir, 'source.zip')
  
  const job = jobs.get(jobId)
  if (job) job.buildDir = buildDir

  const emit = (data) => emitter.emit('event', data)
  const log = (text, level = 'info') => emit({ type: 'log', text, level })
  const progress = (v) => emit({ type: 'progress', value: v })

  await fs.ensureDir(buildDir)
  await fs.writeFile(apkPath, file.buffer)
  
  log(`Recebido: ${file.originalname} (${(file.buffer.length / 1024 / 1024).toFixed(2)} MB)`)
  progress(10)

  const apktoolJar = path.join(__dirname, 'apktool_3.0.1.jar')
  const cmd = `java -jar "${apktoolJar}" d "${apkPath}" -o "${outDir}" -f`
  
  log('Iniciando descompilação com Apktool...')
  log(`Executando: ${cmd}`, 'detail')

  await new Promise((resolve, reject) => {
    const proc = spawn(cmd, [], { shell: true })
    
    proc.stdout.on('data', (d) => {
      const line = d.toString().trim()
      if (line) log(line, 'info')
      if (line.includes('Extracting')) progress(30)
      if (line.includes('Decoding')) progress(50)
      if (line.includes('Copying assets')) progress(70)
    })
    
    proc.stderr.on('data', (d) => log(d.toString().trim(), 'warn'))
    
    proc.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`Apktool falhou com código ${code}`))
    })
  })

  progress(85)
  log('Compactando arquivos extraídos...')

  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath)
    const archive = archiver('zip', { zlib: { level: 9 } })
    
    output.on('close', resolve)
    archive.on('error', reject)
    
    archive.pipe(output)
    archive.directory(outDir, false)
    archive.finalize()
  })

  log('✅ Descompilação concluída!', 'success')
  if (job) { 
    job.status = 'done'
    job.zipPath = zipPath 
  }
  progress(100)
  
  emit({
    type: 'done',
    downloadUrl: `/download-zip/${jobId}`,
    apkName: file.originalname
  })

  scheduleCleanup(jobId, buildDir)
}

// ─── Cloud Build Relay ───────────────────────────────────────────────────────
async function runCloudBuild(jobId, body, file, emitter) {
  const emit = (data) => emitter.emit('event', data)
  const log = (text, level = 'info') => emit({ type: 'log', text, level })
  const progress = (v) => emit({ type: 'progress', value: v })
  const phase = (name, step) => emit({ type: 'phase', name, step })
  const phaseDone = (step, ms) => emit({ type: 'phase_done', step, duration: ms })

  const job = jobs.get(jobId)
  if (job) job.appName = body.appName

  log('☁️ Iniciando Build em modo Cloud (GitHub API)...')
  phase('Conectando ao GitHub', 1)
  progress(5)

  const config = {
    appName: body.appName,
    url: body.mode === 'html' ? 'file:///android_asset/index.html' : body.url,
    packageName: body.packageName || `com.appforge.${body.appName.toLowerCase().replace(/[^a-z0-9]/g, '')}`
  }

  // 1. Get current SHA if exists
  let sha;
  try {
    const { data } = await octokit.repos.getContent({
      owner: GITHUB_OWNER, repo: GITHUB_REPO, path: 'app-config.json',
    })
    sha = data.sha
  } catch (e) {}

  // 2. Update config
  const { data: commitData } = await octokit.repos.createOrUpdateFileContents({
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
    path: 'app-config.json',
    message: `Build: ${body.appName}`,
    content: Base64.encode(JSON.stringify(config, null, 2)),
    sha
  })

  const commitSha = commitData.commit.sha
  log(`✅ Configuração enviada! Commit: ${commitSha.slice(0, 7)}`, 'success')
  phaseDone(1, 0)
  progress(15)

  // 3. Wait for Run to appear
  phase('Aguardando Runner local', 2)
  log('Esperando o GitHub Actions iniciar o workflow...')
  
  let runId = null
  for (let i = 0; i < 20; i++) {
    const { data: runs } = await octokit.actions.listWorkflowRunsForRepo({
      owner: GITHUB_OWNER, repo: GITHUB_REPO, head_sha: commitSha
    })
    if (runs.workflow_runs.length > 0) {
      runId = runs.workflow_runs[0].id
      break
    }
    await new Promise(r => setTimeout(r, 3000))
  }

  if (!runId) throw new Error('Tempo esgotado aguardando o GitHub iniciar o build.')
  log(`🚀 Build iniciado! Run: ${runId}`)
  phaseDone(2, 0)
  progress(25)

  // 4. Poll Status
  phase('Compilando com Gradle', 4) // Reuse phase 4 from local build
  log('O GitHub está compilando o seu APK agora...')
  
  let result = null
  let startTime = Date.now()
  
  while (true) {
    const { data: run } = await octokit.actions.getWorkflowRun({
      owner: GITHUB_OWNER, repo: GITHUB_REPO, run_id: runId
    })

    if (run.status === 'completed') {
      result = run.conclusion
      break
    }

    // Fake progress based on time (GitHub builds take ~2-3 mins usually)
    const elapsed = (Date.now() - startTime) / 1000
    const fakeP = Math.min(25 + (elapsed / 120) * 60, 85)
    progress(Math.round(fakeP))
    
    await new Promise(r => setTimeout(r, 5000))
  }

  if (result !== 'success') throw new Error(`Build no GitHub falhou com status: ${result}`)
  log('✅ Compilação no GitHub finalizada!', 'success')
  phaseDone(4, Date.now() - startTime)
  progress(90)

  // 5. Download Artifact
  phase('Baixando APK Final', 5)
  log('Trazendo o APK do GitHub para o servidor...')
  
  const { data: artifacts } = await octokit.actions.listWorkflowRunArtifacts({
    owner: GITHUB_OWNER, repo: GITHUB_REPO, run_id: runId
  })

  const artifact = artifacts.artifacts.find(a => a.name === 'app-debug' || a.name === 'app-release')
  if (!artifact) throw new Error('APK não encontrado nos artefatos do GitHub.')

  const { data: artifactZip } = await octokit.actions.downloadArtifact({
    owner: GITHUB_OWNER, repo: GITHUB_REPO, artifact_id: artifact.id, archive_format: 'zip'
  })

  // Extract Zip
  const zip = new AdmZip(Buffer.from(artifactZip))
  const zipEntries = zip.getEntries()
  const apkEntry = zipEntries.find(e => e.entryName.endsWith('.apk'))
  
  if (!apkEntry) throw new Error('APK não encontrado dentro do ZIP do artefato.')

  const buildDir = path.join(BUILDS_DIR, jobId)
  await fs.ensureDir(buildDir)
  const apkPath = path.join(buildDir, apkEntry.entryName)
  await fs.writeFile(apkPath, apkEntry.getData())

  const stats = await fs.stat(apkPath)
  if (job) { job.status = 'done'; job.apkPath = apkPath; job.buildDir = buildDir }
  
  log(`📦 APK recebido e pronto: ${apkEntry.entryName} (${(stats.size/1024/1024).toFixed(2)} MB)`, 'success')
  phaseDone(5, 0)
  progress(100)

  emit({
    type: 'done',
    downloadUrl: `/download/${jobId}`,
    appName: body.appName,
    apkName: apkEntry.entryName,
    apkSize: stats.size,
  })

  scheduleCleanup(jobId, buildDir)
}

// ─── Cloud Decompile Relay ───────────────────────────────────────────────────
async function runCloudDecompile(jobId, file, emitter) {
  const emit = (data) => emitter.emit('event', data)
  const log = (text, level = 'info') => emit({ type: 'log', text, level })
  const progress = (v) => emit({ type: 'progress', value: v })
  
  if (!file) throw new Error('Cade o APK?')
  
  log(`☁️ Enviando APK para descompilação na nuvem: ${file.originalname}`)
  progress(10)
  
  const filePath = `analyze/${Date.now()}_${file.originalname}`
  
  const { data: commitData } = await octokit.rest.repos.createOrUpdateFileContents({
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
    path: filePath,
    message: `Decompile: ${file.originalname}`,
    content: file.buffer.toString('base64') 
  })

  const commitSha = commitData.commit.sha
  log('✅ APK enviado! Aguardando análise no GitHub...')
  progress(20)

  // Wait for Run
  let runId = null
  for (let i = 0; i < 20; i++) {
    const { data: runs } = await octokit.actions.listWorkflowRunsForRepo({
      owner: GITHUB_OWNER, repo: GITHUB_REPO, head_sha: commitSha
    })
    if (runs.workflow_runs.length > 0) {
      runId = runs.workflow_runs[0].id
      break
    }
    await new Promise(r => setTimeout(r, 3000))
  }

  if (!runId) throw new Error('Tempo esgotado aguardando análise no GitHub.')
  
  // Poll
  while (true) {
    const { data: run } = await octokit.actions.getWorkflowRun({
      owner: GITHUB_OWNER, repo: GITHUB_REPO, run_id: runId
    })
    if (run.status === 'completed') {
      if (run.conclusion !== 'success') throw new Error(`Análise falhou no GitHub (${run.conclusion})`)
      break
    }
    await new Promise(r => setTimeout(r, 5000))
  }

  log('✅ Análise concluída! Baixando resultado...')
  progress(80)

  // Download ZIP
  const { data: artifacts } = await octokit.actions.listWorkflowRunArtifacts({
    owner: GITHUB_OWNER, repo: GITHUB_REPO, run_id: runId
  })

  const artifact = artifacts.artifacts.find(a => a.name === 'source-zip' || a.name.includes('source'))
  if (!artifact) throw new Error('Resultado da análise não encontrado.')

  const { data: zipBuffer } = await octokit.actions.downloadArtifact({
    owner: GITHUB_OWNER, repo: GITHUB_REPO, artifact_id: artifact.id, archive_format: 'zip'
  })

  // GitHub sends artifact as a zip containing the file. But for decompile, 
  // the workflow likely produces a zip file already.
  // We need to extract our source.zip from GitHub's artifact zip.
  const zip = new AdmZip(Buffer.from(zipBuffer))
  const sourceZipEntry = zip.getEntries().find(e => e.entryName.endsWith('.zip'))
  
  const buildDir = path.join(BUILDS_DIR, jobId)
  await fs.ensureDir(buildDir)
  const zipPath = path.join(buildDir, sourceZipEntry ? sourceZipEntry.entryName : 'source.zip')
  
  if (sourceZipEntry) {
    await fs.writeFile(zipPath, sourceZipEntry.getData())
  } else {
    // If it's already the zip we want? Doubtful.
    await fs.writeFile(zipPath, Buffer.from(zipBuffer))
  }

  const job = jobs.get(jobId)
  if (job) { 
    job.status = 'done'
    job.zipPath = zipPath
    job.buildDir = buildDir
  }

  progress(100)
  emit({
    type: 'done',
    downloadUrl: `/download-zip/${jobId}`,
    apkName: file.originalname
  })

  scheduleCleanup(jobId, buildDir)
}


// ─── Global Error Handler ────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('❌ SERVER ERROR:', err.message)
  res.status(500).json({ error: err.message })
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✅ AppForge Backend v2.0 em http://localhost:${PORT}`)
  console.log(`   SSE: http://localhost:${PORT}/build-events/:jobId`)
  console.log(`   Download: http://localhost:${PORT}/download/:jobId\n`)
})
