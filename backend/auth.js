const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const path = require('path')
const fs = require('fs-extra')

const JWT_SECRET = process.env.JWT_SECRET || 'web2apk-secret-key-change-in-production'
const USERS_FILE = path.join(__dirname, 'users.json')

// Initialize users file if not exists
async function initUsersFile() {
  if (!await fs.pathExists(USERS_FILE)) {
    // Create default admin user
    const defaultUsers = [
      {
        id: '1',
        email: 'admin@web2apk.com',
        password: await bcrypt.hash('admin123', 10),
        name: 'Admin',
        createdAt: new Date().toISOString()
      }
    ]
    await fs.writeJson(USERS_FILE, defaultUsers)
  }
}

// Get all users
async function getUsers() {
  await initUsersFile()
  return await fs.readJson(USERS_FILE)
}

// Save users
async function saveUsers(users) {
  await fs.writeJson(USERS_FILE, users)
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
