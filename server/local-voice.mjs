import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, mkdtemp, unlink, rmdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { tmpdir } from 'node:os';
const runtime = fileURLToPath(new URL('../local-voice/', import.meta.url));
export const localVoicePaths = {
  whisper: path.join(runtime, 'bin', 'whisper-cli.exe'),
  whisperModel: path.join(runtime, 'ggml-tiny.en.bin'),
  recordings: path.join(tmpdir(), 'lifecast-recordings'),
};
export function localVoiceStatus() {
  return { speech: process.platform === 'win32', transcriptionReady: process.platform === 'win32' && existsSync(localVoicePaths.whisper) && existsSync(localVoicePaths.whisperModel), voice: 'Microsoft David Desktop' };
}
class HttpError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}

// The C# event handler runs safely on the speech engine's worker thread.
// User text is passed through stdin JSON, never interpolated into executable code.
const SPEECH_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Speech
$source = @'
using System;
using System.IO;
using System.Collections.Generic;
using System.Speech.Synthesis;
using System.Speech.AudioFormat;
public class LincolnViseme { public double time; public int id; public double duration; }
public class LincolnSpeechResult { public string audioBase64; public string mimeType = "audio/wav"; public string voice; public LincolnViseme[] visemes; }
public static class LincolnSpeech {
  private static byte[] Wave(byte[] pcm) {
    using (var stream = new MemoryStream())
    using (var writer = new BinaryWriter(stream)) {
      writer.Write(System.Text.Encoding.ASCII.GetBytes("RIFF")); writer.Write(36 + pcm.Length);
      writer.Write(System.Text.Encoding.ASCII.GetBytes("WAVEfmt ")); writer.Write(16);
      writer.Write((short)1); writer.Write((short)1); writer.Write(16000); writer.Write(32000);
      writer.Write((short)2); writer.Write((short)16);
      writer.Write(System.Text.Encoding.ASCII.GetBytes("data")); writer.Write(pcm.Length); writer.Write(pcm);
      writer.Flush(); return stream.ToArray();
    }
  }
  public static LincolnSpeechResult Run(string text, string preferredVoice) {
    using (var synth = new SpeechSynthesizer())
    using (var stream = new MemoryStream()) {
      if (!String.IsNullOrWhiteSpace(preferredVoice)) {
        try { synth.SelectVoice(preferredVoice); } catch (ArgumentException) { synth.SelectVoiceByHints(VoiceGender.Male, VoiceAge.Adult); }
      } else { synth.SelectVoiceByHints(VoiceGender.Male, VoiceAge.Adult); }
      synth.Rate = 0;
      synth.Volume = 100;
      var events = new List<LincolnViseme>();
      synth.VisemeReached += delegate(object sender, VisemeReachedEventArgs e) {
        lock (events) { events.Add(new LincolnViseme { time = e.AudioPosition.TotalSeconds, id = e.Viseme, duration = e.Duration.TotalSeconds }); }
      };
      synth.SetOutputToAudioStream(stream, new SpeechAudioFormatInfo(16000, AudioBitsPerSample.Sixteen, AudioChannel.Mono));
      synth.Speak(text);
      synth.SetOutputToNull();
      return new LincolnSpeechResult { audioBase64 = Convert.ToBase64String(Wave(stream.ToArray())), voice = synth.Voice.Name, visemes = events.ToArray() };
    }
  }
}
'@
Add-Type -TypeDefinition $source -ReferencedAssemblies System.Speech
$request = [Console]::In.ReadToEnd() | ConvertFrom-Json
$result = [LincolnSpeech]::Run([string]$request.text, [string]$request.voice)
$result | ConvertTo-Json -Depth 5 -Compress
`;

export function synthesizeSpeech(text, voice = 'Microsoft David Desktop') {
  return new Promise((resolve, reject) => {
    if (process.platform !== 'win32') return reject(new HttpError(503, 'Local speech synthesis requires Windows. Amazon Polly remains the primary voice.', 'speech_unavailable'));
    const args = ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(SPEECH_SCRIPT, 'utf16le').toString('base64')];
    const child = spawn('powershell.exe', args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = ''; let size = 0; let failed = false;
    const timer = setTimeout(() => { failed = true; child.kill(); reject(new HttpError(504, 'Local speech synthesis timed out. Try a shorter message.', 'speech_timeout')); }, 60000);
    child.stdout.on('data', (data) => { size += data.length; if (size > 16 * 1024 * 1024) { failed = true; child.kill(); clearTimeout(timer); reject(new HttpError(413, 'The generated speech is too long.')); } else output += data.toString('utf8'); });
    // Do not echo arbitrary PowerShell diagnostics containing user input.
    child.stderr.on('data', () => {});
    child.on('error', () => { clearTimeout(timer); if (!failed) reject(new HttpError(503, 'Windows speech could not start. Ensure Windows PowerShell and an English speech voice are available.', 'speech_unavailable')); });
    child.on('close', (code) => {
      clearTimeout(timer); if (failed) return;
      if (code !== 0) return reject(new HttpError(503, 'Windows speech could not generate audio. Check that a Windows speech voice is installed.', 'speech_failed'));
      try {
        const result = JSON.parse(output.replace(/^\uFEFF/, '').trim());
        if (typeof result.audioBase64 !== 'string' || !Array.isArray(result.visemes)) throw new Error();
        result.visemes.sort((a, b) => a.time - b.time);
        resolve(result);
      } catch { reject(new HttpError(503, 'Windows speech returned an unreadable result.', 'speech_failed')); }
    });
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify({ text, voice }));
  });
}

export function validateWav(buffer) {
  if (buffer.length < 44 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') throw new HttpError(400, 'Send a WAV recording with mono PCM16 audio at 16,000 Hz.');
  let format; let samples;
  for (let offset = 12; offset + 8 <= buffer.length;) {
    const kind = buffer.toString('ascii', offset, offset + 4);
    const length = buffer.readUInt32LE(offset + 4); const start = offset + 8;
    if (start + length > buffer.length) throw new HttpError(400, 'The WAV recording is incomplete.');
    if (kind === 'fmt ' && length >= 16) format = { encoding: buffer.readUInt16LE(start), channels: buffer.readUInt16LE(start + 2), rate: buffer.readUInt32LE(start + 4), bits: buffer.readUInt16LE(start + 14) };
    if (kind === 'data') samples = buffer.subarray(start, start + length);
    offset = start + length + length % 2;
  }
  if (!format || format.encoding !== 1 || format.channels !== 1 || format.rate !== 16000 || format.bits !== 16 || !samples || samples.length % 2) throw new HttpError(400, 'Use mono PCM16 WAV at 16,000 Hz for local transcription.');
  const seconds = samples.length / 32000;
  if (seconds < 0.15 || seconds > 30.1) throw new HttpError(400, 'Record between 0.15 and 30 seconds of speech.');
  let energy = 0;
  for (let i = 0; i < samples.length; i += 2) energy += (samples.readInt16LE(i) / 32768) ** 2;
  const rms = Math.sqrt(energy / (samples.length / 2));
  if (rms < 0.0015) throw new HttpError(422, 'No clear speech was detected. Move closer to the microphone and try again.', 'no_speech');
  return { seconds, rms };
}

export async function transcribeWav(buffer, paths = localVoicePaths) {
  validateWav(buffer);
  if (!existsSync(paths.whisper) || !existsSync(paths.whisperModel)) throw new HttpError(503, 'The local speech recognition model is not installed yet.', 'transcription_unavailable');
  await mkdir(paths.recordings, { recursive: true });
  const directory = await mkdtemp(path.join(paths.recordings, 'clip-'));
  const wavPath = path.join(directory, 'recording.wav'); const textBase = path.join(directory, 'transcript');
  try {
    await writeFile(wavPath, buffer);
    await new Promise((resolve, reject) => {
      const child = spawn(paths.whisper, ['-m', paths.whisperModel, '-f', wavPath, '-otxt', '-of', textBase, '-t', '4', '-l', 'en', '-nt', '-np', '-bs', '1', '-bo', '1', '-ng'], { windowsHide: true, stdio: ['ignore', 'ignore', 'ignore'], cwd: path.dirname(paths.whisper) });
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; child.kill(); reject(new HttpError(504, 'Local transcription timed out. Please try a shorter recording.')); }, 45000);
      child.on('error', () => { clearTimeout(timer); reject(new HttpError(503, 'The local speech recognizer could not start.')); });
      child.on('close', (code) => { clearTimeout(timer); if (timedOut) return; code === 0 ? resolve() : reject(new HttpError(503, 'The local speech recognizer could not process this recording.')); });
    });
    const text = (await readFile(textBase + '.txt', 'utf8')).replace(/\[(?:BLANK_AUDIO|SILENCE|MUSIC)\]/gi, '').trim();
    if (!text) throw new HttpError(422, 'No speech was recognized. Please try again.', 'no_speech');
    return { text };
  } finally {
    await unlink(wavPath).catch(() => {});
    await unlink(textBase + '.txt').catch(() => {});
    await rmdir(directory).catch(() => {});
  }
}
