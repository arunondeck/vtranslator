# Translator MVP

Realtime multilingual transcription demo using Socket.IO, Sarvam AI, optional Soniox AI REST endpoints, and
optional Expo native apps.

Audio is streamed as 16 kHz PCM to the backend, which opens one Sarvam
speech-to-text-translate WebSocket per session (`saaras:v3`, `mode=translate`,
VAD on). Each finalized utterance is appended to a growing transcript,
translated into Malayalam, Hindi, and Bengali, and pushed to connected viewers.

## Quick start (web)

The unified browser page is the fastest way to run the full flow — no native
build required.

```bash
pnpm install

cp services/realtime-backend/.env.example services/realtime-backend/.env
cp apps/web-viewer/.env.example apps/web-viewer/.env
```

Start the backend in mock mode (no Sarvam API key needed):

```bash
USE_MOCK_TRANSCRIPTION=true pnpm --filter realtime-backend dev
```

On Windows PowerShell:

```powershell
$env:USE_MOCK_TRANSCRIPTION="true"; pnpm --filter realtime-backend dev
```

In a second terminal, start the web app:

```bash
pnpm --filter web-viewer dev
```

Open `http://localhost:5173`, click **Start Talking**, allow microphone access,
pick a language at the bottom, and watch the transcript update as utterances
finalize.

Confirm the backend is up: `curl http://localhost:4000/health` should return
`{"ok":true,...}`.

## Packages

| Path | Role |
| --- | --- |
| `services/realtime-backend` | Socket.IO server; bridges live audio to Sarvam and exposes Soniox REST endpoints |
| `apps/web-viewer` | Unified browser page (mic + language selectors) |
| `apps/speaker-app` | Native Expo app that streams microphone PCM |
| `apps/viewer-app` | Native Expo app that shows one selected language |
| `packages/shared-types` | Transcript and language types |
| `packages/shared-socket-contracts` | Typed Socket.IO event contracts |

## Prerequisites

- Node.js 20+
- [pnpm](https://pnpm.io/) 9 (`corepack enable` if needed)
- [Expo Go](https://expo.dev/go) for SDK 53 — only if using the native viewer app

## Development

### All services

```bash
pnpm dev
```

Builds shared workspace packages first, then starts every package `dev` script:

- Backend — `http://localhost:4000`
- Web app — `http://localhost:5173`
- Speaker and viewer Expo dev servers (Metro)

For day-to-day web development, run only the backend and web app (see
[Quick start](#quick-start-web)).

### Individual services

```bash
pnpm --filter realtime-backend dev
pnpm --filter web-viewer dev
pnpm --filter speaker-app start
pnpm --filter viewer-app start
```

Clear Metro cache after dependency changes:

```bash
pnpm --filter speaker-app exec expo start --clear
pnpm --filter viewer-app exec expo start --clear
```

### Build and checks

```bash
pnpm build      # compile shared packages and backend; typecheck Expo apps
pnpm typecheck  # typecheck all packages
pnpm lint       # lint all packages
```

## Web app

`apps/web-viewer` is a single page with two sections:

- **Top** — microphone button to start/stop PCM streaming
- **Bottom** — language selectors (English, Malayalam, Hindi, Bengali) and live
  transcript for the selected language

```bash
pnpm --filter web-viewer dev    # dev server (port 5173)
pnpm --filter web-viewer build  # static output in apps/web-viewer/dist
```

Configure `apps/web-viewer/.env`:

```bash
VITE_BACKEND_SOCKET_URL=http://localhost:4000
VITE_SITE_NAME=Translator
VITE_SITE_VERSION=0.1.0
```

Host `apps/web-viewer/dist` over `http://` or `https://` so the browser can
request microphone permission.

## Native apps (optional)

Use the Expo apps when you want separate speaker and viewer devices.

- **Viewer** — runs in Expo Go (scan the QR code, or press `a` for Android
  emulator).
- **Speaker** — requires a development client (`react-native-live-audio-stream`
  does not run in Expo Go). See [Speaker dev build](#speaker-dev-build).

Copy env files before running on a physical device:

```bash
cp apps/speaker-app/.env.example apps/speaker-app/.env
cp apps/speaker-app/.env.example apps/viewer-app/.env
```

Set `EXPO_PUBLIC_BACKEND_SOCKET_URL` in `apps/speaker-app/.env` to your
machine's LAN address (`http://10.0.2.2:4000` for an Android emulator).

### Android 16 KB page-size warning

On some Android 15+ emulators, Expo Go shows a 16 KB compatibility dialog.
Tap **OK** — the app runs in compatible mode for local dev.

To avoid the dialog: use a physical phone, disable 16 KB pages in the AVD
settings, or press **`s`** in the Expo terminal to switch to Expo Go.

### Speaker dev build

Pressing `a`/`i` in `expo start` only opens an already-installed dev build;
it does not create one. If you see `No development build ... is installed`, run
one of the commands below first.

Local build (requires Android Studio / Xcode):

```bash
pnpm --filter speaker-app exec expo run:android
# or
pnpm --filter speaker-app exec expo run:ios
```

Cloud build (no local toolchain):

```bash
pnpm --filter speaker-app exec eas build --profile development --platform android
pnpm --filter speaker-app exec expo start --dev-client
```

After the dev client is installed:

```bash
pnpm --filter speaker-app exec expo start --dev-client
```

## Transcription modes

| Mode | Requirements | Behavior |
| --- | --- | --- |
| Mock (default) | No `SARVAM_API_KEY` | Emits deterministic utterances while audio flows |
| Live | `USE_MOCK_TRANSCRIPTION=false` and `SARVAM_API_KEY` | Streams to Sarvam; text appears ~0.5s after each pause |

Tune streaming and VAD via `SARVAM_*` and `TRANSCRIPT_WINDOW_CHARS` in
`services/realtime-backend/.env.example`. Soniox REST experiments use `SONIOX_*`
variables in the same file; see `docs/04-soniox-api.md` for endpoint details.

There is no unit-test runner yet — use `pnpm lint`, `pnpm typecheck`, and a
manual end-to-end pass to verify changes.

## API

- Health check: `GET http://localhost:4000/health`
- Socket server: `http://localhost:4000`
- Soniox status/config: `GET http://localhost:4000/soniox/status` and `GET http://localhost:4000/soniox/config`
- Soniox STT: `POST http://localhost:4000/soniox/stt/transcribe-demo` or `POST http://localhost:4000/soniox/stt/transcribe-url`

Sessions and transcripts are held in memory only.
