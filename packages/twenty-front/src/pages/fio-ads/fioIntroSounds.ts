import { FIO_INTRO_SOUND_DATA } from './fioIntroSoundData';

// Fio ad intro sounds. Real public-domain / CC0 recordings (see fioIntroSoundData
// for sources + licensing) that the user can preview and, if chosen, have spliced
// onto the very start of their own recording at submit time.

export type IntroSoundKind = 'bell' | 'trumpet';

export type IntroSoundOption = {
  kind: IntroSoundKind;
  variant: string;
  label: string;
};

// The options shown in the picker, in display order. The kind + variant pair is
// what rides along with the submission and keys into FIO_INTRO_SOUND_DATA, so
// keep them stable when swapping the underlying clips.
export const FIO_INTRO_SOUNDS: IntroSoundOption[] = [
  { kind: 'bell', variant: 'Church bells', label: 'Church bells' },
  { kind: 'bell', variant: 'Distant bells', label: 'Church bells, distant' },
  { kind: 'bell', variant: 'Orthodox chimes', label: 'Orthodox chimes' },
  { kind: 'trumpet', variant: 'Fanfare', label: 'Trumpet fanfare' },
  { kind: 'trumpet', variant: 'Herald call', label: 'Trumpet herald call' },
];

const keyOf = (kind: string, variant: string): string => `${kind}|${variant}`;

export const getIntroSoundDataUrl = (
  kind: string,
  variant: string,
): string | null => FIO_INTRO_SOUND_DATA[keyOf(kind, variant)] ?? null;

let currentAudio: HTMLAudioElement | null = null;

// Play a preview of the given intro sound (best-effort; stops any prior preview).
export const playIntroSound = (kind: IntroSoundKind, variant: string): void => {
  const url = getIntroSoundDataUrl(kind, variant);
  if (!url || typeof Audio === 'undefined') {
    return;
  }
  try {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    }
    currentAudio = new Audio(url);
    void currentAudio.play();
  } catch {
    // best-effort
  }
};

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

// Encode a (mono) rendered AudioBuffer as a 16-bit PCM WAV blob.
const audioBufferToWavBlob = (buffer: AudioBuffer): Blob => {
  const samples = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;
  const dataLength = samples.length * 2;
  const arrayBuffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(arrayBuffer);
  const writeString = (offset: number, text: string): void => {
    for (let i = 0; i < text.length; i += 1) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  };
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, dataLength, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Blob([view], { type: 'audio/wav' });
};

// Prepend the chosen intro sound onto the user's recording, returning a single
// mixed WAV (base64 + blob). Best-effort: returns null if Web Audio is missing
// or the recording can't be decoded, so the caller can fall back to the raw
// recording. Both clips are decoded and rendered offline into one mono track.
export const buildRecordingWithIntro = async ({
  recordingBase64,
  recordingContentType,
  kind,
  variant,
}: {
  recordingBase64: string;
  recordingContentType: string;
  kind: string;
  variant: string;
}): Promise<{ blob: Blob; dataBase64: string } | null> => {
  const introUrl = getIntroSoundDataUrl(kind, variant);
  if (!introUrl || typeof window === 'undefined') {
    return null;
  }
  const AudioCtor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  const OfflineCtor =
    window.OfflineAudioContext ||
    (
      window as unknown as {
        webkitOfflineAudioContext?: typeof OfflineAudioContext;
      }
    ).webkitOfflineAudioContext;
  if (!AudioCtor || !OfflineCtor) {
    return null;
  }

  const decodeCtx = new AudioCtor();
  try {
    const recordingUrl = `data:${
      recordingContentType || 'audio/webm'
    };base64,${recordingBase64}`;
    const [introAb, voiceAb] = await Promise.all([
      fetch(introUrl).then((r) => r.arrayBuffer()),
      fetch(recordingUrl).then((r) => r.arrayBuffer()),
    ]);
    const [introBuf, voiceBuf] = await Promise.all([
      decodeCtx.decodeAudioData(introAb),
      decodeCtx.decodeAudioData(voiceAb),
    ]);

    const rate = 44100;
    const gap = 0.12; // short breath between the intro and the voice
    const frames = Math.ceil(
      (introBuf.duration + gap + voiceBuf.duration) * rate,
    );
    const offline = new OfflineCtor(1, frames, rate);

    const introSource = offline.createBufferSource();
    introSource.buffer = introBuf;
    introSource.connect(offline.destination);
    introSource.start(0);

    const voiceSource = offline.createBufferSource();
    voiceSource.buffer = voiceBuf;
    voiceSource.connect(offline.destination);
    voiceSource.start(introBuf.duration + gap);

    const rendered = await offline.startRendering();
    const blob = audioBufferToWavBlob(rendered);
    const dataBase64 = await blobToBase64(blob);

    return { blob, dataBase64 };
  } catch {
    return null;
  } finally {
    void decodeCtx.close();
  }
};
