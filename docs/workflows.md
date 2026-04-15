# GitHub Workflows ⚙️

Web2APK uses GitHub Actions for its **Cloud Mode** building and analysis tasks.

## 1. `generate-apk.yml`
This workflow is triggered by the **Relay Backend** when it commits to `app-config.json`.

- **Trigger**: `push` on `main`/`master` or `workflow_dispatch`.
- **Environment**: Ubuntu Latest, JDK 17.
- **Process**:
    1. Check out code.
    2. Set up Java Environment.
    3. Read `app-config.json` (URL, App Name, Package).
    4. Patch the `android-template/` project in the repository.
    5. Run `./gradlew assembleDebug`.
    6. Upload the resulting `.apk` as a workflow artifact.

## 2. `analyze-apk.yml`
This workflow is triggered when an APK is uploaded to the `analyze/` directory.

- **Trigger**: `push` to the `analyze/` folder.
- **Environment**: Ubuntu Latest, JDK 17, `apktool` installed.
- **Process**:
    1. Check out code.
    2. Identify the target APK in the `analyze/` directory.
    3. Run `apktool d <apk>`.
    4. Package the results into a `.zip`.
    5. Upload the source code bundle as a workflow artifact.

## 3. Best Practices for Workflows
- Keep the `android-template/` updated in the main repository.
- Ensure that the GitHub Action runner has sufficient permissions to write/update tags if needed.
- Monitor workflow logs in the **Actions** tab of your repository if a cloud build fails.
