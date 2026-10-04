// Reads an Apple Health export in the browser and summarizes recent habits.
//
// Apple does not offer a web API for HealthKit; health data stays on the iPhone.
// People can export it from the Health app (profile picture > Export All Health
// Data), which produces export.zip containing apple_health_export/export.xml.
// We stream that file locally and send only the averages to the server.

export interface HealthMetrics {
  days: number;
  avgDailySteps?: number;
  restingHeartRate?: number;
  sleepHours?: number;
  exerciseMinutes?: number;
  bmi?: number;
}

/** Clearly labeled demo data for people without an iPhone export at hand. */
export const SAMPLE_HEALTH: HealthMetrics = { days: 90, avgDailySteps: 9100, restingHeartRate: 60, sleepHours: 7.4, exerciseMinutes: 34, bmi: 24.1 };

const WINDOW_DAYS = 90;
const TYPES = {
  steps: 'HKQuantityTypeIdentifierStepCount',
  resting: 'HKQuantityTypeIdentifierRestingHeartRate',
  exercise: 'HKQuantityTypeIdentifierAppleExerciseTime',
  bmi: 'HKQuantityTypeIdentifierBodyMassIndex',
  sleep: 'HKCategoryTypeIdentifierSleepAnalysis',
};

const attr = (tag: string, name: string) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
const parseDate = (s?: string) => (s ? Date.parse(s.replace(' ', 'T').replace(/ ([+-]\d{2})(\d{2})$/, '$1:$2')) : NaN);

/** Summarize the last 90 days from a stream of export.xml text. */
async function summarize(stream: ReadableStream<Uint8Array>, onProgress?: (bytes: number) => void): Promise<HealthMetrics> {
  const cutoff = Date.now() - WINDOW_DAYS * 86400000;
  const stepsByDay = new Map<string, number>();
  const exerciseByDay = new Map<string, number>();
  const sleepByNight = new Map<string, number>();
  let restingSum = 0, restingCount = 0, bmi: number | undefined, bmiAt = 0;

  const handle = (tag: string) => {
    const type = attr(tag, 'type');
    if (!type || !Object.values(TYPES).includes(type)) return;
    const start = parseDate(attr(tag, 'startDate'));
    if (!(start >= cutoff)) return;
    const day = (attr(tag, 'startDate') ?? '').slice(0, 10);
    const value = Number(attr(tag, 'value'));
    if (type === TYPES.steps && Number.isFinite(value)) stepsByDay.set(day, (stepsByDay.get(day) ?? 0) + value);
    else if (type === TYPES.exercise && Number.isFinite(value)) exerciseByDay.set(day, (exerciseByDay.get(day) ?? 0) + value);
    else if (type === TYPES.resting && Number.isFinite(value)) { restingSum += value; restingCount++; }
    else if (type === TYPES.bmi && Number.isFinite(value) && start > bmiAt) { bmi = value; bmiAt = start; }
    else if (type === TYPES.sleep && /Asleep/.test(attr(tag, 'value') ?? '')) {
      const hours = (parseDate(attr(tag, 'endDate')) - start) / 3600000;
      if (hours > 0 && hours < 16) sleepByNight.set(day, (sleepByNight.get(day) ?? 0) + hours);
    }
  };

  const reader = stream.pipeThrough(new TextDecoderStream() as unknown as ReadableWritablePair<string, Uint8Array>).getReader();
  let buffer = '', read = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    read += value.length;
    onProgress?.(read);
    buffer += value;
    let at = 0;
    for (;;) {
      const open = buffer.indexOf('<Record ', at);
      if (open === -1) { at = buffer.length; break; }
      const close = buffer.indexOf('>', open);
      if (close === -1) { at = open; break; }
      handle(buffer.slice(open, close + 1));
      at = close + 1;
    }
    buffer = buffer.slice(at);
  }

  const avg = (m: Map<string, number>) => (m.size ? [...m.values()].reduce((a, b) => a + b, 0) / m.size : undefined);
  const metrics: HealthMetrics = {
    days: WINDOW_DAYS,
    avgDailySteps: avg(stepsByDay) !== undefined ? Math.round(avg(stepsByDay)!) : undefined,
    restingHeartRate: restingCount ? Math.round(restingSum / restingCount) : undefined,
    sleepHours: avg(sleepByNight) !== undefined ? Math.round(avg(sleepByNight)! * 10) / 10 : undefined,
    exerciseMinutes: avg(exerciseByDay) !== undefined ? Math.round(avg(exerciseByDay)!) : undefined,
    bmi: bmi !== undefined ? Math.round(bmi * 10) / 10 : undefined,
  };
  if ([metrics.avgDailySteps, metrics.restingHeartRate, metrics.sleepHours, metrics.exerciseMinutes, metrics.bmi].every((v) => v === undefined)) {
    throw new Error('No recent steps, heart rate, sleep, exercise or BMI records were found in the last 90 days of this export.');
  }
  return metrics;
}

/** Locate export.xml inside export.zip and return a decompressed stream of it. */
async function zipEntryStream(file: File): Promise<ReadableStream<Uint8Array>> {
  const tail = new DataView(await file.slice(Math.max(0, file.size - 66000)).arrayBuffer());
  let eocd = -1;
  for (let i = tail.byteLength - 22; i >= 0; i--) if (tail.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('This file is not a readable zip archive.');
  const entries = tail.getUint16(eocd + 10, true);
  const dirSize = tail.getUint32(eocd + 12, true);
  const dirOffset = tail.getUint32(eocd + 16, true);
  if (dirOffset === 0xffffffff) throw new Error('This export is too large to open as a zip here. Unzip it and choose export.xml instead.');
  const dir = new DataView(await file.slice(dirOffset, dirOffset + dirSize).arrayBuffer());
  const decoder = new TextDecoder();
  for (let p = 0, n = 0; n < entries && p < dir.byteLength; n++) {
    const method = dir.getUint16(p + 10, true);
    const compressed = dir.getUint32(p + 20, true);
    const nameLen = dir.getUint16(p + 28, true), extraLen = dir.getUint16(p + 30, true), commentLen = dir.getUint16(p + 32, true);
    const local = dir.getUint32(p + 42, true);
    const name = decoder.decode(new Uint8Array(dir.buffer, dir.byteOffset + p + 46, nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (!/(^|\/)export\.xml$/.test(name)) continue;
    if (compressed === 0xffffffff || local === 0xffffffff) throw new Error('This export is too large to open as a zip here. Unzip it and choose export.xml instead.');
    const header = new DataView(await file.slice(local, local + 30).arrayBuffer());
    const start = local + 30 + header.getUint16(26, true) + header.getUint16(28, true);
    const body = file.slice(start, start + compressed).stream();
    if (method === 0) return body;
    if (method === 8) return body.pipeThrough(new DecompressionStream('deflate-raw')) as ReadableStream<Uint8Array>;
    throw new Error('This zip uses an unsupported compression method. Unzip it and choose export.xml instead.');
  }
  throw new Error('No export.xml was found in this zip. Choose the export.zip from the Health app.');
}

export async function readAppleHealthExport(file: File, onProgress?: (fraction: number) => void): Promise<HealthMetrics> {
  const isZip = /\.zip$/i.test(file.name) || file.type === 'application/zip';
  const stream = isZip ? await zipEntryStream(file) : file.stream();
  // Progress is measured on bytes read; for zips this is uncompressed bytes, so cap the estimate.
  return summarize(stream, onProgress ? (bytes) => onProgress(Math.min(0.99, bytes / (isZip ? file.size * 12 : file.size))) : undefined);
}
