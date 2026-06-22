# Translator MVP

A small realtime multilingual transcription demo built with Socket.IO, Expo,
and Sarvam AI.

## Packages

- `services/realtime-backend`: in-memory Socket.IO server and Sarvam adapter.
- `apps/speaker-app`: records short microphone segments and streams them.
- `apps/viewer-app`: joins the latest session and displays a selected language.
- `apps/web-viewer`: hostable webpage that shows every configured language section at once.
- `packages/shared-types`: common transcript and language types.
- `packages/shared-socket-contracts`: typed Socket.IO event contracts.

## Setup

```bash
pnpm install
cp .env.example services/realtime-backend/.env
cp apps/web-viewer/.env.example apps/web-viewer/.env
pnpm dev
```

Set `EXPO_PUBLIC_BACKEND_SOCKET_URL` to a URL reachable by the phone running
Expo (for a physical device this is normally your computer's LAN IP, not
`localhost`). Start an app separately with:

```bash
pnpm --filter speaker-app start
pnpm --filter viewer-app start
pnpm --filter web-viewer dev
```

Without `SARVAM_API_KEY`, the backend uses deterministic demo transcripts so
the complete socket flow can be tested locally. With a key, each recorded
segment is transcribed to English and translated into Malayalam, Hindi, and
Bengali through Sarvam's REST API.

## Web live wall

The hostable web viewer renders a branded header and one subtitle section for
each language in `VITE_DISPLAY_LANGUAGES`. Configure it with:

```bash
VITE_BACKEND_SOCKET_URL=http://localhost:4000
VITE_SITE_NAME=Translator Live Wall
VITE_SITE_VERSION=0.1.0
VITE_DISPLAY_LANGUAGES=en,ml,hi,bn
```

Build the static page with `pnpm --filter web-viewer build` and host the
resulting `apps/web-viewer/dist` directory. The webpage joins the latest active
speaker session and updates every language section as transcript socket events
arrive.

## API

- Health check: `GET http://localhost:4000/health`
- Socket server: `http://localhost:4000`

Sessions and transcripts are intentionally held only in memory.
