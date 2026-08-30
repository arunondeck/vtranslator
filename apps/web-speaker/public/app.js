const SOCKET_EVENTS = {
  SPEAKER_START: 'speaker:start',
  SPEAKER_AUDIO_FRAME: 'speaker:audio-frame',
  SPEAKER_STOP: 'speaker:stop',
  SPEAKER_SESSION_CREATED: 'speaker:session-created',
  SPEAKER_ERROR: 'speaker:error',
};

const AUDIO_SAMPLE_RATE = 16_000;
// 2048 samples * 2 bytes — matches the native speaker app frame size.
const FRAME_BYTES = 4096;
const HEALTH_POLL_BASE_MS = 60_000;
const HEALTH_POLL_JITTER_MS = 5_000;

const config = {
  BACKEND_SOCKET_URL: 'http://localhost:4000',
  ...(window.TRANSLATOR_WEB_SPEAKER_CONFIG ?? {}),
};

const RECORDING_LABELS = {
  idle: 'Idle',
  'requesting-permission': 'Requesting microphone permission',
  recording: 'Recording and sending',
  stopping: 'Stopping',
  error: 'Error',
};

const state = {
  backendHealth: 'checking',
  backendHealthDetail: 'Checking health endpoint...',
  connection: 'disconnected',
  recording: 'idle',
  sessionId: undefined,
  errorMessage: undefined,
};

const elements = {
  backendHealth: document.querySelector('#backend-health'),
  backendHealthDetail: document.querySelector('#backend-health-detail'),
  backendStatus: document.querySelector('.backend-status'),
  connection: document.querySelector('#connection'),
  recording: document.querySelector('#recording'),
  session: document.querySelector('#session'),
  error: document.querySelector('#error'),
  mainAction: document.querySelector('#main-action'),
  statusText: document.querySelector('#status-text'),
  backendUrl: document.querySelector('#backend-url'),
};

let socket;
let streamer;
let pendingMediaStream;

elements.backendUrl.textContent = config.BACKEND_SOCKET_URL;
elements.mainAction.addEventListener('click', () => void handleMainAction());
void bootstrap();

async function bootstrap() {
  render();
  await waitForBackendHealth();
  state.connection = 'connecting';
  render();
  loadSocketIoClient();
}

function healthUrl() {
  return `${config.BACKEND_SOCKET_URL.replace(/\/$/, '')}/health`;
}

async function checkBackendHealth() {
  try {
    const response = await fetch(healthUrl(), { method: 'GET' });
    if (!response.ok) return false;
    const body = await response.json();
    return body?.ok === true;
  } catch {
    return false;
  }
}

function healthPollDelayMs() {
  return HEALTH_POLL_BASE_MS + Math.floor(Math.random() * HEALTH_POLL_JITTER_MS);
}

function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function waitForBackendHealth() {
  while (true) {
    state.backendHealth = 'checking';
    state.backendHealthDetail = 'Checking health endpoint...';
    render();

    if (await checkBackendHealth()) {
      state.backendHealth = 'online';
      state.backendHealthDetail = '';
      render();
      return;
    }

    const delayMs = healthPollDelayMs();
    const retryAt = Date.now() + delayMs;
    state.backendHealth = 'waiting';
    state.backendHealthDetail = `Backend unavailable. Retrying in ${Math.ceil(delayMs / 1000)}s...`;
    render();

    while (Date.now() < retryAt) {
      const remainingMs = retryAt - Date.now();
      state.backendHealthDetail = `Backend unavailable. Retrying in ${Math.ceil(remainingMs / 1000)}s...`;
      render();
      await sleep(Math.min(1_000, remainingMs));
    }
  }
}

function loadSocketIoClient() {
  const script = document.createElement('script');
  script.src = `${config.BACKEND_SOCKET_URL.replace(/\/$/, '')}/socket.io/socket.io.js`;
  script.onload = connectSocket;
  script.onerror = () => showError('Unable to load the Socket.IO client from the backend.');
  document.body.append(script);
}

function connectSocket() {
  socket = window.io(config.BACKEND_SOCKET_URL, { transports: ['websocket'] });

  socket.on('connect', () => {
    state.connection = 'connected';
    state.errorMessage = undefined;
    render();
  });

  socket.on('disconnect', () => {
    state.connection = 'disconnected';
    state.errorMessage = 'Socket disconnected.';
    void stopRecording(false).finally(() => {
      state.recording = 'error';
      render();
    });
  });

  socket.io.on('reconnect_attempt', () => {
    state.connection = 'reconnecting';
    render();
  });

  socket.on(SOCKET_EVENTS.SPEAKER_SESSION_CREATED, async ({ sessionId }) => {
    state.sessionId = sessionId;
    state.errorMessage = undefined;

    try {
      streamer = new PcmWebStreamer((frame) => {
        if (!socket?.connected || !state.sessionId) return;
        socket.emit(SOCKET_EVENTS.SPEAKER_AUDIO_FRAME, {
          sessionId: state.sessionId,
          audio: frame.audio,
          sequence: frame.sequence,
        });
      });
      await streamer.start(pendingMediaStream);
      pendingMediaStream = undefined;
      state.recording = 'recording';
    } catch (error) {
      if (pendingMediaStream) {
        for (const track of pendingMediaStream.getTracks()) {
          track.stop();
        }
        pendingMediaStream = undefined;
      }
      state.errorMessage = error instanceof Error ? error.message : 'Recording failed.';
      state.recording = 'error';
      if (socket.connected && sessionId) {
        socket.emit(SOCKET_EVENTS.SPEAKER_STOP, { sessionId });
      }
    }

    render();
  });

  socket.on(SOCKET_EVENTS.SPEAKER_ERROR, (error) => {
    if (pendingMediaStream) {
      for (const track of pendingMediaStream.getTracks()) {
        track.stop();
      }
      pendingMediaStream = undefined;
    }
    state.errorMessage = formatSocketError(error);
    state.recording = 'error';
    render();
  });
}

async function handleMainAction() {
  if (state.recording === 'recording') {
    await stopRecording(true);
    return;
  }

  await startTalking();
}

async function startTalking() {
  if (!socket?.connected) {
    state.errorMessage = 'Socket disconnected. Wait for the connection to return.';
    state.recording = 'error';
    render();
    return;
  }

  state.errorMessage = undefined;
  state.recording = 'requesting-permission';
  render();

  try {
    pendingMediaStream = await PcmWebStreamer.requestMicrophone();
    state.sessionId = undefined;
    socket.emit(SOCKET_EVENTS.SPEAKER_START, {});
  } catch (error) {
    pendingMediaStream = undefined;
    if (error instanceof MicrophonePermissionError) {
      state.errorMessage = 'Microphone permission denied.';
      state.recording = 'error';
      render();
      return;
    }
    state.errorMessage = error instanceof Error ? error.message : 'Recording failed.';
    state.recording = 'error';
    render();
  }
}

async function stopRecording(emitStop) {
  if (!streamer?.isActive) {
    const activeSessionId = state.sessionId;
    if (emitStop && activeSessionId && socket?.connected) {
      socket.emit(SOCKET_EVENTS.SPEAKER_STOP, { sessionId: activeSessionId });
    }
    state.recording = 'idle';
    render();
    return;
  }

  state.recording = 'stopping';
  render();

  try {
    await streamer.stop();
  } catch {
    state.errorMessage = 'Recording failed while stopping.';
    state.recording = 'error';
    render();
    return;
  }

  streamer = undefined;
  const activeSessionId = state.sessionId;
  if (emitStop && activeSessionId && socket?.connected) {
    socket.emit(SOCKET_EVENTS.SPEAKER_STOP, { sessionId: activeSessionId });
  }

  if (pendingMediaStream) {
    for (const track of pendingMediaStream.getTracks()) {
      track.stop();
    }
    pendingMediaStream = undefined;
  }

  state.recording = 'idle';
  render();
}

function render() {
  renderBackendHealth();

  elements.connection.className = `tone-${state.connection}`;
  elements.connection.textContent = state.connection;

  const isRecording = state.recording === 'recording';
  elements.recording.className = isRecording ? 'tone-recording' : state.recording === 'error' ? 'tone-error' : '';
  elements.recording.textContent = isRecording ? 'Recording' : RECORDING_LABELS[state.recording] ?? 'Idle';

  elements.session.textContent = state.sessionId ?? 'Not started';

  const isBusy = state.recording === 'requesting-permission' || state.recording === 'stopping';
  const canStart = state.backendHealth === 'online' && state.connection === 'connected' && !isBusy;

  elements.mainAction.disabled = !canStart && !isRecording;
  elements.mainAction.textContent = isBusy ? 'Please wait...' : isRecording ? 'Stop Talking' : 'Start Talking';
  elements.mainAction.classList.toggle('is-recording', isRecording);
  elements.mainAction.classList.toggle('is-busy', isBusy);

  elements.statusText.textContent = RECORDING_LABELS[state.recording] ?? 'Idle';
  elements.statusText.classList.toggle('is-error', state.recording === 'error');

  if (state.errorMessage) {
    showError(state.errorMessage);
  } else {
    hideError();
  }
}

function renderBackendHealth() {
  const labels = {
    checking: 'Checking...',
    waiting: 'Unavailable',
    online: 'Online',
  };

  elements.backendStatus.className = `backend-status backend-health-${state.backendHealth}`;
  elements.backendHealth.textContent = labels[state.backendHealth] ?? 'Unknown';

  if (state.backendHealthDetail) {
    elements.backendHealthDetail.textContent = state.backendHealthDetail;
    elements.backendHealthDetail.hidden = false;
  } else if (state.backendHealth === 'online') {
    elements.backendHealthDetail.textContent = `Health check passed at ${healthUrl()}`;
    elements.backendHealthDetail.hidden = false;
  } else {
    elements.backendHealthDetail.hidden = true;
    elements.backendHealthDetail.textContent = '';
  }
}

function showError(message) {
  elements.error.textContent = message;
  elements.error.hidden = false;
}

function hideError() {
  elements.error.hidden = true;
}

function formatSocketError(error) {
  if (!error) return 'Backend error.';
  const parts = [error.message || 'Backend error.'];
  const details = [
    error.code ? `code=${error.code}` : undefined,
    error.service ? `service=${error.service}` : undefined,
    error.sessionId ? `session=${error.sessionId}` : undefined,
  ].filter(Boolean);

  if (details.length > 0) {
    parts.push(`Debug: ${details.join(', ')}`);
  }

  return parts.join('\n');
}

class MicrophonePermissionError extends Error {
  constructor() {
    super('Microphone permission denied.');
    this.name = 'MicrophonePermissionError';
  }
}

/**
 * Captures microphone audio, resamples to 16 kHz mono PCM16, and emits
 * base64 frames compatible with the native speaker app socket contract.
 */
class PcmWebStreamer {
  constructor(onFrame) {
    this.onFrame = onFrame;
    this.active = false;
    this.sequence = 0;
    this.audioContext = undefined;
    this.mediaStream = undefined;
    this.processor = undefined;
    this.source = undefined;
    this.pendingSamples = new Float32Array(0);
  }

  get isActive() {
    return this.active;
  }

  static async requestMicrophone() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('This browser does not support microphone capture.');
    }

    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
        video: false,
      });
    } catch (error) {
      if (error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError')) {
        throw new MicrophonePermissionError();
      }
      throw error;
    }
  }

  async start(mediaStream) {
    if (this.active) return;
    if (!mediaStream) {
      throw new Error('Microphone stream is not available.');
    }

    this.active = true;
    this.sequence = 0;
    this.pendingSamples = new Float32Array(0);
    this.mediaStream = mediaStream;

    await this.beginCapture();
  }

  async stop() {
    if (!this.active) return;
    this.active = false;
    this.onFrame = undefined;
    this.pendingSamples = new Float32Array(0);

    this.processor?.disconnect();
    this.source?.disconnect();
    this.processor = undefined;
    this.source = undefined;

    for (const track of this.mediaStream?.getTracks() ?? []) {
      track.stop();
    }
    this.mediaStream = undefined;

    if (this.audioContext) {
      await this.audioContext.close().catch(() => undefined);
      this.audioContext = undefined;
    }
  }

  async beginCapture() {
    this.audioContext = new AudioContext();
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
    this.source = this.audioContext.createMediaStreamSource(this.mediaStream);
    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

    this.processor.onaudioprocess = (event) => {
      if (!this.active || !this.onFrame) return;

      const input = event.inputBuffer.getChannelData(0);
      const resampled = resample(input, this.audioContext.sampleRate, AUDIO_SAMPLE_RATE);
      this.pendingSamples = concatFloat32(this.pendingSamples, resampled);

      const frameSamples = FRAME_BYTES / 2;
      while (this.pendingSamples.length >= frameSamples) {
        const chunk = this.pendingSamples.slice(0, frameSamples);
        this.pendingSamples = this.pendingSamples.slice(frameSamples);
        this.sequence += 1;
        this.onFrame({
          audio: floatToBase64Pcm16(chunk),
          sequence: this.sequence,
        });
      }
    };

    this.source.connect(this.processor);
    const silent = this.audioContext.createGain();
    silent.gain.value = 0;
    this.processor.connect(silent);
    silent.connect(this.audioContext.destination);
  }
}

function resample(input, inputRate, outputRate) {
  if (inputRate === outputRate) return input;

  const ratio = inputRate / outputRate;
  const outputLength = Math.floor(input.length / ratio);
  const output = new Float32Array(outputLength);

  for (let index = 0; index < outputLength; index += 1) {
    const sourceIndex = index * ratio;
    const left = Math.floor(sourceIndex);
    const right = Math.min(left + 1, input.length - 1);
    const fraction = sourceIndex - left;
    output[index] = input[left] * (1 - fraction) + input[right] * fraction;
  }

  return output;
}

function concatFloat32(left, right) {
  const merged = new Float32Array(left.length + right.length);
  merged.set(left, 0);
  merged.set(right, left.length);
  return merged;
}

function floatToBase64Pcm16(samples) {
  const buffer = new ArrayBuffer(samples.length * 2);
  const view = new DataView(buffer);

  for (let index = 0; index < samples.length; index += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[index]));
    const int16 = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    view.setInt16(index * 2, int16, true);
  }

  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }

  return btoa(binary);
}
