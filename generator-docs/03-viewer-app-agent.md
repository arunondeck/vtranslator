# 03-viewer-app-agent.md

# Viewer App Agent Instructions

## Agent Ownership

You are responsible for:

```txt
apps/viewer-app/
```

You may read:

```txt
packages/shared-types/
packages/shared-socket-contracts/
```

Do not modify:

```txt
services/realtime-backend/
apps/speaker-app/
```

Only update root monorepo configuration if absolutely necessary for the application to run.

## Goal

Create a simple React Native Expo application that displays live translated transcripts coming from the backend.

The app is intended for people viewing the translation.

The viewer chooses a language and sees the live transcription stream update in realtime.

This application should remain extremely simple.

No authentication.

No persistence.

No history.

No navigation.

No settings screens.

No admin functionality.

## Tech Stack

Use:

```txt
Expo
React Native
TypeScript
socket.io-client
```

Package name:

```txt
viewer-app
```

Run command:

```bash
pnpm --filter viewer-app start
```

## Environment Variable

Use:

```env
EXPO_PUBLIC_BACKEND_SOCKET_URL=http://localhost:4000
```

## UI Requirements

Single screen only.

Layout:

```txt
----------------------------------
Translator Viewer
----------------------------------
Connection Status

Language Selector
[ English ▼ ]
----------------------------------
Live Translation
----------------------------------
<transcript text>
----------------------------------
Session ID
----------------------------------
abc123
```

Keep styling minimal.

Focus on readability.

Transcript area should:

- support long text
- scroll automatically as content grows
- have large readable font
- update live

## Supported Languages

Use the shared type:

```ts
type SupportedLanguage =
  | 'en'
  | 'ml'
  | 'hi'
  | 'bn';
```

Display labels:

- English
- Malayalam
- Hindi
- Bengali

Default selection:

```txt
English
```

## Socket Connection

Connect immediately when app launches.

Example:

```ts
io(EXPO_PUBLIC_BACKEND_SOCKET_URL)
```

Track:

- Connected
- Disconnected
- Reconnecting

Display connection status.

## Viewer Join Flow

When socket connects, emit:

```txt
viewer:join
```

Payload:

```ts
{
  language: selectedLanguage;
}
```

Do not require session ID.

Backend should automatically attach viewer to the latest active session.

## Language Change Flow

When user changes language, emit:

```txt
viewer:set-language
```

Payload:

```ts
{
  language: selectedLanguage;
}
```

Update local state immediately.

## Transcript Events

### `transcript:all`

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

Store:

- `transcripts.en`
- `transcripts.ml`
- `transcripts.hi`
- `transcripts.bn`

Display transcript matching the selected language.

### `transcript:update`

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

Update only the specified language transcript.

Refresh the displayed content if it is currently selected.

## Session Information

Store:

```txt
sessionId
```

Display it near the bottom of the screen.

If no active session exists, show:

```txt
Waiting for speaker...
```

## Reconnection Handling

If socket disconnects:

- Show disconnected status.

When socket reconnects:

- Re-emit `viewer:join`.
- Request latest transcript automatically.

Viewer should recover without user action.

## Error Handling

Listen for:

```txt
viewer:error
```

Payload:

```ts
{
  message: string;
  code?: string;
}
```

Display a simple error banner.

Examples:

- Unable to join session
- Backend unavailable
- Invalid language
- Connection lost

Do not crash.

## State Structure

Suggested state:

```ts
type ViewerState = {
  selectedLanguage: SupportedLanguage;
  sessionId?: string;
  transcripts: {
    en: string;
    ml: string;
    hi: string;
    bn: string;
  };
  connectionStatus:
    | 'connected'
    | 'disconnected'
    | 'reconnecting';
  error?: string;
};
```

## Suggested Folder Structure

```txt
apps/viewer-app/
├── App.tsx
├── src/
│   ├── socket/
│   │   └── socket-client.ts
│   ├── components/
│   │   ├── LanguageSelector.tsx
│   │   ├── TranscriptView.tsx
│   │   └── ConnectionStatus.tsx
│   ├── hooks/
│   │   └── useTranscript.ts
│   └── config.ts
├── package.json
├── app.json
└── tsconfig.json
```

## Acceptance Criteria

Viewer app is accepted when:

1. App launches successfully in Expo.
2. Socket connection is established.
3. Connection status is visible.
4. App emits `viewer:join`.
5. App receives `transcript:all`.
6. User can switch languages.
7. App emits `viewer:set-language`.
8. Live transcript updates appear automatically.
9. Session ID is displayed.
10. Viewer reconnects automatically after connection loss.
11. Errors are shown without crashing.
12. No authentication is added.
13. No database is added.
14. No navigation is added.
15. No unnecessary features are added.

## Definition of Done

The viewer app is complete when:

1. A speaker starts talking from the speaker app.
2. Backend receives audio.
3. Backend generates multilingual transcript updates.
4. Viewer receives updates.
5. Viewer can switch between English, Malayalam, Hindi, and Bengali.
6. Transcript updates appear live without requiring refresh.
7. The app remains stable during disconnect/reconnect scenarios.
