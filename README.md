# Translator MVP

A small realtime multilingual transcription demo built with Socket.IO, Expo,
and Sarvam AI.

## Packages

- `services/realtime-backend`: in-memory Socket.IO server and Sarvam adapter.
- `apps/speaker-app`: records short microphone segments and streams them.
- `apps/viewer-app`: joins the latest session and displays a selected language.
- `packages/shared-types`: common transcript and language types.
- `packages/shared-socket-contracts`: typed Socket.IO event contracts.

## Setup

```bash
pnpm install
cp .env.example services/realtime-backend/.env
pnpm dev
```

Set `EXPO_PUBLIC_BACKEND_SOCKET_URL` to a URL reachable by the phone running
Expo (for a physical device this is normally your computer's LAN IP, not
`localhost`). Start an app separately with:

```bash
pnpm --filter speaker-app start
pnpm --filter viewer-app start
```

Without `SARVAM_API_KEY`, the backend uses deterministic demo transcripts so
the complete socket flow can be tested locally. With a key, each recorded
segment is transcribed to English and translated into Malayalam, Hindi, and
Bengali through Sarvam's REST API.

## API

- Health check: `GET http://localhost:4000/health`
- Socket server: `http://localhost:4000`

Sessions and transcripts are intentionally held only in memory.
