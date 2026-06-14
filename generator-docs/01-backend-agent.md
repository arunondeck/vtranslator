# 01-backend-agent.md

# Backend Agent Instructions

## Agent Ownership

You are responsible for:

```txt
services/realtime-backend/
packages/shared-types/
packages/shared-socket-contracts/
```

You may also update root monorepo config only if required:

```txt
package.json
pnpm-workspace.yaml
turbo.json
tsconfig.base.json
README.md
```

Do not modify:

```txt
apps/speaker-app/
apps/viewer-app/
```

## Goal

Create the realtime backend for the Translator MVP.

The backend receives live audio chunks from the speaker app, sends/processes
them with Sarvam AI, and broadcasts live transcription updates to viewer apps.

## Backend Tech

Use:

```txt
Node.js
TypeScript
Express
Socket.IO
```

Package name:

```txt
realtime-backend
```

Run command:

```bash
pnpm --filter realtime-backend dev
```

Default port:

```txt
4000
```

## Required Features

### 1. Express Health Route

Create:

```http
GET /health
```

Response:

```json
{
  "ok": true,
  "service": "realtime-backend"
}
```

### 2. Socket.IO Server

Support these events:

Speaker events:

```txt
speaker:start
speaker:audio-chunk
speaker:stop
```

Viewer events:

```txt
viewer:join
viewer:set-language
```

Broadcast events:

```txt
speaker:session-created
transcript:update
transcript:all
speaker:error
viewer:error
```

Use constants from:

```txt
packages/shared-socket-contracts
```

### 3. In-Memory Sessions

Use in-memory state only.

A session should look like:

```ts
type ActiveSession = {
  sessionId: string;
  speakerSocketId: string;
  startedAt: string;
  endedAt?: string;
  latestSequence: number;
  transcripts: {
    en: string;
    ml: string;
    hi: string;
    bn: string;
  };
};
```

Keep a `latestSessionId`.

If a viewer joins without a `sessionId`, attach them to the latest active
session.

### 4. Sarvam AI Integration

Create a Sarvam service wrapper:

```txt
services/realtime-backend/src/services/sarvam.service.ts
```

Expose a function like:

```ts
processAudioChunk(input: {
  sessionId: string;
  chunk: string;
  mimeType: string;
  sequence: number;
}): Promise<{
  en: string;
  ml: string;
  hi: string;
  bn: string;
  isFinal: boolean;
}>;
```

Use env vars:

```txt
SARVAM_API_KEY
SARVAM_API_BASE_URL
```

Important:

If exact Sarvam realtime API details are not available, create a clean adapter
with a mocked implementation behind a flag.

Use:

```txt
USE_MOCK_TRANSCRIPTION=true
```

When mock mode is enabled, generate dummy transcripts like:

```txt
English live transcript sequence 1
Malayalam live transcript sequence 1
Hindi live transcript sequence 1
Bengali live transcript sequence 1
```

Keep the Sarvam adapter structure clean so the real API can be plugged in
later.

### 5. Audio Chunk Handling

When the backend receives:

```txt
speaker:audio-chunk
```

Validate:

```ts
{
  sessionId: string;
  chunk: string;
  mimeType: string;
  sequence: number;
}
```

Then:

1. Find the active session.
2. Send the chunk to the Sarvam service.
3. Update the session transcript map.
4. Emit `transcript:all` to the session room.
5. Emit individual `transcript:update` events for each language.

Use Socket.IO rooms:

```txt
session:{sessionId}
```

### 6. Viewer Join

When a viewer emits:

```txt
viewer:join
```

Payload:

```ts
{
  sessionId?: string;
  language: 'en' | 'ml' | 'hi' | 'bn';
}
```

The backend should:

1. Resolve the session ID.
2. Join the viewer socket to the `session:{sessionId}` room.
3. Send the current `transcript:all` immediately.

### 7. Error Handling

Use simple error events.

Speaker error:

```ts
{
  message: string;
  code?: string;
}
```

Viewer error:

```ts
{
  message: string;
  code?: string;
}
```

Do not crash on invalid chunks.

## Suggested Folder Structure

```txt
services/realtime-backend/
├── src/
│   ├── index.ts
│   ├── socket.ts
│   ├── config.ts
│   ├── sessions/
│   │   └── session-store.ts
│   ├── services/
│   │   └── sarvam.service.ts
│   └── utils/
│       └── ids.ts
├── package.json
├── tsconfig.json
└── .env.example
```

## Shared Package Requirements

Create:

```txt
packages/shared-types/src/index.ts
packages/shared-socket-contracts/src/index.ts
```

Export all shared types and socket constants.

## Acceptance Criteria

The backend is accepted when:

1. `pnpm --filter realtime-backend dev` starts the server.
2. `GET /health` returns success.
3. A speaker socket can start a session.
4. The speaker receives `speaker:session-created`.
5. The backend accepts base64 audio chunks.
6. The backend emits transcript updates.
7. A viewer can join the latest session.
8. The viewer receives `transcript:all`.
9. The viewer receives live `transcript:update`.
10. Mock mode works without Sarvam credentials.
11. Real Sarvam integration is isolated inside the Sarvam service.
12. No database is added.
13. No authentication is added.
