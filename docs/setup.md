# Setup & Deployment Guide 🔧

This guide provides instructions for setting up the Web2APK project on various environments.

## 1. Local Development Setup

To run Web2APK on your own machine (Windows/Linux/Mac):

1. **Environment Variables**:
   Create a `.env` file in the `backend/` directory:
   ```env
   PORT=3001
   GITHUB_TOKEN= (Optional: For Cloud mode)
   GITHUB_OWNER= (Optional: Your GitHub handle)
   GITHUB_REPO= (Optional: Your generated repo name)
   ```

2. **Android Setup**:
   Ensure you have the following installed and in your `PATH`:
   - **JDK 17**: Required for building the Android template.
   - **Android SDK**: `ANDROID_HOME` must point to your SDK directory.
   - **Gradle**: `gradlew` wrapper is included in the project, but you may need common Android tools installed.

3. **Running**:
   ```bash
   # Backend
   cd backend && npm install && npm start
   # Frontend
   cd frontend && npm install && npm run dev
   ```

## 2. Cloud Deployment (Hybrid Mode)

A common deployment strategy is to run the **Backend** on **Render** (or any Node.js host) and use **GitHub Actions** for the heavy Android compilation.

### Backend (Render)
1. Link your repository.
2. Set Environment Variables:
   - `GITHUB_TOKEN`: A Personal Access Token (PAT) with `repo` permissions.
   - `GITHUB_OWNER`: Your GitHub username.
   - `GITHUB_REPO`: The repository name.
3. Build Command: `cd backend && npm install`.
4. Start Command: `cd backend && node server.js`.

### Frontend (Vercel/Netlify)
1. Link your repository.
2. Set Environment Variables:
   - `VITE_API_BASE_URL`: The URL of your Render backend (e.g., `https://my-backend.onrender.com`).
3. Build Command: `npm run build` (inside the `frontend` folder).
4. Output Directory: `frontend/dist`.

## 3. GitHub Permissions
To enable **Cloud Mode**, you must:
1. Create a GitHub Personal Access Token (PAT) with `repo` access.
2. Add the PAT to your backend's environment variables.
3. Ensure the target repository exists and contains the `.github/workflows` folder.
