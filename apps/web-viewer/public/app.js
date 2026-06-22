const LANGUAGE_LABELS = {
  en: 'English',
  ml: 'Malayalam',
  hi: 'Hindi',
  bn: 'Bengali',
};
const EMPTY_TRANSCRIPTS = { en: '', ml: '', hi: '', bn: '' };
const SOCKET_EVENTS = {
  VIEWER_JOIN: 'viewer:join',
  VIEWER_ERROR: 'viewer:error',
  TRANSCRIPT_UPDATE: 'transcript:update',
  TRANSCRIPT_ALL: 'transcript:all',
};

const config = {
  BACKEND_SOCKET_URL: 'http://localhost:4000',
  SITE_NAME: 'Translator Live Wall',
  SITE_VERSION: '0.1.0',
  DISPLAY_LANGUAGES: 'en,ml,hi,bn',
  ...(window.TRANSLATOR_WEB_CONFIG ?? {}),
};

const state = {
  transcripts: { ...EMPTY_TRANSCRIPTS },
  languages: parseLanguages(config.DISPLAY_LANGUAGES),
};

for (const element of document.querySelectorAll('[data-site-name]')) {
  element.textContent = config.SITE_NAME;
}
document.querySelector('[data-site-version]').textContent = config.SITE_VERSION;
document.title = `${config.SITE_NAME} v${config.SITE_VERSION}`;
renderLanguageSections();
loadSocketIoClient();

function parseLanguages(value) {
  const languages = String(value ?? '')
    .split(',')
    .map((language) => language.trim())
    .filter((language) => language in LANGUAGE_LABELS);
  return [...new Set(languages)].length > 0 ? [...new Set(languages)] : Object.keys(LANGUAGE_LABELS);
}

function renderLanguageSections() {
  const subtitles = document.querySelector('#subtitles');
  subtitles.replaceChildren(
    ...state.languages.map((language) => {
      const card = document.createElement('article');
      card.className = 'subtitle-card';
      card.innerHTML = `
        <div class="subtitle-header">
          <h2>${LANGUAGE_LABELS[language]}</h2>
          <span>${language.toUpperCase()}</span>
        </div>
        <p class="subtitle-text" id="subtitle-${language}">Waiting for translated subtitles...</p>
      `;
      return card;
    }),
  );
}

function loadSocketIoClient() {
  const script = document.createElement('script');
  script.src = `${config.BACKEND_SOCKET_URL.replace(/\/$/, '')}/socket.io/socket.io.js`;
  script.onload = connectSocket;
  script.onerror = () => showError('Unable to load the Socket.IO client from the backend.');
  document.body.append(script);
}

function connectSocket() {
  const socket = window.io(config.BACKEND_SOCKET_URL, {
    transports: ['websocket'],
  });
  const primaryLanguage = state.languages[0] ?? 'en';

  socket.on('connect', () => {
    setConnection('connected');
    hideError();
    socket.emit(SOCKET_EVENTS.VIEWER_JOIN, { language: primaryLanguage });
  });

  socket.on('disconnect', () => {
    setConnection('disconnected');
    showError('Socket connection lost. Waiting to reconnect...');
  });

  socket.io.on('reconnect_attempt', () => setConnection('connecting'));

  socket.on(SOCKET_EVENTS.TRANSCRIPT_ALL, (payload) => {
    state.transcripts = { ...state.transcripts, ...payload.transcripts };
    updateMeta(payload);
    renderTranscripts();
    hideError();
  });

  socket.on(SOCKET_EVENTS.TRANSCRIPT_UPDATE, (payload) => {
    state.transcripts[payload.language] = payload.text;
    updateMeta(payload);
    renderTranscripts();
  });

  socket.on(SOCKET_EVENTS.VIEWER_ERROR, ({ message }) => showError(message));
}

function renderTranscripts() {
  for (const language of state.languages) {
    document.querySelector(`#subtitle-${language}`).textContent =
      state.transcripts[language] || 'Waiting for translated subtitles...';
  }
}

function updateMeta(payload) {
  document.querySelector('#session').textContent = payload.sessionId ?? 'Waiting for speaker';
  document.querySelector('#sequence').textContent = String(payload.sequence ?? 0);
  document.querySelector('#updated').textContent = payload.updatedAt
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(payload.updatedAt))
    : 'Waiting for speech...';
}

function setConnection(value) {
  const element = document.querySelector('#connection');
  element.className = `tone-${value}`;
  element.textContent = value;
}

function showError(message) {
  const element = document.querySelector('#error');
  element.textContent = message;
  element.hidden = false;
}

function hideError() {
  document.querySelector('#error').hidden = true;
}
