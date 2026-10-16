// Fio ad intro-sound previews, synthesized on the fly with the Web Audio API.
// No audio files are bundled (no asset weight, no licensing): each sound is
// generated when the user presses Play, so they can hear a church bell or a
// trumpet before choosing one (or pick none). These are tasteful stand-ins;
// they can be swapped for real recordings later without changing the picker,
// as long as the same kind + variant labels are kept.

export type IntroSoundKind = 'bell' | 'trumpet';

export type IntroSoundOption = {
  kind: IntroSoundKind;
  variant: string;
  label: string;
};

// The options shown in the picker, in display order. The variant strings are
// what rides along with the submission, so keep them stable.
export const FIO_INTRO_SOUNDS: IntroSoundOption[] = [
  { kind: 'bell', variant: 'Single toll', label: 'Church bell, single toll' },
  { kind: 'bell', variant: 'Triple peal', label: 'Church bell, triple peal' },
  { kind: 'bell', variant: 'Distant bells', label: 'Church bell, distant' },
  { kind: 'trumpet', variant: 'Short fanfare', label: 'Trumpet, short fanfare' },
  { kind: 'trumpet', variant: 'Herald call', label: 'Trumpet, herald call' },
];

let sharedContext: AudioContext | null = null;

const getContext = (): AudioContext | null => {
  if (typeof window === 'undefined') {
    return null;
  }
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) {
    return null;
  }
  if (!sharedContext) {
    sharedContext = new Ctor();
  }
  if (sharedContext.state === 'suspended') {
    void sharedContext.resume();
  }

  return sharedContext;
};

// One struck-bell timbre: a set of inharmonic partials with exponential decay,
// the classic additive recipe for a bell (a minor-third church-bell spectrum).
const strikeBell = (
  ctx: AudioContext,
  at: number,
  base: number,
  gainScale: number,
  decay: number,
  dest: AudioNode,
): void => {
  const partials: Array<[number, number]> = [
    [0.56, 0.6],
    [0.92, 0.2],
    [1.0, 1.0],
    [1.2, 0.5],
    [1.5, 0.3],
    [2.0, 0.4],
    [2.74, 0.18],
    [3.0, 0.12],
  ];
  for (const [ratio, amp] of partials) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = base * ratio;
    const gain = ctx.createGain();
    const peak = Math.max(0.2 * amp * gainScale, 0.0002);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(peak, at + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + decay);
    osc.connect(gain).connect(dest);
    osc.start(at);
    osc.stop(at + decay + 0.05);
  }
};

// One brass note: a sawtooth through a lowpass with a quick attack and a short
// release, which reads as a trumpet-ish tone.
const brassNote = (
  ctx: AudioContext,
  at: number,
  freq: number,
  dur: number,
  dest: AudioNode,
): void => {
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = freq;
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = Math.min(freq * 6, 6000);
  const gain = ctx.createGain();
  const peak = 0.16;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(peak, at + 0.03);
  gain.gain.setValueAtTime(peak, at + dur * 0.7);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(lowpass).connect(gain).connect(dest);
  osc.start(at);
  osc.stop(at + dur + 0.05);
};

// Play a short preview of the given intro sound. Best-effort: silently no-ops
// if Web Audio is unavailable.
export const playIntroSound = (kind: IntroSoundKind, variant: string): void => {
  const ctx = getContext();
  if (!ctx) {
    return;
  }
  const now = ctx.currentTime + 0.02;
  const master = ctx.createGain();
  master.gain.value = 0.8;
  master.connect(ctx.destination);

  if (kind === 'bell') {
    if (variant === 'Triple peal') {
      strikeBell(ctx, now, 587.33, 1, 1.8, master);
      strikeBell(ctx, now + 0.55, 587.33, 0.95, 1.8, master);
      strikeBell(ctx, now + 1.1, 587.33, 0.95, 2.4, master);
    } else if (variant === 'Distant bells') {
      const lowpass = ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 1100;
      lowpass.connect(master);
      strikeBell(ctx, now, 523.25, 0.5, 2.6, lowpass);
      strikeBell(ctx, now + 0.4, 392.0, 0.4, 2.8, lowpass);
    } else {
      strikeBell(ctx, now, 587.33, 1, 2.8, master);
    }

    return;
  }

  if (variant === 'Herald call') {
    brassNote(ctx, now, 783.99, 0.35, master);
    brassNote(ctx, now + 0.4, 783.99, 0.25, master);
    brassNote(ctx, now + 0.7, 1046.5, 0.6, master);
  } else {
    brassNote(ctx, now, 523.25, 0.2, master);
    brassNote(ctx, now + 0.18, 659.25, 0.2, master);
    brassNote(ctx, now + 0.36, 783.99, 0.2, master);
    brassNote(ctx, now + 0.54, 1046.5, 0.5, master);
  }
};
