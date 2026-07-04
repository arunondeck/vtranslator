# Backend

The backend owns in-memory sessions and Socket.IO rooms. `SarvamProvider`
calls `/speech-to-text` followed by `/translate` for the three target
languages. If no API key is configured, `MockTranscriptionProvider` makes the
flow runnable without external services.


## Soniox REST endpoints

The backend also includes optional Soniox AI endpoints under `/soniox`. Configure `SONIOX_API_KEY` plus any endpoint overrides (`SONIOX_REGION`, `SONIOX_BASE_DOMAIN`, `SONIOX_API_BASE_URL`, `SONIOX_WS_URL`, `SONIOX_TTS_API_URL`, `SONIOX_TTS_WS_URL`) in `services/realtime-backend/.env`. Frontend-safe status/config responses are available at `/soniox/status` and `/soniox/config`; STT smoke tests are available at `/soniox/stt/transcribe-demo` and `/soniox/stt/transcribe-url`. See `docs/04-soniox-api.md` for request/response details.
