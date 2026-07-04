# Soniox Backend API

The realtime backend exposes a small REST surface for frontend experiments with
Soniox AI. These endpoints are separate from the existing Socket.IO transcript
flow, so clients can test Soniox without changing the Sarvam-backed live room
protocol.

## Environment variables

The backend reads the Soniox SDK options from environment variables and maps
them to the SDK configuration keys below.

| Environment variable | Soniox SDK key |
| --- | --- |
| `SONIOX_API_KEY` | `api_key` |
| `SONIOX_REGION` | `region` |
| `SONIOX_BASE_DOMAIN` | `base_domain` |
| `SONIOX_API_BASE_URL` | `base_url` |
| `SONIOX_WS_URL` | `realtime.ws_base_url` |
| `SONIOX_TTS_API_URL` | `tts_api_url` |
| `SONIOX_TTS_WS_URL` | `realtime.tts_ws_url` |

Additional backend defaults:

| Environment variable | Default | Purpose |
| --- | --- | --- |
| `SONIOX_STT_MODEL` | `stt-rt-v5` | Realtime STT model used when a request does not provide `model`. |
| `SONIOX_STREAM_PACE_MS` | `60` | Throttle passed to `session.sendStream` as `pace_ms`. |

## Endpoints

All endpoints are mounted under the backend origin, for example
`http://localhost:4000` in local development.

### `GET /soniox/status`

Returns whether Soniox is configured and the non-secret endpoint overrides that
will be used by the SDK.

### `GET /soniox/config`

Returns frontend-safe Soniox settings. The API key is never returned; use the
`configured` boolean to decide whether to show Soniox actions in the UI.

### `POST /soniox/stt/transcribe-demo`

Transcribes the Soniox demo MP3 (`https://soniox.com/media/examples/coffee_shop.mp3`)
through `SonioxNodeClient.realtime.stt`.

Request body:

```json
{
  "model": "stt-rt-v5",
  "paceMs": 60
}
```

Response body:

```json
{
  "text": "...",
  "tokens": [],
  "model": "stt-rt-v5",
  "sourceUrl": "https://soniox.com/media/examples/coffee_shop.mp3"
}
```

### `POST /soniox/stt/transcribe-url`

Fetches an HTTP(S) audio URL on the backend, streams the response body to Soniox,
and returns the combined token text.

Request body:

```json
{
  "url": "https://example.com/audio.mp3",
  "model": "stt-rt-v5",
  "paceMs": 60
}
```

`url` is required. `model` and `paceMs` are optional.

## Notes for frontend callers

- Do not send `SONIOX_API_KEY` to the browser. The backend owns the SDK client.
- Call `GET /soniox/config` first and hide Soniox controls when `configured` is
  `false`.
- Use `POST /soniox/stt/transcribe-demo` for a quick smoke test before wiring a
  user-selected audio URL into `POST /soniox/stt/transcribe-url`.
