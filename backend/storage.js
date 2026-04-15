const os = require('os')
const path = require('path')
const fs = require('fs-extra')

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, 'data')

async function ensureDataDir() {
  await fs.ensureDir(DATA_DIR)
}

function resolveDataFile(filename) {
  return path.join(DATA_DIR, filename)
}

async function migrateLegacyFile(legacyPath, targetPath, fallbackValue) {
  await ensureDataDir()

  const targetExists = await fs.pathExists(targetPath)
  if (targetExists) return

  if (await fs.pathExists(legacyPath)) {
    await fs.copy(legacyPath, targetPath)
    return
  }

  await writeJsonAtomic(targetPath, fallbackValue)
}

async function readJsonFile(filePath, fallbackValue) {
  await ensureDataDir()
  if (!await fs.pathExists(filePath)) {
    await writeJsonAtomic(filePath, fallbackValue)
    return fallbackValue
  }

  return fs.readJson(filePath)
}

async function writeJsonAtomic(filePath, value) {
  await ensureDataDir()

  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  await fs.writeJson(tempPath, value, { spaces: 2 })
  await fs.move(tempPath, filePath, { overwrite: true })
}

module.exports = {
  DATA_DIR,
  resolveDataFile,
  migrateLegacyFile,
  readJsonFile,
  writeJsonAtomic,
}
