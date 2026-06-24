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

## Prerequisites

- Node.js 20+
- [pnpm](https://pnpm.io/) 9 (`corepack enable` if needed)
- [Expo Go](https://expo.dev/go) for SDK 53 on your phone or emulator

## Setup

```bash
pnpm install
```bash
pnpm install

# Backend config
cp services/realtime-backend/.env.example services/realtime-backend/.env

# Expo apps (optional for simulator; required for a physical device)
cp apps/speaker-app/.env.example apps/speaker-app/.env
cp apps/speaker-app/.env.example apps/viewer-app/.env

# Web viewer
cp apps/web-viewer/.env.example apps/web-viewer/.env
pnpm dev
```

`pnpm dev` builds shared workspace packages first, then starts:

- backend at `http://localhost:4000`
- speaker and viewer Expo dev servers

Open each app in **Expo Go** (scan the QR code, or press `a` for Android emulator).

Run services individually when you want separate terminals:

```bash
pnpm --filter realtime-backend dev
pnpm --filter speaker-app start
pnpm --filter viewer-app start
pnpm --filter web-viewer dev
```

If Metro fails after dependency changes, clear its cache once:

```bash
pnpm --filter speaker-app exec expo start --clear
pnpm --filter viewer-app exec expo start --clear
```

### Android "16 KB compatible" warning

On some Android 15+ emulators, Expo Go shows a dialog about 16 KB page size.
**Tap OK** — the app runs in compatible mode and works fine for local dev.

To avoid the dialog entirely, use any of these:

- A **physical phone** with Expo Go (recommended)
- An emulator **without** 16 KB page size enabled (AVD settings)
- Press **`s`** in the Expo terminal to switch to Expo Go if you see "development build"

You only need a custom native build when shipping to Google Play with a 16 KB
requirement — not for running this demo in Expo Go.

## Build and checks

```bash
pnpm build      # compile shared packages and backend; typecheck Expo apps
pnpm typecheck  # typecheck all packages
pnpm lint       # lint all packages
```

## Transcription modes

Without `SARVAM_API_KEY`, the backend uses deterministic demo transcripts so
the full socket flow can be tested locally. Set `USE_MOCK_TRANSCRIPTION=false`
and provide `SARVAM_API_KEY` to call Sarvam's REST API for real transcription
and translation into Malayalam, Hindi, and Bengali.

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
