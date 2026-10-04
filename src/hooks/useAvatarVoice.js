import { useCallback, useEffect, useRef, useState } from 'react';

const EMPTY = { phase: 'idle', voiceActive: false, isSpeaking: false, playbackBlocked: false, micLevel: 0, error: '', hint: '', visemes: [], visemeSystem: 'sapi', provider: '' };
const SILENCE = 'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQIAAAAAAA==';
const permissionHint = 'Allow microphone access in this browser and Windows microphone privacy settings. If this embedded browser cannot grant access, open the app in Chrome or Edge.';

export function encodeMonoWav(chunks, inputRate) {
  const input = new Float32Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0;
  chunks.forEach(chunk => { input.set(chunk, offset); offset += chunk.length; });
  const rate = 16000, ratio = inputRate / rate;
  const count = Math.min(Math.floor(input.length / ratio), rate * 29);
  const buffer = new ArrayBuffer(44 + count * 2), view = new DataView(buffer);
  const word = (at, value) => [...value].forEach((char, index) => view.setUint8(at + index, char.charCodeAt(0)));
  word(0, 'RIFF'); view.setUint32(4, 36 + count * 2, true); word(8, 'WAVE'); word(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  word(36, 'data'); view.setUint32(40, count * 2, true);
  for (let i = 0; i < count; i++) {
    let total = 0, samples = 0;
    for (let j = Math.floor(i * ratio); j < Math.max(Math.floor((i + 1) * ratio), Math.floor(i * ratio) + 1); j++) { total += input[j] || 0; samples++; }
    const value = Math.max(-1, Math.min(1, total / samples));
    view.setInt16(44 + i * 2, value * (value < 0 ? 32768 : 32767), true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

function friendlyMicrophoneError(error) {
  if (['NotAllowedError', 'SecurityError'].includes(error?.name)) return 'Microphone permission is blocked. ' + permissionHint;
  if (error?.name === 'NotFoundError') return 'No microphone was found. Connect or select a microphone, then try again.';
  if (error?.name === 'NotReadableError') return 'The microphone could not start. Check whether another app is using it and verify your Windows input device.';
  if (error?.name === 'TimeoutError') return 'Still waiting for microphone access. ' + permissionHint;
  return 'The microphone could not start. Check your browser permission and selected input device, then try again.';
}

/**
 * Plain HTML audio playback; Web Audio is used only to collect microphone PCM.
 * @param {{onTranscript?: (text: string) => Promise<string | {text?: string, answer?: string}> | string | {text?: string, answer?: string}, onError?: (message: string) => void, onStatus?: (phase: string) => void}} [options]
 */
export function useAvatarVoice(options = {}) {
  const { onTranscript, onError, onStatus } = options;
  const [state, setState] = useState(EMPTY);
  const stateRef = useRef(EMPTY), callbacks = useRef({ onTranscript, onError, onStatus });
  callbacks.current = { onTranscript, onError, onStatus };
  const mounted = useRef(true), audioRef = useRef(null), session = useRef(0), speechEpoch = useRef(0);
  const voice = useRef(false), recording = useRef(null), requests = useRef(new Set());
  const audioURL = useRef(null), completion = useRef(null), pendingPlayback = useRef(false), permissionTimer = useRef(null), playAttempt = useRef(null);
  const beginListeningRef = useRef(null), finishListeningRef = useRef(null);
  const patch = useCallback(values => {
    stateRef.current = { ...stateRef.current, ...values };
    if (mounted.current) setState(stateRef.current);
    if (values.phase) callbacks.current.onStatus?.(values.phase);
  }, []);
  const report = useCallback(message => {
    patch({ error: message }); callbacks.current.onError?.(message);
  }, [patch]);
  const getAudio = useCallback(() => {
    if (!audioRef.current) { audioRef.current = new Audio(); audioRef.current.preload = 'auto'; }
    return audioRef.current;
  }, []);
  const stopRecording = useCallback(() => {
    clearTimeout(permissionTimer.current); permissionTimer.current = null;
    const rec = recording.current; recording.current = null;
    if (rec) {
      clearInterval(rec.timer);
      rec.stream?.getTracks().forEach(track => { track.onended = null; track.onmute = null; track.onunmute = null; track.stop(); });
      if (rec.processor) { rec.processor.onaudioprocess = null; rec.processor.disconnect(); }
      rec.source?.disconnect(); rec.gain?.disconnect();
      rec.context?.close().catch(() => {});
    }
    patch({ micLevel: 0 });
  }, [patch]);
  const stopSpeech = useCallback(() => {
    speechEpoch.current++;
    playAttempt.current = null;
    pendingPlayback.current = false;
    const audio = audioRef.current;
    if (audio) { audio.onended = null; audio.onerror = null; audio.pause(); try { audio.currentTime = 0; } catch { /* No source yet. */ } }
    completion.current?.({ cancelled: true }); completion.current = null;
    patch({ isSpeaking: false, playbackBlocked: false, phase: recording.current ? 'listening' : 'idle' });
  }, [patch]);
  const endVoice = useCallback(() => {
    session.current++; voice.current = false;
    requests.current.forEach(controller => controller.abort()); requests.current.clear();
    stopRecording(); stopSpeech();
    patch({ voiceActive: false, phase: 'idle', hint: '' });
  }, [patch, stopRecording, stopSpeech]);
  const prepareAudio = useCallback(() => {
    const audio = getAudio();
    if (!audio.paused || pendingPlayback.current) return;
    // Initiate playback directly in the click handler, before awaiting any network request.
    audio.src = SILENCE; audio.muted = true;
    const attempt = audio.play();
    attempt?.then(() => {
      if (audio.src === SILENCE) { audio.pause(); audio.currentTime = 0; audio.muted = false; }
    }).catch(() => { if (audio.src === SILENCE) audio.muted = false; });
  }, [getAudio]);
  const requestJSON = useCallback(async (url, options = {}, timeout = 60000) => {
    const controller = new AbortController(); requests.current.add(controller);
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeout);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) {
        const message = typeof data?.error === 'string' ? data.error : data?.error?.message;
        throw new Error(message || 'The voice service could not complete this request. Please try again.');
      }
      return data;
    } catch (error) {
      if (timedOut) throw new Error('The voice service took too long to respond. Please try again.');
      if (error.name === 'AbortError') throw error;
      if (error instanceof TypeError) throw new Error('The voice service is unavailable. Check that the local app server is running.');
      throw error;
    } finally { clearTimeout(timer); requests.current.delete(controller); }
  }, []);

  const playCurrent = useCallback(async epoch => {
    const audio = getAudio();
    if (epoch !== speechEpoch.current) return { cancelled: true };
    playAttempt.current = epoch;
    let settle;
    const finished = new Promise(resolve => { settle = resolve; });
    completion.current = settle;
    audio.onended = () => {
      if (epoch !== speechEpoch.current) return;
      pendingPlayback.current = false; completion.current = null;
      patch({ isSpeaking: false, playbackBlocked: false, phase: 'idle' }); settle({ played: true });
    };
    audio.onerror = () => {
      if (epoch !== speechEpoch.current) return;
      pendingPlayback.current = false; completion.current = null;
      patch({ isSpeaking: false, phase: 'error' }); report('The response audio could not be played. Please try Play response again.'); settle({ failed: true });
    };
    try {
      audio.muted = false; audio.volume = 1;
      await audio.play();
      if (epoch !== speechEpoch.current) { if (playAttempt.current === null) audio.pause(); return { cancelled: true }; }
      pendingPlayback.current = false;
      patch({ isSpeaking: true, playbackBlocked: false, phase: 'speaking', error: '', hint: '' });
      return await finished;
    } catch {
      if (epoch !== speechEpoch.current) return { cancelled: true };
      pendingPlayback.current = true; completion.current = null;
      patch({ isSpeaking: false, playbackBlocked: true, phase: 'playback-blocked' });
      report('Your audio is ready. Press Play audio to enable sound. Check that this tab and your speakers are not muted.');
      return { blocked: true };
    }
  }, [getAudio, patch, report]);

  const speak = useCallback(async (text, suppliedSpeech) => {
    stopRecording(); stopSpeech();
    const epoch = speechEpoch.current;
    patch({ phase: 'preparing-speech', error: '', hint: '' });
    try {
      const data = suppliedSpeech || await requestJSON('/api/avatar/speech', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
      if (epoch !== speechEpoch.current || !mounted.current) return { cancelled: true };
      if (!data.audioUrl && !data.audioBase64) throw new Error('The voice service returned no audio. Please try again.');
      if (audioURL.current) { URL.revokeObjectURL(audioURL.current); audioURL.current = null; }
      const audio = getAudio();
      if (data.audioUrl) audio.src = data.audioUrl;
      else {
        const bytes = Uint8Array.from(atob(data.audioBase64), character => character.charCodeAt(0));
        audioURL.current = URL.createObjectURL(new Blob([bytes], { type: data.mimeType || 'audio/wav' })); audio.src = audioURL.current;
      }
      audio.load();
      patch({ visemes: (data.visemes || []).filter(item => Number.isFinite(Number(item.time))).map(item => ({ ...item, time: Number(item.time) })).sort((a, b) => a.time - b.time), visemeSystem: data.visemeSystem || 'sapi', provider: data.provider || 'local-sapi' });
      return await playCurrent(epoch);
    } catch (error) {
      if (epoch !== speechEpoch.current || error.name === 'AbortError') return { cancelled: true };
      patch({ phase: 'error', isSpeaking: false }); report(error.message || 'Speech could not start. Please try again.');
      return { failed: true };
    }
  }, [getAudio, patch, playCurrent, report, requestJSON, stopRecording, stopSpeech]);

  const retryPlayback = useCallback(async () => {
    const token = session.current;
    if (!audioRef.current?.src) return;
    const result = await playCurrent(speechEpoch.current);
    if (result.played && voice.current && token === session.current) beginListeningRef.current?.(token);
    return result;
  }, [playCurrent]);

  const finishListening = useCallback(async () => {
    const rec = recording.current;
    if (!rec || !rec.processor) return;
    const token = session.current, wav = encodeMonoWav(rec.chunks, rec.context.sampleRate);
    stopRecording();
    if (!voice.current || token !== session.current) return;
    if (wav.size < 6444) {
      endVoice(); report('No microphone audio was captured. Check your input device, then start voice again.'); return;
    }
    patch({ phase: 'transcribing', hint: '', error: '' });
    try {
      const data = await requestJSON('/api/avatar/transcribe', { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: wav });
      if (!voice.current || token !== session.current) return;
      if (!data.text?.trim()) throw new Error('I did not catch that. Please move closer to your microphone and try again.');
      patch({ phase: 'thinking' });
      const reply = await callbacks.current.onTranscript?.(data.text.trim());
      if (!voice.current || token !== session.current) return;
      const text = typeof reply === 'string' ? reply : reply?.text || reply?.answer;
      if (!text) throw new Error('The assistant did not return a reply. Please try again.');
      const result = await speak(text);
      if (!voice.current || token !== session.current) return;
      if (result.played) beginListeningRef.current?.(token);
      else if (result.failed) { voice.current = false; patch({ voiceActive: false }); }
    } catch (error) {
      if (token !== session.current || error.name === 'AbortError') return;
      endVoice(); report(error.message || 'The voice conversation could not continue. Please try again.');
    }
  }, [endVoice, patch, report, requestJSON, speak, stopRecording]);
  finishListeningRef.current = finishListening;

  const beginListening = useCallback(async token => {
    if (!voice.current || token !== session.current || recording.current) return;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      endVoice(); report('Microphone access is unavailable in this page. Open the app at its localhost address or over HTTPS. ' + permissionHint); return;
    }
    const AudioContextType = window.AudioContext || /** @type {Window & {webkitAudioContext?: typeof AudioContext}} */ (window).webkitAudioContext;
    if (!AudioContextType) { endVoice(); report('This browser cannot capture microphone audio. Try opening the app in Chrome or Edge.'); return; }
    patch({ phase: 'requesting-microphone', hint: 'Allow microphone access when your browser asks.', error: '' });
    let expired = false, timeout;
    try {
    const rec = { context: new AudioContextType(), stream: null, processor: null, source: null, gain: null, chunks: [], timer: null };
    recording.current = rec;
    // Both calls start immediately during a user gesture; neither waits for a network request.
    const resumed = rec.context.resume();
    const acquired = navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false }).then(stream => {
      if (expired || !voice.current || token !== session.current || recording.current !== rec) { stream.getTracks().forEach(track => track.stop()); throw new DOMException('Cancelled', 'AbortError'); }
      rec.stream = stream; return stream;
    });
    permissionTimer.current = setTimeout(() => {
      if (token === session.current && recording.current === rec) patch({ hint: 'Still waiting for your browser. Check the microphone permission prompt, or cancel and try Chrome or Edge.' });
    }, 7000);
      await Promise.race([Promise.all([resumed, acquired]), new Promise((_, reject) => { timeout = setTimeout(() => { expired = true; reject(new DOMException('Permission timeout', 'TimeoutError')); }, 20000); })]);
      clearTimeout(timeout); clearTimeout(permissionTimer.current);
      if (!voice.current || token !== session.current || recording.current !== rec) return;
      if (rec.context.state !== 'running') throw new Error('Audio capture did not start');
      const track = rec.stream.getAudioTracks()[0];
      if (!track || track.readyState === 'ended') throw new DOMException('Input disconnected', 'NotReadableError');
      track.onended = () => { if (recording.current === rec) { endVoice(); report('The microphone disconnected. Reconnect it and start voice again.'); } };
      track.onmute = () => { if (recording.current === rec) patch({ hint: 'The microphone is muted or not delivering sound. Check your input device.' }); };
      track.onunmute = () => { if (recording.current === rec) patch({ hint: '' }); };
      rec.source = rec.context.createMediaStreamSource(rec.stream);
      rec.processor = rec.context.createScriptProcessor(4096, 1, 1); rec.gain = rec.context.createGain(); rec.gain.gain.value = 0;
      const started = performance.now(); let lastSpeech = started, heard = false, maximum = 0, lastMeter = 0, noiseFloor = .002;
      rec.processor.onaudioprocess = event => {
        if (recording.current !== rec || token !== session.current) return;
        const input = event.inputBuffer.getChannelData(0); rec.chunks.push(new Float32Array(input));
        let power = 0; for (const value of input) power += value * value;
        const level = Math.sqrt(power / input.length), now = performance.now(); maximum = Math.max(maximum, level);
        noiseFloor = Math.min(noiseFloor, Math.max(.0003, level));
        if (level > Math.max(.0035, Math.min(.014, noiseFloor * 3))) { heard = true; lastSpeech = now; }
        if (now - lastMeter > 85) { patch({ micLevel: Math.min(1, level * 12) }); lastMeter = now; }
      };
      rec.source.connect(rec.processor); rec.processor.connect(rec.gain); rec.gain.connect(rec.context.destination);
      patch({ phase: 'listening', hint: 'Speak naturally. Send now sends your recording without waiting for silence.' });
      rec.timer = setInterval(() => {
        if (recording.current !== rec || token !== session.current) return;
        const now = performance.now();
        if (heard && now - lastSpeech > 1300 && now - started > 1700) finishListeningRef.current?.();
        else if (now - started > 28000) {
          if (heard) finishListeningRef.current?.();
          else { endVoice(); report('No clear speech was detected. Check that the microphone meter moves, move closer, and try again.'); }
        } else if (!heard && now - started > 5500) patch({ hint: maximum < .0003 ? 'No input is reaching the app. Check your selected microphone and mute switch.' : 'Your input is quiet. Move closer, or use Send now when you have spoken.' });
      }, 150);
    } catch (error) {
      clearTimeout(timeout);
      if (token !== session.current || error.name === 'AbortError') return;
      endVoice(); report(friendlyMicrophoneError(error));
    }
  }, [endVoice, patch, report]);
  beginListeningRef.current = beginListening;

  const startVoice = useCallback(() => {
    endVoice(); const token = session.current; voice.current = true;
    patch({ voiceActive: true, error: '', hint: '' }); prepareAudio();
    return beginListening(token);
  }, [beginListening, endVoice, patch, prepareAudio]);
  const playDemo = useCallback(async () => {
    endVoice(); prepareAudio(); const token = session.current;
    try {
      const data = await requestJSON('/assets/lincoln-demo.json');
      if (token !== session.current) return { cancelled: true };
      return await speak(data.text, { ...data, audioUrl: '/assets/lincoln-demo.wav', visemeSystem: 'sapi', provider: 'local-demo' });
    } catch (error) { if (token === session.current && error.name !== 'AbortError') report('The voice demo could not load. Check that the app server is running.'); return { failed: true }; }
  }, [endVoice, prepareAudio, report, requestJSON, speak]);
  const clearError = useCallback(() => patch({ error: '' }), [patch]);
  useEffect(() => {
    mounted.current = true;
    const hide = () => endVoice(); window.addEventListener('pagehide', hide);
    return () => { mounted.current = false; endVoice(); window.removeEventListener('pagehide', hide); if (audioURL.current) URL.revokeObjectURL(audioURL.current); };
  }, [endVoice]);
  return { ...state, audioRef, startVoice, endVoice, finishListening, speak, retryPlayback, prepareAudio, playDemo, stopSpeech, clearError };
}

export default useAvatarVoice;
