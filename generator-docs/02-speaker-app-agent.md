# 02-speaker-app-agent.md

# Speaker App Agent Instructions

## Agent Ownership

You are responsible for:

```txt
apps/speaker-app/
```

You may read shared packages:

```txt
packages/shared-types/
packages/shared-socket-contracts/
```

Do not modify:

```txt
services/realtime-backend/
apps/viewer-app/
```

Only update root config if absolutely required for the app to run.

## Goal

Create a simple React Native Expo app that captures microphone audio and streams it to the backend over Socket.IO.

This app is for the person who is speaking.

## App Requirements

The app must be very simple.

One main screen.

UI should have:

- Title: `Translator Speaker`
- Connection status
- Session ID after connected
- One large button:
  - `Start Talking`
  - `Stop Talking`
- Small status text:
  - `Idle`
  - `Recording`
  - `Sending`
  - `Error`

No fancy UI.

No navigation required.

## Tech

Use:

- Expo
- React Native
- TypeScript
- `socket.io-client`
- `expo-av` or a suitable Expo audio recording package

Package name:

```txt
speaker-app
```

Run command:

```bash
pnpm --filter speaker-app start
```

## Environment Variable

Use:

```env
EXPO_PUBLIC_BACKEND_SOCKET_URL=http://localhost:4000
```

## Socket Flow

### On App Open

Connect to backend:

```ts
io(EXPO_PUBLIC_BACKEND_SOCKET_URL)
```

Show connection status:

- `Connected`
- `Disconnected`
- `Reconnecting`

### On Start Talking

1. Request microphone permission.
2. Emit:

```txt
speaker:start
```

Payload:

```ts
{
  sessionId?: string;
}
```

3. Wait for:

```txt
speaker:session-created
```

Payload:

```ts
{
  sessionId: string;
}
```

4. Start recording audio.
5. Send audio chunks repeatedly over the socket.

### Audio Chunk Event

Emit:

```txt
speaker:audio-chunk
```

Payload:

```ts
{
  sessionId: string;
  chunk: string;
  mimeType: string;
  sequence: number;
}
```

`chunk` must be base64-encoded audio data.

Increment `sequence` for every chunk.

### On Stop Talking

1. Stop recording.
2. Emit:

```txt
speaker:stop
```

Payload:

```ts
{
  sessionId: string;
}
```

3. Update the UI to idle.

## Audio MVP Guidance

This is a quick MVP.

If true realtime streaming from Expo recording is difficult, implement a pragmatic MVP:

1. Record short segments.
2. Every few seconds, stop the current segment.
3. Read the file as base64.
4. Send it as `speaker:audio-chunk`.
5. Start a new segment automatically while recording is active.

Prefer a working MVP over perfect low-latency streaming.

Target chunk duration:

```txt
2 seconds
```

Acceptable MVP latency:

```txt
2-5 seconds
```

## Suggested Folder Structure

```txt
apps/speaker-app/
├── App.tsx
├── src/
│   ├── socket/
│   │   └── socket-client.ts
│   ├── audio/
│   │   └── recorder.ts
│   ├── components/
│   │   └── StatusPill.tsx
│   └── config.ts
├── package.json
├── app.json
└── tsconfig.json
```

## UI States

Use these states:

```ts
type RecordingState =
  | 'idle'
  | 'requesting-permission'
  | 'recording'
  | 'stopping'
  | 'error';
```

## Error Handling

Show simple error messages for:

- Microphone permission denied
- Socket disconnected
- Backend error
- Recording failed
- Audio chunk send failed

Listen for:

```txt
speaker:error
```

Display the error message.

## Acceptance Criteria

The speaker app is accepted when:

1. App starts with Expo.
2. App connects to the backend socket.
3. UI shows connection status.
4. User can tap `Start Talking`.
5. App requests microphone permission.
6. App emits `speaker:start`.
7. App receives `speaker:session-created`.
8. App records microphone audio.
9. App sends base64 audio chunks with increasing sequence numbers.
10. User can tap `Stop Talking`.
11. App emits `speaker:stop`.
12. App handles socket disconnect without crashing.
13. No login is added.
14. No complex UI is added.
