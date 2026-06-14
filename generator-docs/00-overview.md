# 00-overview.md

# Translator MVP - Monorepo Overview

## Goal

Build a quick MVP for a realtime multilingual transcription system.

The system has:

1. A backend service that receives live microphone audio from a speaker app.
2. A React Native speaker app with one button to start/stop talking.
3. A React Native viewer app that lets a user select a language and view live transcription.
4. Sarvam AI integration for transcription/translation.

This is a quick MVP. Keep it simple.

Do not build authentication, accounts, database persistence, analytics, admin panels, queues, payment systems, history, user roles, production deployment, or complex UI.

## Monorepo Structure

Create a monorepo named:

```txt
translator-mvp/
```

Expected structure:

```txt
translator-mvp/
├── apps/
│   ├── speaker-app/
│   └── viewer-app/
│
├── services/
│   └── realtime-backend/
│
├── packages/
│   ├── shared-types/
│   └── shared-socket-contracts/
│
├── docs/
│   ├── 00-overview.md
│   ├── 01-backend-agent.md
│   ├── 02-speaker-app-agent.md
│   └── 03-viewer-app-agent.md
│
├── package.json
├── turbo.json
├── tsconfig.base.json
└── README.md
```

## Tech Stack

Use:

```txt
Monorepo: pnpm workspaces + Turborepo
Backend: Node.js + TypeScript + Express + Socket.IO
Apps: React Native with Expo + TypeScript
Shared packages: TypeScript
AI Provider: Sarvam AI
```

## MVP Flow

```txt
Speaker App
  records mic audio
  sends audio chunks over socket
      ↓
Realtime Backend
  receives audio chunks
  sends/processes audio with Sarvam AI
  produces text in English, Malayalam, Hindi, Bengali
      ↓
Viewer App
  selects language
  receives live transcript update
  displays selected language text
```

## Languages

Use these fixed language keys everywhere:

```ts
export type SupportedLanguage = 'en' | 'ml' | 'hi' | 'bn';
```

Display labels:

```ts
export const LANGUAGE_LABELS = {
  en: 'English',
  ml: 'Malayalam',
  hi: 'Hindi',
  bn: 'Bengali',
};
```

## Socket Contract

Use Socket.IO.

### Speaker to Backend

```ts
'speaker:start'
```

Payload:

```ts
{
  sessionId?: string;
}
```

Backend responds by creating or reusing a session.

---

```ts
'speaker:audio-chunk'
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

`chunk` should be base64 encoded audio data.

---

```ts
'speaker:stop'
```

Payload:

```ts
{
  sessionId: string;
}
```

---

### Backend to Speaker

```ts
'speaker:session-created'
```

Payload:

```ts
{
  sessionId: string;
}
```

---

```ts
'speaker:error'
```

Payload:

```ts
{
  message: string;
  code?: string;
}
```

---

### Viewer to Backend

```ts
'viewer:join'
```

Payload:

```ts
{
  sessionId?: string;
  language: SupportedLanguage;
}
```

If `sessionId` is omitted, join the latest active session.

---

```ts
'viewer:set-language'
```

Payload:

```ts
{
  language: SupportedLanguage;
}
```

---

### Backend to Viewer

```ts
'transcript:update'
```

Payload:

```ts
{
  sessionId: string;
  language: SupportedLanguage;
  text: string;
  isFinal: boolean;
  sequence: number;
  updatedAt: string;
}
```

---

```ts
'transcript:all'
```

Payload:

```ts
{
  sessionId: string;
  transcripts: {
    en: string;
    ml: string;
    hi: string;
    bn: string;
  };
  sequence: number;
  updatedAt: string;
}
```

---

```ts
'viewer:error'
```

Payload:

```ts
{
  message: string;
  code?: string;
}
```

## Shared Packages

### packages/shared-types

Contains shared TypeScript types.

Required exports:

```ts
export type SupportedLanguage = 'en' | 'ml' | 'hi' | 'bn';

export type TranscriptMap = {
  en: string;
  ml: string;
  hi: string;
  bn: string;
};

export type TranscriptUpdate = {
  sessionId: string;
  language: SupportedLanguage;
  text: string;
  isFinal: boolean;
  sequence: number;
  updatedAt: string;
};
```

### packages/shared-socket-contracts

Contains socket event names and payload types.

Required exports:

```ts
export const SOCKET_EVENTS = {
  SPEAKER_START: 'speaker:start',
  SPEAKER_AUDIO_CHUNK: 'speaker:audio-chunk',
  SPEAKER_STOP: 'speaker:stop',
  SPEAKER_SESSION_CREATED: 'speaker:session-created',
  SPEAKER_ERROR: 'speaker:error',

  VIEWER_JOIN: 'viewer:join',
  VIEWER_SET_LANGUAGE: 'viewer:set-language',
  VIEWER_ERROR: 'viewer:error',

  TRANSCRIPT_UPDATE: 'transcript:update',
  TRANSCRIPT_ALL: 'transcript:all',
} as const;
```

## Environment Variables

Backend requires:

```txt
PORT=4000
SARVAM_API_KEY=
SARVAM_API_BASE_URL=
CORS_ORIGIN=*
```

Apps require:

```txt
EXPO_PUBLIC_BACKEND_SOCKET_URL=http://localhost:4000
```

## Development Commands

Root scripts should support:

```bash
pnpm install
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
```

Package-specific examples:

```bash
pnpm --filter realtime-backend dev
pnpm --filter speaker-app start
pnpm --filter viewer-app start
```

## Important MVP Constraints

Do not overbuild.

Do not add:

```txt
Authentication
Database
ORM
Redis
Message queues
Docker
Kubernetes
Admin dashboard
User management
Persistent transcript history
Complex styling
Native custom modules unless absolutely required
```

In-memory session state is enough.

## Definition of Done

The MVP is done when:

1. Backend starts locally.
2. Speaker app can connect to backend.
3. Speaker app can start/stop audio capture.
4. Speaker app sends audio chunks to backend.
5. Backend receives chunks.
6. Backend integrates with Sarvam AI or provides a clean mocked fallback if API details are incomplete.
7. Backend emits transcript updates for English, Malayalam, Hindi, and Bengali.
8. Viewer app connects to backend.
9. Viewer app can select one of four languages.
10. Viewer app displays live transcript updates.
11. All apps work from the same monorepo.
