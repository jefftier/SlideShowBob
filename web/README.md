# SlideShowBob Web App

Progressive Web App (PWA) version of SlideShowBob.

## Quick Start

### Frontend Setup

\\\ash
cd web/frontend
npm create vite@latest . -- --template react-ts
npm install
npm run dev
\\\

### Backend Setup (Optional - for cloud features)

\\\ash
cd web/backend
npm init -y
npm install express typescript @types/node @types/express ts-node
npm install cors dotenv
\\\

## Development

- Frontend: \cd web/frontend && npm run dev\
- Backend: \cd web/backend && npm run dev\

## Architecture

See [MIGRATION_SETUP_GUIDE.md](../MIGRATION_SETUP_GUIDE.md) for details.
