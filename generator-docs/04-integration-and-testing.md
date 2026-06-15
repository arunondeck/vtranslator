# 04-integration-and-testing.md

# Translator MVP - Integration and Testing

## Purpose

This document validates that the three generated parts work together inside
one monorepo.

The MVP is not complete until the backend, speaker app, and viewer app
communicate successfully using the same socket contract.

## Required Monorepo Commands

From the repository root:

```bash
pnpm install
pnpm dev
pnpm build
pnpm typecheck
```

Package-specific commands:

```bash
pnpm --filter realtime-backend dev
pnpm --filter speaker-app start
pnpm --filter viewer-app start
```

## Expected Package Names

Use exactly:

```txt
realtime-backend
speaker-app
viewer-app
@translator/shared-types
@translator/shared-socket-contracts
```

## Local Startup Order

Start the backend first:

```bash
pnpm --filter realtime-backend dev
```

Then start the speaker app:

```bash
pnpm --filter speaker-app start
```

Then start the viewer app:

```bash
pnpm --filter viewer-app start
```

## Environment Setup

Backend `.env`:

```dotenv
PORT=4000
CORS_ORIGIN=*
USE_MOCK_TRANSCRIPTION=true
SARVAM_API_KEY=
SARVAM_API_BASE_URL=
```

Apps `.env`:

```dotenv
EXPO_PUBLIC_BACKEND_SOCKET_URL=http://localhost:4000
```

For an Android emulator, use:

```dotenv
EXPO_PUBLIC_BACKEND_SOCKET_URL=http://10.0.2.2:4000
```

For a physical phone, use the computer's LAN IP:

```dotenv
EXPO_PUBLIC_BACKEND_SOCKET_URL=http://192.168.x.x:4000
```

## End-to-End MVP Test

### Test 1 - Backend Health

Open:

```txt
http://localhost:4000/health
```

Expected:

```json
{
  "ok": true,
  "service": "realtime-backend"
}
```

### Test 2 - Speaker Session

1. Open the speaker app.
2. Confirm the socket status says connected.
3. Tap **Start Talking**.
4. The backend should create a session.
5. The speaker app should display the session ID.
6. The speaker app should start sending audio chunks.

Expected backend logs:

```txt
speaker connected
session created
audio chunk received
transcript emitted
```

### Test 3 - Viewer Join

1. Open the viewer app.
2. Confirm the socket status says connected.
3. The viewer emits `viewer:join`.
4. The viewer joins the latest active speaker session.
5. The viewer displays the session ID.
6. The viewer shows transcript text.

Expected text in mock mode:

```txt
English live transcript sequence 1
```

Changing the language should show the corresponding mock text:

```txt
Malayalam live transcript sequence 1
Hindi live transcript sequence 1
Bengali live transcript sequence 1
```

## Required Socket Event Compatibility

All apps must use shared constants from
`@translator/shared-socket-contracts`.

Do not hardcode event names separately in each app unless unavoidable.

Required events:

```ts
SPEAKER_START = 'speaker:start'
SPEAKER_AUDIO_CHUNK = 'speaker:audio-chunk'
SPEAKER_STOP = 'speaker:stop'
SPEAKER_SESSION_CREATED = 'speaker:session-created'
SPEAKER_ERROR = 'speaker:error'
VIEWER_JOIN = 'viewer:join'
VIEWER_SET_LANGUAGE = 'viewer:set-language'
VIEWER_ERROR = 'viewer:error'
TRANSCRIPT_UPDATE = 'transcript:update'
TRANSCRIPT_ALL = 'transcript:all'
```

## Sample Payloads

### `speaker:start`

```json
{}
```

Expected response:

```json
{
  "sessionId": "session_abc123"
}
```

### `speaker:audio-chunk`

```json
{
  "sessionId": "session_abc123",
  "chunk": "BASE64_AUDIO_STRING",
  "mimeType": "audio/m4a",
  "sequence": 1
}
```

### `transcript:all`

```json
{
  "sessionId": "session_abc123",
  "transcripts": {
    "en": "English live transcript sequence 1",
    "ml": "Malayalam live transcript sequence 1",
    "hi": "Hindi live transcript sequence 1",
    "bn": "Bengali live transcript sequence 1"
  },
  "sequence": 1,
  "updatedAt": "2026-06-14T12:00:00.000Z"
}
```

### `transcript:update`

```json
{
  "sessionId": "session_abc123",
  "language": "en",
  "text": "English live transcript sequence 1",
  "isFinal": false,
  "sequence": 1,
  "updatedAt": "2026-06-14T12:00:00.000Z"
}
```

## MVP Latency Expectation

Realtime does not need to mean millisecond streaming.

For this MVP:

- A latency of 2-5 seconds is acceptable.
- The speaker app may send short recorded segments instead of true continuous
  PCM streaming.

## Manual QA Checklist

### Backend

- [ ] Starts without Sarvam credentials in mock mode.
- [ ] Health endpoint works.
- [ ] Socket.IO accepts a speaker connection.
- [ ] Socket.IO accepts a viewer connection.
- [ ] Creates a session.
- [ ] Receives audio chunks.
- [ ] Emits transcript updates.
- [ ] Does not crash on malformed payloads.

### Speaker App

- [ ] Starts in Expo.
- [ ] Connects to the socket.
- [ ] Requests microphone permission.
- [ ] Starts recording.
- [ ] Sends chunks.
- [ ] Stops recording.
- [ ] Handles disconnects.

### Viewer App

- [ ] Starts in Expo.
- [ ] Connects to the socket.
- [ ] Joins the latest session.
- [ ] Displays the transcript.
- [ ] Switches language.
- [ ] Handles reconnects.
- [ ] Handles no active session.

## Final Integration Definition of Done

The complete monorepo is accepted only when:

1. The backend runs on port 4000.
2. The speaker app connects to the backend.
3. The viewer app connects to the backend.
4. The speaker app can start a session.
5. The speaker app streams audio chunks.
6. The backend processes chunks using mock Sarvam mode.
7. The backend broadcasts multilingual transcript updates.
8. The viewer app displays the selected language live.
9. The viewer app can switch between English, Malayalam, Hindi, and Bengali.
10. All packages build or typecheck successfully.
11. No unnecessary features were added.
