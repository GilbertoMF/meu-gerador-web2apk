const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const path = require('path')
const fs = require('fs-extra')
const {
  resolveDataFile,
  migrateLegacyFile,
  readJsonFile,
  writeJsonAtomic,
} = require('./storage')

const IS_PRODUCTION = process.env.NODE_ENV === 'production'
if (IS_PRODUCTION && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is required in production.')
}

const JWT_SECRET = process.env.JWT_SECRET || 'web2apk-dev-secret'
const LEGACY_USERS_FILE = path.join(__dirname, 'users.json')
const USERS_FILE = resolveDataFile('users.json')

// Initialize users file if not exists
async function initUsersFile() {
  await migrateLegacyFile(LEGACY_USERS_FILE, USERS_FILE, [])

  const users = await fs.readJson(USERS_FILE)
  if (users.length === 0 && process.env.SEED_DEFAULT_ADMIN === 'true') {
    const email = process.env.ADMIN_EMAIL
    const password = process.env.ADMIN_PASSWORD
    const name = process.env.ADMIN_NAME || 'Admin'

    if (!email || !password) {
      throw new Error('SEED_DEFAULT_ADMIN requires ADMIN_EMAIL and ADMIN_PASSWORD.')
    }

    const defaultUsers = [
      {
        id: Date.now().toString(),
        email: email.toLowerCase(),
        password: await bcrypt.hash(password, 10),
        name,
        createdAt: new Date().toISOString(),
      },
    ]

    await writeJsonAtomic(USERS_FILE, defaultUsers)
  }
}

// Get all users
async function getUsers() {
  await initUsersFile()
  return readJsonFile(USERS_FILE, [])
}

// Save users
async function saveUsers(users) {
  await writeJsonAtomic(USERS_FILE, users)
}

// Find user by email
async function findUserByEmail(email) {
  const users = await getUsers()
  return users.find(u => u.email.toLowerCase() === email.toLowerCase())
}

// Register new user
async function registerUser(email, password, name) {
  const users = await getUsers()
  
  if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
    throw new Error('Email already registered')
  }
  
  const newUser = {
    id: Date.now().toString(),
    email: email.toLowerCase(),
    password: await bcrypt.hash(password, 10),
    name,
    createdAt: new Date().toISOString()
  }
  
  users.push(newUser)
  await saveUsers(users)
  
  const { password: _, ...userWithoutPassword } = newUser
  return userWithoutPassword
}

// Validate login
async function validateLogin(email, password) {
  const user = await findUserByEmail(email)
  if (!user) return null
  
  const isValid = await bcrypt.compare(password, user.password)
  if (!isValid) return null
  
  const { password: _, ...userWithoutPassword } = user
  return userWithoutPassword
}

// Generate JWT token
function generateToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email, name: user.name },
    JWT_SECRET,
    { expiresIn: '7d' }
  )
}

// Verify JWT token
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET)
  } catch (err) {
    return null
  }
}

// Auth middleware
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Access denied. No token provided.' })
  }
  
  const token = authHeader.substring(7)
  const decoded = verifyToken(token)
  
  if (!decoded) {
    return res.status(401).json({ error: 'Invalid or expired token.' })
  }
  
  req.user = decoded
  next()
}

module.exports = {
  initUsersFile,
  registerUser,
  validateLogin,
  generateToken,
  verifyToken,
  authMiddleware,
  findUserByEmail
}
