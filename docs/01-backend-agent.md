# Backend

The backend owns in-memory sessions and Socket.IO rooms. `SarvamProvider`
calls `/speech-to-text` followed by `/translate` for the three target
languages. If no API key is configured, `MockTranscriptionProvider` makes the
flow runnable without external services.
