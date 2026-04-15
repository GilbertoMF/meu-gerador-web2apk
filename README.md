# AppForge (Web2APK Toolchain) 🚀

AppForge is a powerful, dual-mode toolchain designed to convert websites (URLs) or local HTML/JS content into fully functional Android APKs. It features a modern React-based dashboard, an Express backend, and integrated APK analysis/decompilation tools.

## 🌟 Key Features

- **Web2APK Conversion**: Transform any responsive URL into an Android App in seconds.
- **HTML/JS Support**: Upload or paste custom HTML/JS code to build standalone static apps.
- **Dual Build Engine**:
    - **Local Mode**: Build directly on your server using a pre-configured Android template and Gradle.
    - **Cloud Mode (Relay)**: Offload heavy Android builds to GitHub Actions using a GitHub API relay mechanism.
- **APK Analysis & Decompilation**: Decompile existing APKs using `apktool` to inspect source code and assets.
- **Real-time Progress**: Event-driven architecture with Server-Sent Events (SSE) for live build logs.

## 🛠️ Architecture Overview

The project is structured as a monorepo:

- `/frontend`: Vite + React dashboard for user interaction.
- `/backend`: Node.js Express server managing build queue and logic.
- `/backend/android-template`: The internal Android project scaffold.
- `.github/workflows`: CI/CD pipelines for cloud-based build and analysis.

## 🚀 Quick Start

### 1. Prerequisites
- Node.js (v18+)
- Java JDK 17 (for local builds)
- Android SDK (for local builds)
- `apktool` (included in `/backend`)

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/GilbertoMF/meu-gerador-web2apk.git
cd meu-gerador-web2apk

# Install dependencies
cd backend && npm install
cd ../frontend && npm install
```

### 3. Run Locally
```bash
# Start backend (Port 3001)
cd backend && npm start

# Start frontend (Port 5173 / Vite)
cd frontend && npm run dev
```

## 📖 Documentation

For more detailed technical info, check the `/docs` folder:
- [Architecture & Relay System](./docs/architecture.md)
- [API Reference](./docs/api.md)
- [Setup & Deployment](./docs/setup.md)
- [GitHub Workflows](./docs/workflows.md)

## 📄 License
This project is licensed under the MIT License - see the LICENSE file for details.
