const LANGUAGE_LABELS = {
  en: 'English',
  ml: 'Malayalam',
  hi: 'Hindi',
  bn: 'Bengali',
};
const SUPPORTED_LANGUAGES = Object.keys(LANGUAGE_LABELS);
const EMPTY_TRANSCRIPTS = { en: '', ml: '', hi: '', bn: '' };
const TRANSLATION_SERVICES = ['soniox', 'sarvam'];

const SOCKET_EVENTS = {
  SPEAKER_START: 'speaker:start',
  SPEAKER_AUDIO_FRAME: 'speaker:audio-frame',
  SPEAKER_STOP: 'speaker:stop',
  SPEAKER_SESSION_CREATED: 'speaker:session-created',
  SPEAKER_ERROR: 'speaker:error',
  VIEWER_JOIN: 'viewer:join',
  VIEWER_SET_LANGUAGE: 'viewer:set-language',
  VIEWER_ERROR: 'viewer:error',
  TRANSCRIPT_UPDATE: 'transcript:update',
  TRANSCRIPT_ALL: 'transcript:all',
  SPEAKER_VAD: 'speaker:vad',
};

const AUDIO_SAMPLE_RATE = 16_000;
const FRAME_BYTES = 4096;

const config = loadConfig();

function loadConfig() {
  const runtime = window.TRANSLATOR_WEB_CONFIG;
  if (!runtime?.BACKEND_SOCKET_URL) {
    throw new Error(
      'Missing BACKEND_SOCKET_URL. Copy apps/web-viewer/.env.example to .env and run via pnpm dev, or deploy with VITE_BACKEND_SOCKET_URL set.',
    );
  }
  return {
    BACKEND_SOCKET_URL: runtime.BACKEND_SOCKET_URL,
    SITE_NAME: runtime.SITE_NAME ?? 'Translator',
    SITE_VERSION: runtime.SITE_VERSION ?? '0.1.0',
  };
}

const RECORDING_LABELS = {
  idle: 'Idle',
  'requesting-permission': 'Requesting microphone permission',
  recording: 'Recording and sending',
  stopping: 'Stopping',
  error: 'Error',
};

const state = {
  connection: 'connecting',
  recording: 'idle',
  speakerSessionId: undefined,
  viewerJoined: false,
  selectedLanguage: 'en',
  selectedService: 'soniox',
  sonioxConfigured: undefined,
  transcripts: { ...EMPTY_TRANSCRIPTS },
  sequence: 0,
  speakerError: undefined,
  viewerError: undefined,
};

const elements = {
  connection: document.querySelector('#connection'),
  recording: document.querySelector('#recording'),
  speaking: document.querySelector('#speaking'),
  speakerError: document.querySelector('#speaker-error'),
  mainAction: document.querySelector('#main-action'),
  translationService: document.querySelector('#translation-service'),
  statusText: document.querySelector('#status-text'),
  languageOptions: document.querySelector('#language-options'),
  viewerError: document.querySelector('#viewer-error'),
  selectedLanguageLabel: document.querySelector('#selected-language-label'),
  transcript: document.querySelector('#transcript'),
  session: document.querySelector('#session'),
  sequence: document.querySelector('#sequence'),
  updated: document.querySelector('#updated'),
};

let socket;
let streamer;

for (const element of document.querySelectorAll('[data-site-name]')) {
  element.textContent = config.SITE_NAME;
}
document.querySelector('[data-site-version]').textContent = config.SITE_VERSION;
document.title = `${config.SITE_NAME} v${config.SITE_VERSION}`;

renderLanguageOptions();
elements.translationService.addEventListener('change', () => {
  selectTranslationService(elements.translationService.value);
});
elements.mainAction.addEventListener('click', () => void handleMainAction());
render();
void loadSonioxConfig();
loadSocketIoClient();

function renderLanguageOptions() {
  elements.languageOptions.replaceChildren(
    ...SUPPORTED_LANGUAGES.map((language) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'language-option';
      button.dataset.language = language;
      button.setAttribute('role', 'radio');
      button.setAttribute('aria-checked', String(language === state.selectedLanguage));
      button.textContent = LANGUAGE_LABELS[language];
      button.addEventListener('click', () => selectLanguage(language));
      return button;
    }),
  );
}

function selectLanguage(language) {
  if (!SUPPORTED_LANGUAGES.includes(language)) return;

  state.selectedLanguage = language;
  state.viewerError = undefined;
  renderLanguageOptions();
  renderTranscript();

  if (socket?.connected && state.viewerJoined) {
    socket.emit(SOCKET_EVENTS.VIEWER_SET_LANGUAGE, { language });
  } else if (socket?.connected && state.speakerSessionId) {
    joinViewer(state.speakerSessionId);
  }
}

function selectTranslationService(service) {
  if (!TRANSLATION_SERVICES.includes(service) || state.recording === 'recording') {
    elements.translationService.value = state.selectedService;
    return;
  }

  state.selectedService = service;
  state.speakerError = undefined;
  render();
}

async function loadSonioxConfig() {
  try {
    const response = await fetch(`${config.BACKEND_SOCKET_URL.replace(/\/$/, '')}/soniox/config`);
    if (!response.ok) throw new Error(`Soniox config failed (${response.status})`);
    const sonioxConfig = await response.json();
    state.sonioxConfigured = Boolean(sonioxConfig.configured);
  } catch {
    state.sonioxConfigured = false;
  }
  render();
}

function loadSocketIoClient() {
  const script = document.createElement('script');
  script.src = `${config.BACKEND_SOCKET_URL.replace(/\/$/, '')}/socket.io/socket.io.js`;
  script.onload = connectSocket;
  script.onerror = () => {
    state.speakerError = 'Unable to load the Socket.IO client from the backend.';
    render();
  };
  document.body.append(script);
}

function connectSocket() {
  socket = window.io(config.BACKEND_SOCKET_URL, { transports: ['websocket'] });

  socket.on('connect', () => {
    state.connection = 'connected';
    state.speakerError = undefined;
    render();

    if (state.speakerSessionId) {
      joinViewer(state.speakerSessionId);
    }
  });

  socket.on('disconnect', () => {
    state.connection = 'disconnected';
    state.viewerJoined = false;
    state.viewerError = 'Socket connection lost. Waiting to reconnect...';
    void stopRecording(false).finally(() => {
      state.recording = 'idle';
      render();
    });
  });

  socket.io.on('reconnect_attempt', () => {
    state.connection = 'connecting';
    render();
  });

  socket.on(SOCKET_EVENTS.SPEAKER_SESSION_CREATED, ({ sessionId }) => {
    state.speakerSessionId = sessionId;
    state.speakerError = undefined;

    try {
      streamer = new PcmWebStreamer((frame) => {
        if (!socket?.connected || !state.speakerSessionId) return;
        socket.emit(SOCKET_EVENTS.SPEAKER_AUDIO_FRAME, {
          sessionId: state.speakerSessionId,
          audio: frame.audio,
          sequence: frame.sequence,
        });
      });
      streamer.start();
      state.recording = 'recording';
      joinViewer(sessionId);
    } catch (error) {
      state.speakerError = error instanceof Error ? error.message : 'Recording failed.';
      state.recording = 'error';
      if (socket.connected && sessionId) {
        socket.emit(SOCKET_EVENTS.SPEAKER_STOP, { sessionId });
      }
    }

    render();
  });

  socket.on(SOCKET_EVENTS.SPEAKER_ERROR, ({ message }) => {
    state.speakerError = message || 'Backend error.';
    state.recording = 'error';
    render();
  });

  socket.on(SOCKET_EVENTS.TRANSCRIPT_ALL, (payload) => {
    state.transcripts = { ...state.transcripts, ...payload.transcripts };
    state.viewerJoined = true;
    state.viewerError = undefined;
    updateMeta(payload);
    renderTranscript();
    render();
  });

  socket.on(SOCKET_EVENTS.TRANSCRIPT_UPDATE, (payload) => {
    state.transcripts[payload.language] = payload.text;
    state.viewerJoined = true;
    updateMeta(payload);
    renderTranscript();
  });

  socket.on(SOCKET_EVENTS.SPEAKER_VAD, (payload) => setSpeaking(Boolean(payload?.speaking)));

  socket.on(SOCKET_EVENTS.VIEWER_ERROR, ({ message }) => {
    if (message?.includes('No active session')) {
      state.viewerJoined = false;
      return;
    }
    state.viewerError = message;
    render();
  });
}

function joinViewer(sessionId) {
  socket.emit(SOCKET_EVENTS.VIEWER_JOIN, {
    sessionId,
    language: state.selectedLanguage,
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
    state.speakerError = 'Socket disconnected. Wait for the connection to return.';
    state.recording = 'error';
    render();
    return;
  }

  state.speakerError = undefined;
  state.recording = 'requesting-permission';
  render();

  try {
    const hasPermission = await PcmWebStreamer.requestPermission();
    if (!hasPermission) {
      state.speakerError = 'Microphone permission denied.';
      state.recording = 'error';
      render();
      return;
    }

    state.speakerSessionId = undefined;
    state.viewerJoined = false;
    socket.emit(SOCKET_EVENTS.SPEAKER_START, {
      service: state.selectedService,
    });
  } catch (error) {
    state.speakerError = error instanceof Error ? error.message : 'Recording failed.';
    state.recording = 'error';
    render();
  }
}

async function stopRecording(emitStop) {
  if (!streamer?.isActive) {
    const activeSessionId = state.speakerSessionId;
    if (emitStop && activeSessionId && socket?.connected) {
      socket.emit(SOCKET_EVENTS.SPEAKER_STOP, { sessionId: activeSessionId });
    }
    state.recording = 'idle';
    state.viewerJoined = false;
    render();
    return;
  }

  state.recording = 'stopping';
  render();

  try {
    await streamer.stop();
  } catch {
    state.speakerError = 'Recording failed while stopping.';
    state.recording = 'error';
    render();
    return;
  }

  streamer = undefined;
  const activeSessionId = state.speakerSessionId;
  if (emitStop && activeSessionId && socket?.connected) {
    socket.emit(SOCKET_EVENTS.SPEAKER_STOP, { sessionId: activeSessionId });
  }

  state.recording = 'idle';
  state.viewerJoined = false;
  render();
}

function renderTranscript() {
  const text = state.transcripts[state.selectedLanguage];
  elements.selectedLanguageLabel.textContent = LANGUAGE_LABELS[state.selectedLanguage];
  elements.transcript.textContent = text || 'Waiting for translated subtitles...';
  if (text) {
    elements.transcript.scrollTop = elements.transcript.scrollHeight;
  }
}

function setSpeaking(speaking) {
  elements.speaking.classList.toggle('mic-speaking', speaking);
  elements.speaking.classList.toggle('mic-idle', !speaking);
  elements.speaking.firstChild.textContent = speaking ? 'Speaking' : 'Idle';
}

function updateMeta(payload) {
  state.sequence = payload.sequence ?? state.sequence;
  elements.session.textContent = payload.sessionId ?? state.speakerSessionId ?? 'Waiting for speaker';
  elements.sequence.textContent = `Seq ${state.sequence}`;
  elements.updated.textContent = payload.updatedAt
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(payload.updatedAt))
    : 'Waiting for speech...';
}

function render() {
  elements.connection.className = `tone-${state.connection}`;
  elements.connection.textContent = state.connection;

  const isRecording = state.recording === 'recording';
  elements.recording.className = isRecording ? 'tone-recording' : state.recording === 'error' ? 'tone-error' : '';
  elements.recording.textContent = isRecording ? 'Recording' : RECORDING_LABELS[state.recording] ?? 'Idle';

  const isBusy = state.recording === 'requesting-permission' || state.recording === 'stopping';
  const canStart = state.connection === 'connected' && !isBusy;

  elements.mainAction.disabled = !canStart && !isRecording;
  elements.mainAction.textContent = isBusy ? 'Please wait...' : isRecording ? 'Stop Talking' : 'Start Talking';
  elements.mainAction.classList.toggle('is-recording', isRecording);
  elements.mainAction.classList.toggle('is-busy', isBusy);
  elements.mainAction.setAttribute('aria-label', elements.mainAction.textContent);

  elements.statusText.textContent = RECORDING_LABELS[state.recording] ?? 'Idle';
  elements.statusText.classList.toggle('is-error', state.recording === 'error');
  elements.translationService.value = state.selectedService;
  elements.translationService.disabled = isRecording || isBusy;

  if (
    state.selectedService === 'soniox' &&
    state.sonioxConfigured === false &&
    !state.speakerError
  ) {
    elements.speakerError.textContent =
      'Sonic is selected, but the backend Soniox endpoint is not configured.';
    elements.speakerError.hidden = false;
  } else if (state.speakerError) {
    elements.speakerError.textContent = state.speakerError;
    elements.speakerError.hidden = false;
  } else {
    elements.speakerError.hidden = true;
  }

  for (const button of elements.languageOptions.querySelectorAll('.language-option')) {
    const language = button.dataset.language;
    const selected = language === state.selectedLanguage;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-checked', String(selected));
  }

  if (state.viewerError) {
    elements.viewerError.textContent = state.viewerError;
    elements.viewerError.hidden = false;
  } else {
    elements.viewerError.hidden = true;
  }
}

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

  static async requestPermission() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('This browser does not support microphone capture.');
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
      video: false,
    });

    for (const track of stream.getTracks()) {
      track.stop();
    }

    return true;
  }

  start() {
    if (this.active) return;

    this.active = true;
    this.sequence = 0;
    this.pendingSamples = new Float32Array(0);

    void this.beginCapture();
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
    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
      video: false,
    });

    this.audioContext = new AudioContext();
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
    this.processor.connect(this.audioContext.destination);
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
