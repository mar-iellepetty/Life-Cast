import { lazy, Suspense, useCallback, useEffect, useId, useRef, useState } from 'react';
import { Volume2, VolumeX, RotateCcw, Play, Square, Send, Mic, MicOff, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { guide } from '@/api/lifecastApi';
import { useAvatarVoice } from '@/hooks/useAvatarVoice';
import './realistic-avatar.css';
import './AnimatedAvatar.css';

const AnimatedAvatar = lazy(() => import('./AnimatedAvatar'));
const GREETING = "Hello, I'm Lincoln, your LifeCast guide. Tell me what matters to you, and we can explore the future your coverage protects together.";

export default function AvatarDialog({ open, onOpenChange, message = null, onAsk = null, profile = null, context = '' }) {
  const [caption, setCaption] = useState(GREETING), [question, setQuestion] = useState('');
  const [lastQuestion, setLastQuestion] = useState(''), [asking, setAsking] = useState(false);
  const [error, setError] = useState(''), [muted, setMuted] = useState(false);
  const history = useRef([]), requestVersion = useRef(0), openRef = useRef(open), pendingRequest = useRef(null);
  const inputId = useId(); openRef.current = open;

  const requestAnswer = useCallback(async text => {
    const value = text.trim(); if (!value) return '';
    const version = ++requestVersion.current;
    pendingRequest.current?.abort();
    const controller = new AbortController(); pendingRequest.current = controller;
    setAsking(true); setError(''); setLastQuestion(value);
    const prior = history.current.slice(-12);
    try {
      const options = { history: prior, profile, context, provider: 'bedrock', fromAvatar: true, signal: controller.signal };
      const response = onAsk ? await onAsk(value, options) : await guide({ question: value, ...options });
      if (version !== requestVersion.current || !openRef.current) return '';
      const answer = typeof response === 'string' ? response : response?.answer || response?.reply || response?.text;
      if (typeof answer !== 'string' || !answer.trim()) throw new Error('Lincoln did not receive an answer. Please try again.');
      history.current = [...prior, { role: 'user', text: value }, { role: 'assistant', text: answer }];
      setCaption(answer); return answer;
    } catch (err) {
      if (version === requestVersion.current && openRef.current) setError(err.message || 'The Bedrock guide could not respond. Please try again.');
      throw err;
    } finally { if (version === requestVersion.current) { setAsking(false); pendingRequest.current = null; } }
  }, [onAsk, profile, context]);

  const voice = useAvatarVoice({ onTranscript: requestAnswer, onError: value => setError(value || 'Voice conversation could not continue.') });
  const voiceRef = useRef(voice); voiceRef.current = voice;
  useEffect(() => {
    if (!open) { requestVersion.current++; pendingRequest.current?.abort(); setAsking(false); voiceRef.current.endVoice(); return; }
    setError(''); voiceRef.current.clearError();
  }, [open]);
  // Parent replies update captions only; the submit action or microphone loop
  // owns playback, preventing a prop update from speaking the same answer twice.
  useEffect(() => { if (open && message) setCaption(message); }, [open, message]);
  useEffect(() => { if (voice.audioRef.current) voice.audioRef.current.muted = muted; }, [muted, voice.isSpeaking, voice.audioRef]);
  useEffect(() => () => { requestVersion.current++; pendingRequest.current?.abort(); voiceRef.current.endVoice(); }, []);

  async function submit(event) {
    event.preventDefault(); const value = question.trim(); if (!value || asking) return;
    voice.endVoice(); voice.prepareAudio(); voice.clearError(); setQuestion('');
    try { const answer = await requestAnswer(value); if (answer && openRef.current) await voice.speak(answer); } catch { /* Request and voice errors are displayed below. */ }
  }
  async function play() {
    voice.prepareAudio(); voice.clearError(); setError('');
    try { await voice.speak(caption); } catch (err) { setError(err.message || 'The voice could not play.'); }
  }
  function endConversation() {
    requestVersion.current++; pendingRequest.current?.abort(); pendingRequest.current = null;
    setAsking(false); voice.endVoice();
  }
  function stop() { if (voice.voiceActive) endConversation(); else voice.stopSpeech(); }
  const busy = asking || ['transcribing', 'thinking', 'preparing-speech'].includes(voice.phase);
  const status = asking ? 'Lincoln is thinking…' : voice.hint || (voice.phase === 'listening' ? 'Listening — speak naturally, then pause.' : voice.phase === 'transcribing' ? 'Understanding what you said…' : voice.isSpeaking ? 'Lincoln is speaking.' : voice.voiceActive ? 'Voice conversation is on.' : 'Type a question or start a voice conversation.');
  const visibleError = error || voice.error;

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="realistic-dialog">
      <div className="realistic-layout">
        {open && <Suspense fallback={<div className="live-lincoln"><div className="live-lincoln__loading" role="status"><span />Preparing Lincoln…</div></div>}>
          <AnimatedAvatar audioRef={voice.audioRef} visemes={voice.visemes} visemeSystem={voice.visemeSystem} isSpeaking={voice.isSpeaking} phase={asking ? 'thinking' : voice.phase} />
        </Suspense>}
        <div className="realistic-controls">
          <DialogHeader>
            <p className="eyebrow">A CONVERSATION WITH CLARITY</p>
            <DialogTitle>Meet Lincoln.</DialogTitle>
            <DialogDescription className="realistic-description">Your guide to understanding the future your coverage protects.</DialogDescription>
          </DialogHeader>
          <div className="avatar-bedrock"><i />Amazon Bedrock · Nova Lite</div>
          {lastQuestion && <p className="avatar-question">You: {lastQuestion}</p>}
          <p aria-live="polite" aria-atomic="true" className="realistic-caption">{caption}</p>
          <div className="realistic-toolbar">
            <button onClick={voice.isSpeaking ? stop : play} disabled={busy && !voice.isSpeaking} className="voice-primary">{voice.isSpeaking ? <Square size={15} /> : <Play size={15} />}{voice.isSpeaking ? 'Stop' : 'Play response'}</button>
            <button className="voice-control" onClick={() => setMuted(value => !value)} aria-pressed={muted}>{muted ? <VolumeX size={16} /> : <Volume2 size={16} />}{muted ? 'Unmute' : 'Mute'}</button>
            <button className="voice-control" aria-label="Replay Lincoln’s response" disabled={busy} onClick={play}><RotateCcw size={16} /></button>
          </div>
          <div className="avatar-voice-row">
            <button className={`voice-control${voice.voiceActive ? ' voice-active' : ''}`} onClick={() => { setError(''); voice.clearError(); if (voice.voiceActive) endConversation(); else voice.startVoice(); }} disabled={asking && !voice.voiceActive} aria-pressed={voice.voiceActive}>
              {voice.voiceActive ? <MicOff size={15} /> : <Mic size={15} />}{voice.voiceActive ? 'End voice conversation' : 'Start voice conversation'}
            </button>
            {voice.phase === 'listening' && <button className="voice-control" onClick={voice.finishListening}>Send now</button>}
          </div>
          {voice.phase === 'listening' && <div className="avatar-input-meter" role="meter" aria-label="Microphone input level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((voice.micLevel || 0) * 100)}><span style={{ width: `${Math.max(2, (voice.micLevel || 0) * 100)}%` }} /></div>}
          <p className={`avatar-voice-phase${voice.voiceActive ? ' is-live' : ''}`} role="status">{status}</p>
          {voice.provider === 'amazon-polly' && <p className="avatar-voice-provider">Voice · Amazon Polly</p>}
          {voice.provider === 'local-sapi' && <p className="avatar-voice-provider" role="status">Using Windows voice while Amazon Polly is unavailable.</p>}
          {voice.playbackBlocked && <div className="avatar-retry"><span>Your response is ready.</span><button onClick={voice.retryPlayback}>Play audio</button></div>}
          <div className="realistic-preview">
            <label htmlFor={inputId}>CONTINUE THE CONVERSATION</label>
            <form onSubmit={submit}>
              <input id={inputId} aria-label="Ask Lincoln" value={question} onChange={event => setQuestion(event.target.value)} placeholder="Ask Lincoln…" autoComplete="off" />
              <button className="voice-primary avatar-chat-send" disabled={!question.trim() || asking} aria-label="Send to Lincoln">{asking ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}</button>
            </form>
            <p className="avatar-input-note">Your microphone is used only while voice conversation is on.</p>
            {visibleError && <p role="alert" className="realistic-error">{visibleError}</p>}
          </div>
        </div>
      </div>
    </DialogContent>
  </Dialog>;
}
