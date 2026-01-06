# SlideShowBob Web App Setup Script
# This script sets up the monorepo structure for web app development

Write-Host "=== SlideShowBob Web App Setup ===" -ForegroundColor Cyan
Write-Host ""

# Check if we're in the right directory
if (-not (Test-Path "SlideShowBob.csproj")) {
    Write-Host "Error: This script must be run from the SlideShowBob root directory" -ForegroundColor Red
    Write-Host "Current directory: $(Get-Location)" -ForegroundColor Yellow
    exit 1
}

Write-Host "Creating folder structure..." -ForegroundColor Green

# Create web app folders
$folders = @(
    "web",
    "web/frontend",
    "web/backend",
    "web/shared",
    "web/shared/types",
    "desktop",
    "shared",
    "shared/docs",
    "shared/assets",
    "shared/scripts"
)

foreach ($folder in $folders) {
    if (-not (Test-Path $folder)) {
        New-Item -ItemType Directory -Path $folder -Force | Out-Null
        Write-Host "  Created: $folder" -ForegroundColor Gray
    } else {
        Write-Host "  Exists: $folder" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "Setting up .gitignore for web app..." -ForegroundColor Green

# Update .gitignore
$gitignorePath = ".gitignore"
$webGitignore = @"

# Web App
web/frontend/node_modules/
web/frontend/dist/
web/frontend/build/
web/frontend/.next/
web/frontend/.vite/
web/backend/node_modules/
web/backend/dist/
web/backend/build/
web/shared/node_modules/
web/shared/dist/

# Environment files
web/**/.env
web/**/.env.local
web/**/.env.*.local

# Logs
web/**/npm-debug.log*
web/**/yarn-debug.log*
web/**/yarn-error.log*
web/**/pnpm-debug.log*

"@

if (Test-Path $gitignorePath) {
    $currentContent = Get-Content $gitignorePath -Raw
    if ($currentContent -notmatch "Web App") {
        Add-Content $gitignorePath $webGitignore
        Write-Host "  Updated .gitignore" -ForegroundColor Gray
    } else {
        Write-Host "  .gitignore already contains web app entries" -ForegroundColor Yellow
    }
} else {
    Set-Content $gitignorePath $webGitignore
    Write-Host "  Created .gitignore" -ForegroundColor Gray
}

Write-Host ""
Write-Host "Creating web app README..." -ForegroundColor Green

# Create web app README
$webReadme = @"
# SlideShowBob Web App

Progressive Web App (PWA) version of SlideShowBob.

## Quick Start

### Frontend Setup

\`\`\`bash
cd web/frontend
npm create vite@latest . -- --template react-ts
npm install
npm run dev
\`\`\`

### Backend Setup (Optional - for cloud features)

\`\`\`bash
cd web/backend
npm init -y
npm install express typescript @types/node @types/express ts-node
npm install cors dotenv
\`\`\`

## Development

- Frontend: \`cd web/frontend && npm run dev\`
- Backend: \`cd web/backend && npm run dev\`

## Architecture

See [MIGRATION_SETUP_GUIDE.md](../MIGRATION_SETUP_GUIDE.md) for details.
"@

Set-Content "web/README.md" $webReadme
Write-Host "  Created web/README.md" -ForegroundColor Gray

Write-Host ""
Write-Host "Creating shared types placeholder..." -ForegroundColor Green

# Create shared types placeholder
$sharedTypesReadme = @"
# Shared Types

TypeScript types shared between frontend and backend.

## Porting from Desktop

Port these C# models to TypeScript:

- \`MediaItem.cs\` → \`MediaItem.ts\`
- \`AppSettings.cs\` → \`AppSettings.ts\`
- \`PlaylistMediaItem.cs\` → \`PlaylistMediaItem.ts\`

## Usage

\`\`\`typescript
import { MediaItem } from '../shared/types/MediaItem';
\`\`\`
"@

Set-Content "web/shared/README.md" $sharedTypesReadme
Write-Host "  Created web/shared/README.md" -ForegroundColor Gray

Write-Host ""
Write-Host "=== Setup Complete! ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Move desktop app files to 'desktop/' folder (optional)" -ForegroundColor White
Write-Host "2. Initialize web frontend: cd web/frontend && npm create vite@latest . -- --template react-ts" -ForegroundColor White
Write-Host "3. Initialize web backend: cd web/backend && npm init -y" -ForegroundColor White
Write-Host "4. Start porting models from desktop to web/shared/types/" -ForegroundColor White
Write-Host ""
Write-Host "See MIGRATION_SETUP_GUIDE.md for detailed instructions." -ForegroundColor Cyan

