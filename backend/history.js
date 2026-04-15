const path = require('path');
const fs = require('fs-extra');

const BUILDS_FILE = path.join(__dirname, 'builds.json');

// Initialize builds file if not exists
async function initBuildsFile() {
  if (!await fs.pathExists(BUILDS_FILE)) {
    await fs.writeJson(BUILDS_FILE, []);
  }
}

// Get all builds
async function getAllBuilds() {
  await initBuildsFile();
  return await fs.readJson(BUILDS_FILE);
}

// Save builds
async function saveAllBuilds(builds) {
  await fs.writeJson(BUILDS_FILE, builds);
}

// Add a new build to history
async function addBuildToHistory(userId, buildData) {
  const builds = await getAllBuilds();
  const newEntry = {
    id: buildData.id || Date.now().toString(),
    userId,
    appName: buildData.appName,
    packageName: buildData.packageName,
    mode: buildData.mode,
    url: buildData.url,
    type: buildData.type || 'build', // 'build' or 'decompile'
    status: buildData.status || 'building',
    downloadUrl: buildData.downloadUrl || null,
    apkSize: buildData.apkSize || null,
    createdAt: new Date().toISOString()
  };
  
  // Update if exists (by id), otherwise add
  const index = builds.findIndex(b => b.id === newEntry.id);
  if (index !== -1) {
    builds[index] = { ...builds[index], ...newEntry };
  } else {
    builds.push(newEntry);
  }
  
  await saveAllBuilds(builds);
  return newEntry;
}

// Update build status
async function updateBuildStatus(jobId, status, extraData = {}) {
  const builds = await getAllBuilds();
  const index = builds.findIndex(b => b.id === jobId);
  if (index !== -1) {
    builds[index] = { ...builds[index], status, ...extraData };
    await saveAllBuilds(builds);
    return builds[index];
  }
  return null;
}

// Get history for a specific user
async function getUserHistory(userId) {
  const builds = await getAllBuilds();
  return builds
    .filter(b => b.userId === userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

module.exports = {
  addBuildToHistory,
  updateBuildStatus,
  getUserHistory
};
