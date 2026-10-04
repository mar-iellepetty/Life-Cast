import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter, getEventListeners } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtemp, writeFile, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { chat, extractHousehold, extractEvents, explainAssessment, explainDiff } from '../server/bedrock.mjs';
import { createVoiceService } from '../server/voice.mjs';
import { calculateWithCalcXml } from '../server/calcxml.mjs';
import { synthesizeSpeech, transcribeWav } from '../server/local-voice.mjs';

test('Bedrock operations forward cancellation to the SDK without exposing credentials', async () => {
  const original = BedrockRuntimeClient.prototype.send;
  const controller = new AbortController(); let calls = 0;
  BedrockRuntimeClient.prototype.send = async (_command, { abortSignal }) => {
    assert.equal(abortSignal, controller.signal); calls++;
    return { stopReason: 'end_turn', output: { message: { role: 'assistant', content: [{ text: '{}' }] } } };
  };
  try {
    await chat([{ role: 'user', text: 'Synthetic' }], null, '', { signal: controller.signal });
    await extractHousehold('Synthetic', { signal: controller.signal });
    await extractEvents('Synthetic', { signal: controller.signal });
    await explainAssessment({}, { signal: controller.signal });
    await explainDiff({}, { signal: controller.signal });
    assert.equal(calls, 5);
    controller.abort();
    await assert.rejects(chat([{ role: 'user', text: 'Synthetic' }], null, '', { signal: controller.signal }), { name: 'AbortError' });
    assert.equal(calls, 5);
  } finally { BedrockRuntimeClient.prototype.send = original; }
});

test('a failed Polly half cancels the paired request instead of leaving it in flight', async () => {
  const signals = [];
  const service = createVoiceService({ send: async (command, { abortSignal }) => {
    signals.push(abortSignal);
    if (command.input.OutputFormat === 'mp3') throw new Error('Fixture failure');
    return new Promise((_resolve, reject) => abortSignal.addEventListener('abort', () => reject(abortSignal.reason), { once: true }));
  } });
  await assert.rejects(service.synthesizeWithVisemes('Synthetic speech'), /Fixture failure/);
  assert.equal(signals.length, 2);
  assert.ok(signals.every((signal) => signal.aborted));
});

test('Polly cancellation destroys the streaming audio body and removes the abort listener', async () => {
  const controller = new AbortController(); const stream = new PassThrough();
  let began; const started = new Promise((resolve) => { began = resolve; });
  const service = createVoiceService({ send: async (_command, { abortSignal }) => {
    assert.equal(abortSignal, controller.signal); began(); return { AudioStream: stream };
  } });
  const pending = service.synthesize('Synthetic speech', { signal: controller.signal });
  await started; await new Promise((resolve) => setImmediate(resolve));
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(stream.destroyed, true);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
});

test('calculator requests reject redirects and propagate abort through their bounded signal', async () => {
  const original = globalThis.fetch; const controller = new AbortController();
  let began; const started = new Promise((resolve) => { began = resolve; });
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.redirect, 'error'); began();
    return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }));
  };
  try {
    const pending = calculateWithCalcXml({ household: {} }, { signal: controller.signal });
    await started; controller.abort();
    await assert.rejects(pending, { name: 'AbortError' });
  } finally { globalThis.fetch = original; }
});

function childFixture() {
  let begin; const started = new Promise((resolve) => { begin = resolve; });
  const child = new EventEmitter();
  child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.killed = false; child.closed = false;
  child.kill = () => {
    child.killed = true;
    setImmediate(() => { child.closed = true; child.emit('close', null); });
    return true;
  };
  return { child, started, spawnImpl: (_command, args, options) => {
    assert.equal(options.windowsHide, true); begin(args); return child;
  } };
}

test('cancelled local synthesis kills its process and removes cancellation listeners', { skip: process.platform !== 'win32' }, async () => {
  const f = childFixture(); const controller = new AbortController();
  const pending = synthesizeSpeech('Synthetic fixture', undefined, { signal: controller.signal, spawnImpl: f.spawnImpl });
  await f.started; controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(f.child.killed, true); assert.equal(f.child.closed, true);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
});

function wavFixture() {
  const pcmBytes = 6400; const wav = Buffer.alloc(44 + pcmBytes);
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + pcmBytes, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(16000, 24); wav.writeUInt32LE(32000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(pcmBytes, 40);
  for (let i = 44; i < wav.length; i += 2) wav.writeInt16LE(1000, i);
  return wav;
}

test('cancelled transcription waits for process exit and deletes the private recording directory', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'lifecast-voice-security-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const paths = { whisper: path.join(directory, 'fixture.exe'), whisperModel: path.join(directory, 'model.bin'), recordings: path.join(directory, 'recordings') };
  await writeFile(paths.whisper, 'fixture'); await writeFile(paths.whisperModel, 'fixture');
  const f = childFixture(); const controller = new AbortController();
  const pending = transcribeWav(wavFixture(), paths, { signal: controller.signal, spawnImpl: f.spawnImpl });
  const args = await f.started;
  const recording = args[args.indexOf('-f') + 1];
  assert.equal(existsSync(recording), true);
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(f.child.killed, true); assert.equal(f.child.closed, true);
  assert.equal(existsSync(recording), false);
  assert.deepEqual(await readdir(paths.recordings), []);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
});
