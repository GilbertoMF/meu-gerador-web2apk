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

// ─── Health ──────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', version: '2.0.0' }))

// ─── POST /build — start async build, return jobId immediately ───────────────
app.post('/build', upload.single('icon'), (req, res) => {
  const jobId = uuidv4()
  const emitter = new EventEmitter()
  emitter.setMaxListeners(30)

  const job = { emitter, status: 'building', apkPath: null, buildDir: null, appName: null, eventBuffer: [] }
  // Buffer every event so SSE can replay them if client connects late
  emitter.on('event', (data) => { job.eventBuffer.push(data) })
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

// ─── POST /decompile — start async extraction ────────────────────────────────
app.post('/decompile', upload.single('apk'), (req, res) => {
  const jobId = uuidv4()
  const emitter = new EventEmitter()
  emitter.setMaxListeners(30)

  jobs.set(jobId, { emitter, status: 'decompiling', zipPath: null, buildDir: null, apkName: req.file?.originalname })
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
  
  log('☁️ Iniciando Build em modo Cloud (GitHub API)...')
  
  const config = {
    appName: body.appName,
    url: body.mode === 'html' ? 'file:///android_asset/index.html' : body.url,
    packageName: body.packageName || `com.appforge.${body.appName.toLowerCase().replace(/[^a-z0-9]/g, '')}`
  }

  log('Enviando configuração para o GitHub...')
  
  // 1. Get current SHA if exists
  let sha;
  try {
    const { data } = await octokit.repos.getContent({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      path: 'app-config.json',
    })
    sha = data.sha
  } catch (e) {}

  // 2. Update config
  await octokit.repos.createOrUpdateFileContents({
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
    path: 'app-config.json',
    message: `Build: ${body.appName}`,
    content: Base64.encode(JSON.stringify(config, null, 2)),
    sha
  })

  log('✅ Configuração sincronizada! GitHub Actions iniciará o build.', 'success')
  emit({ type: 'progress', value: 100 })
  emit({
    type: 'done',
    cloud: true,
    githubUrl: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/actions`
  })
}

// ─── Cloud Decompile Relay ───────────────────────────────────────────────────
async function runCloudDecompile(jobId, file, emitter) {
  const emit = (data) => emitter.emit('event', data)
  const log = (text, level = 'info') => emit({ type: 'log', text, level })
  
  if (!file) throw new Error('Cade o APK?')
  
  log(`☁️ Enviando APK para descompilação na nuvem: ${file.originalname}`)
  
  const filePath = `analyze/${Date.now()}_${file.originalname}`
  
  await octokit.rest.repos.createOrUpdateFileContents({
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
    path: filePath,
    message: `Decompile: ${file.originalname}`,
    content: file.buffer.toString('base64') 
  })

  log('✅ APK enviado com sucesso! O GitHub Actions vai analisar agora.', 'success')
  emit({ type: 'progress', value: 100 })
  emit({
    type: 'done',
    cloud: true,
    githubUrl: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/actions`
  })
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
