import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";

export const POLLY_REGION = process.env.AWS_REGION || "us-east-1";
export const POLLY_VOICE = process.env.POLLY_VOICE || "Matthew";

async function collect(stream, signal) {
  if (!stream) throw new Error("Polly returned no speech stream.");
  if (signal?.aborted) { stream.destroy?.(); signal.throwIfAborted(); }
  const aborted = () => stream.destroy?.(signal.reason);
  signal?.addEventListener("abort", aborted, { once: true });
  try {
    signal?.throwIfAborted();
    if (typeof stream.transformToByteArray === "function") return Buffer.from(await stream.transformToByteArray());
    const chunks = [];
    for await (const chunk of stream) { signal?.throwIfAborted(); chunks.push(Buffer.from(chunk)); }
    return Buffer.concat(chunks);
  } finally { signal?.removeEventListener("abort", aborted); }
}

export function parseSpeechMarks(buffer) {
  const marks = buffer.toString("utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  const visemes = marks.filter((mark) => mark.type === "viseme" && Number.isFinite(mark.time) && mark.time >= 0 && typeof mark.value === "string")
    .map((mark) => ({ time: mark.time / 1000, id: mark.value }))
    .sort((a, b) => a.time - b.time);
  for (let i = 0; i < visemes.length - 1; i++) visemes[i].duration = Math.max(0, visemes[i + 1].time - visemes[i].time);
  if (!visemes.length) throw new Error("Polly returned no viseme timeline.");
  return visemes;
}

export function createVoiceService(client = new PollyClient({ region: POLLY_REGION, maxAttempts: 2 }), voice = POLLY_VOICE) {
  function parameters(text) {
    const clean = String(text || "").trim();
    if (!clean || clean.length > 2800) throw new Error("Speech needs between 1 and 2,800 characters.");
    return { Text: clean, TextType: "text", VoiceId: voice, Engine: "neural" };
  }
  return {
    async synthesize(text, { signal } = {}) {
      const result = await client.send(new SynthesizeSpeechCommand({ ...parameters(text), OutputFormat: "mp3" }), { abortSignal: signal });
      return collect(result.AudioStream, signal);
    },
    async synthesizeWithVisemes(text, { signal } = {}) {
      // Polly returns speech marks instead of audio. Both requests must share
      // text, voice, engine and text type; never mix provider clocks.
      const common = parameters(text);
      const pair = new AbortController();
      const combined = AbortSignal.any([pair.signal, ...(signal ? [signal] : [])]);
      try {
        const [audio, marks] = await Promise.all([
          client.send(new SynthesizeSpeechCommand({ ...common, OutputFormat: "mp3" }), { abortSignal: combined }).then((r) => collect(r.AudioStream, combined)),
          client.send(new SynthesizeSpeechCommand({ ...common, OutputFormat: "json", SpeechMarkTypes: ["viseme"] }), { abortSignal: combined }).then((r) => collect(r.AudioStream, combined)),
        ]);
        return { audioBase64: audio.toString("base64"), mimeType: "audio/mpeg", visemes: parseSpeechMarks(marks), voice, provider: "amazon-polly", visemeSystem: "polly" };
      } catch (error) { pair.abort(error); throw error; }
    },
  };
}

const voiceService = createVoiceService();
export const synthesize = voiceService.synthesize;
export const synthesizeWithVisemes = voiceService.synthesizeWithVisemes;
