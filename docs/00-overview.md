# Translator MVP - Monorepo Overview

This repository contains an Expo speaker, an Expo transcript viewer, a
Socket.IO backend, and shared TypeScript contracts. It is deliberately an
in-memory MVP: there is no authentication, persistence, queue, or deployment
configuration.

The speaker records short consecutive audio files and sends each completed
file as a base64 chunk. The backend serializes processing per session,
transcribes each chunk, translates its English text, appends the result, and
publishes the latest transcript to viewers.
