import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { useCallback, useEffect, useRef, useState } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { useToast } from 'twenty-ui/primitives/feedback';
import { Button } from 'twenty-ui/primitives/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { currentUserState } from '@/auth/states/currentUserState';
import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { SettingsTextInput } from '@/ui/input/components/SettingsTextInput';
import { TextArea } from '@/ui/input/components/TextArea';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { REACT_APP_SERVER_BASE_URL } from '~/config';

// Desync: "Launch a Fio ad" as its own page, as a short wizard: Brand ->
// Creative -> Audio -> Review. Admin-only + paid gate is enforced server-side
// (reflected via /fio-ads/status); emails stay on jackson@desync.ai until
// FIO_ADS_EMAIL is set.

const FIO_BASE = `${REACT_APP_SERVER_BASE_URL}/fio-ads`;

const HEADLINE_MAX = 45;
const SUBTITLE_MAX = 100;
const IMAGE_MAX_BYTES = 1024 * 1024;
const IMAGE_MIN_PX = 500;
const AUDIO_MIN_SEC = 20;
const AUDIO_MAX_SEC = 30;
const MAX_CATEGORIES = 5;

const RECORD_MIME_CANDIDATES = ['audio/webm', 'audio/mp4', 'audio/ogg'];
const RECORD_EXT: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/ogg': 'ogg',
};

const STEPS = ['Brand', 'Creative', 'Audio', 'Review'];

const formatSeconds = (s: number) =>
  `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

const extractScript = (content: string): string => {
  const marked = content.match(/\[SCRIPT\]([\s\S]*?)\[\/SCRIPT\]/i);
  if (marked) {
    return marked[1].trim();
  }
  let text = content.replace(/^#.*$/gm, '').replace(/^\s*-{3,}\s*$/gm, '');
  const labelAt = text.search(/\*{0,2}(headline|subtitle)\b[^:\n]*:/i);
  if (labelAt !== -1) {
    text = text.slice(0, labelAt);
  }

  return text.trim();
};

const stripScriptMarkers = (content: string): string =>
  content.replace(/\[\/?SCRIPT\]/gi, '').trim();

const FIO_CATEGORIES = [
  'Apologetics',
  'Arts',
  'AudioDramas',
  'Business',
  'Catechism',
  'Children',
  'Coaching',
  'Comedy',
  'Dating&Relationships',
  'Development&Philanthropy',
  'Discernment',
  'DivineMercy',
  'Education',
  'Eucharist',
  'Evangelization',
  'Faith/Formation',
  'Fatherhood',
  'Finance',
  'Fiction',
  'Healing',
  'Health&Fitness',
  'History',
  'Homeschooling',
  'Homilies',
  'Leadership',
  'Literature',
  'Liturgy',
  'LiturgyoftheHours',
  'Marriage&Family',
  'Mary',
  'MentalHealth',
  'Men',
  'Ministry',
  'Motherhood',
  'Music',
  'News',
  'Novenas',
  'Parenthood',
  'PersonalDevelopment',
  'Philosophy',
  'Prayer',
  'Pregnancy',
  'Priesthood',
  'Pro-Life',
  'Psychology',
  'Reflections',
  'Rosary',
  'Saints',
  'Sacraments',
  'Scripture',
  'Sleep',
  'Society&Culture',
  'Sports',
  'TalkShow',
  'Talks',
  'Theology',
  'TheologyoftheBody',
  'Travel',
  'Women',
  'YoungAdults',
  'YouthMinistry',
];

type UploadedFile = {
  filename: string;
  contentType: string;
  dataBase64: string;
};
type Voice = { id: string; name: string; description: string };
type StatusResponse = {
  eligible: boolean;
  reason: string;
  alreadyLaunched: boolean;
  allowMultiple?: boolean;
  plan?: string;
};

const StyledPage = styled.div`
  background: ${themeCssVariables.background.primary};
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  overflow-y: auto;
`;

const StyledContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[6]};
  margin: 0 auto;
  max-width: 680px;
  padding: ${themeCssVariables.spacing[8]} ${themeCssVariables.spacing[6]};
  width: 100%;
`;

const StyledHeader = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledTitle = styled.h1`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.xl};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  margin: 0;
`;

const StyledBlurb = styled.p`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.md};
  line-height: 1.5;
  margin: 0;

  a {
    color: ${themeCssVariables.color.blue};
  }
`;

const StyledStepper = styled.div`
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledStep = styled.div`
  border-bottom: 2px solid ${themeCssVariables.border.color.medium};
  color: ${themeCssVariables.font.color.light};
  flex: 1;
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.medium};
  padding-bottom: ${themeCssVariables.spacing[2]};
  text-align: center;

  &[data-done='true'] {
    border-bottom-color: ${themeCssVariables.color.blue};
    color: ${themeCssVariables.font.color.secondary};
  }
  &[data-active='true'] {
    border-bottom-color: ${themeCssVariables.color.blue};
    color: ${themeCssVariables.font.color.primary};
  }
`;

const StyledStepCard = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[5]};
  min-height: 180px;
`;

const StyledFieldset = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
`;

const StyledGroupTitle = styled.div`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.semiBold};
`;

const StyledFieldLabel = styled.span`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.medium};
`;

const StyledHelper = styled.span`
  color: ${themeCssVariables.font.color.light};
  font-size: ${themeCssVariables.font.size.xs};
`;

const StyledError = styled.span`
  color: ${themeCssVariables.font.color.danger};
  font-size: ${themeCssVariables.font.size.xs};
`;

const StyledField = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
  width: 100%;
`;

const StyledUploadRow = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[3]};
`;

const StyledThumb = styled.img`
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  height: 56px;
  object-fit: cover;
  width: 56px;
`;

const StyledSelect = styled.select`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.sm};
  max-width: 320px;
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]};
`;

const StyledCategoryGrid = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledChip = styled.button`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.secondary};
  cursor: pointer;
  font-size: ${themeCssVariables.font.size.xs};
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]};

  &:disabled {
    cursor: default;
    opacity: 0.5;
  }

  &[data-selected='true'] {
    border-color: ${themeCssVariables.color.blue};
    color: ${themeCssVariables.color.blue};
    font-weight: ${themeCssVariables.font.weight.medium};
  }
`;

const StyledNav = styled.div`
  border-top: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  gap: ${themeCssVariables.spacing[3]};
  justify-content: space-between;
  padding-top: ${themeCssVariables.spacing[4]};
`;

const StyledMessage = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.md};
  line-height: 1.5;
`;

const StyledChat = styled.div`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
  padding: ${themeCssVariables.spacing[3]};
`;

const StyledChatMessages = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
  max-height: 240px;
  overflow-y: auto;
`;

const StyledChatMsg = styled.div`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.sm};
  line-height: 1.5;
  white-space: pre-wrap;

  &[data-role='user'] {
    color: ${themeCssVariables.font.color.secondary};
  }
`;

const StyledChatRole = styled.div`
  color: ${themeCssVariables.font.color.light};
  font-size: ${themeCssVariables.font.size.xs};
  font-weight: ${themeCssVariables.font.weight.medium};
  margin-bottom: ${themeCssVariables.spacing[1]};
`;

const StyledChatInputRow = styled.div`
  align-items: flex-end;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};

  & > *:first-child {
    flex: 1;
  }
`;

const StyledReviewRow = styled.div`
  display: flex;
  font-size: ${themeCssVariables.font.size.sm};
  gap: ${themeCssVariables.spacing[3]};
`;

const StyledReviewLabel = styled.span`
  color: ${themeCssVariables.font.color.light};
  flex: 0 0 130px;
`;

const StyledReviewValue = styled.span`
  color: ${themeCssVariables.font.color.primary};
  min-width: 0;
  white-space: pre-wrap;
  word-break: break-word;
`;

const fileToBase64 = (file: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const readImageMeta = (
  file: File,
): Promise<{ width: number; height: number; hasAlpha: boolean }> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const { naturalWidth: width, naturalHeight: height } = img;
      let hasAlpha = false;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          const { data } = ctx.getImageData(0, 0, width, height);
          for (let i = 3; i < data.length; i += 4) {
            if (data[i] < 255) {
              hasAlpha = true;
              break;
            }
          }
        }
      } catch {
        // size/cross-origin guard: treat as unknown
      }
      URL.revokeObjectURL(url);
      resolve({ width, height, hasAlpha });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read image'));
    };
    img.src = url;
  });

const base64ToBlob = (b64: string, type: string): Blob => {
  const bytes = atob(b64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i += 1) {
    arr[i] = bytes.charCodeAt(i);
  }
  return new Blob([arr], { type });
};

const readAudioDuration = (file: Blob): Promise<number> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const audio = document.createElement('audio');
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(audio.duration);
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read audio'));
    };
    audio.src = url;
  });

export const FioAdsPage = () => {
  const { t } = useLingui();
  const { enqueueToast } = useToast();

  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [step, setStep] = useState(0);

  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [brandName, setBrandName] = useState('');
  const [website, setWebsite] = useState('');
  const [headline, setHeadline] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [ctaUrl, setCtaUrl] = useState('');
  const [learnMoreUrl, setLearnMoreUrl] = useState('');
  const [logo, setLogo] = useState<UploadedFile | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [adImage, setAdImage] = useState<UploadedFile | null>(null);
  const [adImagePreview, setAdImagePreview] = useState<string | null>(null);
  const [adImageError, setAdImageError] = useState<string | null>(null);
  const [audio, setAudio] = useState<UploadedFile | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [transcribing, setTranscribing] = useState(false);
  const [generatingVoiceover, setGeneratingVoiceover] = useState(false);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voiceId, setVoiceId] = useState('');
  const [previewingVoice, setPreviewingVoice] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const adImageInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  // Browser handles (recorder, stream, timer) and caches, never rendered.
  // oxlint-disable-next-line twenty/no-state-useref
  const voiceSampleCacheRef = useRef<Map<string, string>>(new Map());
  // oxlint-disable-next-line twenty/no-state-useref
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  // oxlint-disable-next-line twenty/no-state-useref
  const recordChunksRef = useRef<Blob[]>([]);
  // oxlint-disable-next-line twenty/no-state-useref
  const recordStreamRef = useRef<MediaStream | null>(null);
  // oxlint-disable-next-line twenty/no-state-useref
  const recordTimerRef = useRef<number | null>(null);
  // oxlint-disable-next-line twenty/no-state-useref
  const recordStartRef = useRef<number>(0);

  const currentUser = useAtomStateValue(currentUserState);
  const currentWorkspaceMember = useAtomStateValue(currentWorkspaceMemberState);

  const [assistantMessages, setAssistantMessages] = useState<
    Array<{ role: 'user' | 'assistant'; content: string }>
  >([]);
  const [assistantInput, setAssistantInput] = useState('');
  const [assistantLoading, setAssistantLoading] = useState(false);

  const refreshStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const res = await fetch(`${FIO_BASE}/status`, { credentials: 'include' });
      setStatus((await res.json()) as StatusResponse);
    } catch {
      setStatus({ eligible: false, reason: 'error', alreadyLaunched: false });
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  // Prefill contact from the signed-in user once it loads (only if empty).
  useEffect(() => {
    const name = [
      currentWorkspaceMember?.name?.firstName,
      currentWorkspaceMember?.name?.lastName,
    ]
      .filter(Boolean)
      .join(' ')
      .trim();
    if (name) setContactName((prev) => prev || name);
    if (currentUser?.email) {
      setContactEmail((prev) => prev || currentUser.email);
    }
  }, [currentUser, currentWorkspaceMember]);

  // Prefill brand + website from what we know (scraper_db) + load voices, once.
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`${FIO_BASE}/prefill`, {
          credentials: 'include',
        });
        const j = (await res.json()) as {
          brandName?: string | null;
          website?: string | null;
        };
        if (j?.brandName)
          setBrandName((prev) => prev || (j.brandName as string));
        if (j?.website) setWebsite((prev) => prev || (j.website as string));
      } catch {
        // best-effort prefill
      }
    })();
    void (async () => {
      try {
        const res = await fetch(`${FIO_BASE}/voices`, {
          credentials: 'include',
        });
        const j = (await res.json()) as { voices?: Voice[] };
        if (Array.isArray(j?.voices) && j.voices.length > 0) {
          setVoices(j.voices);
          setVoiceId((prev) => prev || j.voices![0].id);
        }
      } catch {
        // no picker; backend uses its default voice
      }
    })();
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendAssistant = async () => {
    const text = assistantInput.trim();
    if (!text || assistantLoading) return;
    const next = [
      ...assistantMessages,
      { role: 'user' as const, content: text },
    ];
    setAssistantMessages(next);
    setAssistantInput('');
    setAssistantLoading(true);
    try {
      const res = await fetch(`${FIO_BASE}/assistant`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand: { name: brandName.trim(), website: website.trim() },
          messages: next,
        }),
      });
      if (!res.ok) {
        let msg = `Request failed (${res.status})`;
        try {
          const j = await res.json();
          msg = j?.error ?? j?.message ?? msg;
        } catch {
          // keep default
        }
        throw new Error(msg);
      }
      const j = (await res.json()) as { reply?: string };
      setAssistantMessages((cur) => [
        ...cur,
        { role: 'assistant', content: String(j?.reply ?? '') },
      ]);
    } catch (error) {
      enqueueToast({
        variant: 'error',
        children: t`Assistant error: ${String((error as Error)?.message ?? error)}`,
      });
    } finally {
      setAssistantLoading(false);
    }
  };

  const handleImage = async (
    file: File | undefined,
    kind: 'logo' | 'adImage',
  ) => {
    const setErr = kind === 'logo' ? setLogoError : setAdImageError;
    const setFile = kind === 'logo' ? setLogo : setAdImage;
    const setPrev = kind === 'logo' ? setLogoPreview : setAdImagePreview;
    setErr(null);
    setFile(null);
    setPrev(null);
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setErr(t`Must be a JPG or PNG.`);
      return;
    }
    if (file.size > IMAGE_MAX_BYTES) {
      setErr(t`Must be 1MB or smaller.`);
      return;
    }
    try {
      const meta = await readImageMeta(file);
      if (meta.width < IMAGE_MIN_PX || meta.height < IMAGE_MIN_PX) {
        setErr(t`Must be at least 500x500 pixels.`);
        return;
      }
      if (kind === 'adImage' && file.type === 'image/png' && meta.hasAlpha) {
        setErr(t`The ad image must be a non-transparent PNG (or a JPG).`);
        return;
      }
      const dataBase64 = await fileToBase64(file);
      setFile({ filename: file.name, contentType: file.type, dataBase64 });
      setPrev(`data:${file.type};base64,${dataBase64}`);
    } catch {
      setErr(t`Could not read that image.`);
    }
  };

  // Once audio is added and the transcript is blank, transcribe it (Groq) and
  // fill the transcript. Never overwrites typed text; fails silently.
  const autoTranscribe = async (file: UploadedFile) => {
    if (transcript.trim()) {
      return;
    }
    setTranscribing(true);
    try {
      const res = await fetch(`${FIO_BASE}/transcribe`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio: file }),
      });
      if (!res.ok) {
        return;
      }
      const j = (await res.json()) as { text?: string };
      const text = String(j?.text ?? '').trim();
      if (text) {
        setTranscript((prev) => (prev.trim() ? prev : text));
      }
    } catch {
      // best-effort
    } finally {
      setTranscribing(false);
    }
  };

  // Generate the ad audio from the script via ElevenLabs (returns an MP3).
  const generateVoiceover = async () => {
    const script = transcript.trim();
    if (!script) {
      setAudioError(t`Write or generate a script first, then I can voice it.`);
      return;
    }
    setGeneratingVoiceover(true);
    try {
      const res = await fetch(`${FIO_BASE}/voiceover`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: script, voiceId }),
      });
      if (!res.ok) {
        let msg = `Request failed (${res.status})`;
        try {
          const j = await res.json();
          msg = j?.error ?? j?.message ?? msg;
        } catch {
          // keep default
        }
        throw new Error(msg);
      }
      const j = (await res.json()) as { audio?: UploadedFile };
      if (!j.audio?.dataBase64) {
        throw new Error('No audio returned');
      }
      const blob = base64ToBlob(j.audio.dataBase64, 'audio/mpeg');
      let duration = 0;
      try {
        duration = await readAudioDuration(blob);
      } catch {
        // non-fatal
      }
      setAudio(j.audio);
      if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
      setAudioPreviewUrl(URL.createObjectURL(blob));
      if (duration && (duration < AUDIO_MIN_SEC || duration > AUDIO_MAX_SEC)) {
        setAudioError(
          t`The voiceover is ${Math.round(duration)}s; aim for a script that reads in 20 to 30 seconds, then regenerate.`,
        );
      } else {
        setAudioError(null);
      }
    } catch (error) {
      enqueueToast({
        variant: 'error',
        children: t`Couldn't generate voiceover: ${String((error as Error)?.message ?? error)}`,
      });
    } finally {
      setGeneratingVoiceover(false);
    }
  };

  // Play a short sample of the selected voice before committing to a full
  // voiceover. Cached per voice on both ends so it is cheap to click around.
  const previewVoice = async () => {
    if (!voiceId || previewingVoice) return;
    setPreviewingVoice(true);
    try {
      let b64 = voiceSampleCacheRef.current.get(voiceId);
      if (!b64) {
        const res = await fetch(
          `${FIO_BASE}/voice-sample?voiceId=${encodeURIComponent(voiceId)}`,
          { credentials: 'include' },
        );
        if (!res.ok) {
          let msg = `Request failed (${res.status})`;
          try {
            const j = await res.json();
            msg = j?.error ?? j?.message ?? msg;
          } catch {
            // keep default
          }
          throw new Error(msg);
        }
        const j = (await res.json()) as { audio?: UploadedFile };
        b64 = j.audio?.dataBase64;
        if (!b64) {
          throw new Error('No audio returned');
        }
        voiceSampleCacheRef.current.set(voiceId, b64);
      }
      const url = URL.createObjectURL(base64ToBlob(b64, 'audio/mpeg'));
      const audioEl = new Audio(url);
      audioEl.onended = () => URL.revokeObjectURL(url);
      await audioEl.play();
    } catch (error) {
      enqueueToast({
        variant: 'error',
        children: t`Couldn't play a sample: ${String((error as Error)?.message ?? error)}`,
      });
    } finally {
      setPreviewingVoice(false);
    }
  };

  const handleAudio = async (file: File | undefined) => {
    setAudioError(null);
    setAudio(null);
    if (!file) return;
    if (
      file.type !== 'audio/mpeg' &&
      !file.name.toLowerCase().endsWith('.mp3')
    ) {
      setAudioError(t`Must be an MP3.`);
      return;
    }
    try {
      const duration = await readAudioDuration(file);
      if (duration < AUDIO_MIN_SEC || duration > AUDIO_MAX_SEC) {
        setAudioError(
          t`Must be 20 to 30 seconds (this one is ${Math.round(duration)}s).`,
        );
        return;
      }
      const dataBase64 = await fileToBase64(file);
      const uploaded = {
        filename: file.name,
        contentType: 'audio/mpeg',
        dataBase64,
      };
      setAudio(uploaded);
      if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
      setAudioPreviewUrl(null);
      void autoTranscribe(uploaded);
    } catch {
      setAudioError(t`Could not read that audio file.`);
    }
  };

  const finalizeRecording = async () => {
    recordStreamRef.current?.getTracks().forEach((track) => track.stop());
    recordStreamRef.current = null;
    const elapsed = Math.round((Date.now() - recordStartRef.current) / 1000);
    const mime = (mediaRecorderRef.current?.mimeType || 'audio/webm').split(
      ';',
    )[0];
    const blob = new Blob(recordChunksRef.current, { type: mime });
    mediaRecorderRef.current = null;
    recordChunksRef.current = [];
    if (elapsed < AUDIO_MIN_SEC) {
      setAudioError(
        t`Recording must be at least 20 seconds (this one was ${elapsed}s).`,
      );
      return;
    }
    try {
      const dataBase64 = await fileToBase64(blob);
      const ext = RECORD_EXT[mime] ?? 'webm';
      const recorded = {
        filename: `recording.${ext}`,
        contentType: mime,
        dataBase64,
      };
      setAudioError(null);
      setAudio(recorded);
      if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
      setAudioPreviewUrl(URL.createObjectURL(blob));
      void autoTranscribe(recorded);
    } catch {
      setAudioError(t`Could not process the recording.`);
    }
  };

  const stopRecording = () => {
    if (recordTimerRef.current !== null) {
      window.clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== 'inactive') {
      mr.stop();
    }
    setRecording(false);
  };

  const startRecording = async () => {
    setAudioError(null);
    if (
      typeof MediaRecorder === 'undefined' ||
      !isDefined(navigator.mediaDevices?.getUserMedia)
    ) {
      setAudioError(
        t`Recording isn't supported in this browser. Upload an MP3 instead.`,
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordStreamRef.current = stream;
      recordChunksRef.current = [];
      const mime = RECORD_MIME_CANDIDATES.find((m) =>
        MediaRecorder.isTypeSupported(m),
      );
      const mr = new MediaRecorder(
        stream,
        mime ? { mimeType: mime } : undefined,
      );
      mediaRecorderRef.current = mr;
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) recordChunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        void finalizeRecording();
      };
      recordStartRef.current = Date.now();
      setRecordSeconds(0);
      mr.start();
      setRecording(true);
      recordTimerRef.current = window.setInterval(() => {
        const elapsed = Math.round(
          (Date.now() - recordStartRef.current) / 1000,
        );
        setRecordSeconds(elapsed);
        if (elapsed >= AUDIO_MAX_SEC) {
          stopRecording();
        }
      }, 500);
    } catch {
      setAudioError(
        t`Couldn't access the microphone. Check this site's microphone permission.`,
      );
    }
  };

  // Stop the mic + timer if the user navigates away mid-recording.
  useEffect(() => {
    return () => {
      if (recordTimerRef.current !== null) {
        window.clearInterval(recordTimerRef.current);
      }
      recordStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const toggleCategory = (category: string) => {
    setCategories((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : prev.length >= MAX_CATEGORIES
          ? prev
          : [...prev, category],
    );
  };

  const step0Valid = Boolean(
    contactName.trim() &&
    /.+@.+\..+/.test(contactEmail) &&
    brandName.trim() &&
    /^https?:\/\//.test(website),
  );
  const step1Valid = Boolean(
    headline.trim() &&
    headline.length <= HEADLINE_MAX &&
    subtitle.length <= SUBTITLE_MAX &&
    /^https?:\/\//.test(ctaUrl) &&
    /^https?:\/\//.test(learnMoreUrl) &&
    logo &&
    adImage &&
    categories.length >= 1,
  );
  const step2Valid = Boolean(audio && transcript.trim());
  const isValid = step0Valid && step1Valid && step2Valid;
  const canAdvance = [step0Valid, step1Valid, step2Valid, true][step];

  const resetForm = () => {
    setContactName('');
    setContactEmail('');
    setBrandName('');
    setWebsite('');
    setHeadline('');
    setSubtitle('');
    setCtaUrl('');
    setLearnMoreUrl('');
    setLogo(null);
    setLogoPreview(null);
    setAdImage(null);
    setAdImagePreview(null);
    setAudio(null);
    setAudioPreviewUrl(null);
    setTranscript('');
    setCategories([]);
    setAssistantMessages([]);
    setStep(0);
  };

  const submit = async () => {
    if (!isValid || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${FIO_BASE}/launch`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand: {
            contactName: contactName.trim(),
            contactEmail: contactEmail.trim(),
            brandName: brandName.trim(),
            website: website.trim(),
          },
          copy: {
            headline: headline.trim(),
            subtitle: subtitle.trim(),
            ctaUrl: ctaUrl.trim(),
            learnMoreUrl: learnMoreUrl.trim(),
          },
          categories,
          audioTranscript: transcript.trim(),
          logo,
          adImage,
          audio,
        }),
      });
      if (!res.ok) {
        let msg = `Request failed (${res.status})`;
        try {
          const j = await res.json();
          msg = j?.error ?? j?.message ?? msg;
        } catch {
          // keep default
        }
        throw new Error(msg);
      }
      enqueueToast({
        variant: 'success',
        children: t`Your Fio ad was submitted. We'll be in touch.`,
      });
      resetForm();
      await refreshStatus();
    } catch (error) {
      enqueueToast({
        variant: 'error',
        children: t`Couldn't submit: ${String((error as Error)?.message ?? error)}`,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const blockedMessage = () => {
    if (status?.alreadyLaunched && !status?.allowMultiple) {
      return t`This workspace has already submitted its Fio ad. We'll be in touch; reach out if you need to change it.`;
    }
    if (status?.reason === 'not_admin') {
      return t`Only workspace admins can launch a Fio ad. Ask an admin on your workspace to set it up.`;
    }
    if (status?.reason === 'referral') {
      return t`Fio ads are available on paid plans (Starter and above). Referral accounts aren't eligible.`;
    }
    if (status?.reason === 'not_paid') {
      return t`Fio ads are available on Starter and above. Upgrade your plan to launch one.`;
    }
    return t`Fio ads aren't available on your account yet.`;
  };

  const canShowForm =
    status?.eligible && !(status?.alreadyLaunched && !status?.allowMultiple);

  const reviewRow = (label: string, value: string) => (
    <StyledReviewRow>
      <StyledReviewLabel>{label}</StyledReviewLabel>
      <StyledReviewValue>{value || t`not set`}</StyledReviewValue>
    </StyledReviewRow>
  );

  return (
    <StyledPage>
      <StyledContent>
        <StyledHeader>
          <StyledTitle>{t`Launch a Fio ad`}</StyledTitle>
          <StyledBlurb>
            {t`Fio is a Catholic podcast network`} (
            <a href="https://fio.fm/" target="_blank" rel="noopener noreferrer">
              fio.fm
            </a>
            ).{' '}
            {t`Run a 20 to 30 second audio ad for your brand across their shows. A few quick steps and we'll handle delivery.`}
          </StyledBlurb>
        </StyledHeader>

        {loadingStatus ? null : !canShowForm ? (
          <StyledMessage>{blockedMessage()}</StyledMessage>
        ) : (
          <>
            <StyledStepper>
              {STEPS.map((label, i) => (
                <StyledStep
                  key={label}
                  data-active={i === step ? 'true' : 'false'}
                  data-done={i < step ? 'true' : 'false'}
                >
                  {i + 1}. {label}
                </StyledStep>
              ))}
            </StyledStepper>

            <StyledStepCard>
              {step === 0 && (
                <StyledFieldset>
                  <StyledGroupTitle>{t`About your brand`}</StyledGroupTitle>
                  <SettingsTextInput
                    instanceId="fio-contact-name"
                    label={t`Contact full name`}
                    value={contactName}
                    onChange={setContactName}
                    fullWidth
                  />
                  <SettingsTextInput
                    instanceId="fio-contact-email"
                    label={t`Contact email`}
                    value={contactEmail}
                    onChange={setContactEmail}
                    fullWidth
                  />
                  <SettingsTextInput
                    instanceId="fio-brand-name"
                    label={t`Brand name`}
                    value={brandName}
                    onChange={setBrandName}
                    fullWidth
                  />
                  <SettingsTextInput
                    instanceId="fio-website"
                    label={t`Website (https://...)`}
                    value={website}
                    onChange={setWebsite}
                    fullWidth
                  />
                  <StyledHelper>{t`We prefilled what we already know. Edit anything.`}</StyledHelper>
                </StyledFieldset>
              )}

              {step === 1 && (
                <>
                  <StyledFieldset>
                    <StyledGroupTitle>{t`Copy & links`}</StyledGroupTitle>
                    <SettingsTextInput
                      instanceId="fio-headline"
                      label={t`Headline (${headline.length}/${HEADLINE_MAX})`}
                      value={headline}
                      onChange={(v) => setHeadline(v.slice(0, HEADLINE_MAX))}
                      maxLength={HEADLINE_MAX}
                      fullWidth
                    />
                    <SettingsTextInput
                      instanceId="fio-subtitle"
                      label={t`Subtitle (${subtitle.length}/${SUBTITLE_MAX})`}
                      value={subtitle}
                      onChange={(v) => setSubtitle(v.slice(0, SUBTITLE_MAX))}
                      maxLength={SUBTITLE_MAX}
                      fullWidth
                    />
                    <SettingsTextInput
                      instanceId="fio-cta-url"
                      label={t`Call-to-action button URL (https://...)`}
                      value={ctaUrl}
                      onChange={setCtaUrl}
                      fullWidth
                    />
                    <SettingsTextInput
                      instanceId="fio-learn-more-url"
                      label={t`Learn More URL (https://...)`}
                      value={learnMoreUrl}
                      onChange={setLearnMoreUrl}
                      fullWidth
                    />
                  </StyledFieldset>

                  <StyledFieldset>
                    <StyledGroupTitle>{t`Images`}</StyledGroupTitle>
                    <StyledField>
                      <StyledFieldLabel>{t`Logo`}</StyledFieldLabel>
                      <StyledHelper>{t`At least 500x500, up to 1MB. JPG or transparent PNG.`}</StyledHelper>
                      <StyledUploadRow>
                        {logoPreview && (
                          <StyledThumb src={logoPreview} alt="logo" />
                        )}
                        <Button
                          variant="outline"
                          onClick={() => logoInputRef.current?.click()}
                        >
                          {logo ? t`Replace logo` : t`Choose logo`}
                        </Button>
                        <input
                          ref={logoInputRef}
                          type="file"
                          accept="image/jpeg,image/png"
                          style={{ display: 'none' }}
                          onChange={(e) =>
                            void handleImage(e.target.files?.[0], 'logo')
                          }
                        />
                      </StyledUploadRow>
                      {logoError && <StyledError>{logoError}</StyledError>}
                    </StyledField>
                    <StyledField>
                      <StyledFieldLabel>{t`Advertisement image`}</StyledFieldLabel>
                      <StyledHelper>{t`At least 500x500, up to 1MB. JPG or non-transparent PNG.`}</StyledHelper>
                      <StyledUploadRow>
                        {adImagePreview && (
                          <StyledThumb src={adImagePreview} alt="ad" />
                        )}
                        <Button
                          variant="outline"
                          onClick={() => adImageInputRef.current?.click()}
                        >
                          {adImage ? t`Replace image` : t`Choose image`}
                        </Button>
                        <input
                          ref={adImageInputRef}
                          type="file"
                          accept="image/jpeg,image/png"
                          style={{ display: 'none' }}
                          onChange={(e) =>
                            void handleImage(e.target.files?.[0], 'adImage')
                          }
                        />
                      </StyledUploadRow>
                      {adImageError && (
                        <StyledError>{adImageError}</StyledError>
                      )}
                    </StyledField>
                  </StyledFieldset>

                  <StyledFieldset>
                    <StyledGroupTitle>
                      {t`Categories (${categories.length}/${MAX_CATEGORIES})`}
                    </StyledGroupTitle>
                    <StyledHelper>{t`Pick up to 5 listening categories to target.`}</StyledHelper>
                    <StyledCategoryGrid>
                      {FIO_CATEGORIES.map((category) => {
                        const selected = categories.includes(category);
                        return (
                          <StyledChip
                            key={category}
                            type="button"
                            data-selected={selected ? 'true' : 'false'}
                            onClick={() => toggleCategory(category)}
                            disabled={
                              !selected && categories.length >= MAX_CATEGORIES
                            }
                          >
                            {category}
                          </StyledChip>
                        );
                      })}
                    </StyledCategoryGrid>
                  </StyledFieldset>
                </>
              )}

              {step === 2 && (
                <>
                  <StyledFieldset>
                    <StyledGroupTitle>{t`Script assistant`}</StyledGroupTitle>
                    <StyledHelper>
                      {t`Describe what you want to promote and the assistant will draft a 20 to 30 second script from your brand and website. Edit anything it gives you.`}
                    </StyledHelper>
                    <StyledChat>
                      {assistantMessages.length > 0 && (
                        <StyledChatMessages>
                          {assistantMessages.map((m, i) => (
                            <div key={i}>
                              <StyledChatRole>
                                {m.role === 'user' ? t`You` : t`Assistant`}
                              </StyledChatRole>
                              <StyledChatMsg data-role={m.role}>
                                {m.role === 'assistant'
                                  ? stripScriptMarkers(m.content)
                                  : m.content}
                              </StyledChatMsg>
                              {m.role === 'assistant' && (
                                <div style={{ marginTop: '6px' }}>
                                  <Button
                                    variant="outline"
                                    onClick={() =>
                                      setTranscript(extractScript(m.content))
                                    }
                                  >
                                    {t`Use as script`}
                                  </Button>
                                </div>
                              )}
                            </div>
                          ))}
                        </StyledChatMessages>
                      )}
                      <StyledChatInputRow>
                        <TextArea
                          textAreaId="fio-assistant-input"
                          placeholder={t`e.g. Promote our parish youth retreat in July`}
                          value={assistantInput}
                          onChange={setAssistantInput}
                          minRows={2}
                          maxRows={4}
                        />
                        <Button
                          variant="solid"
                          color="accent"
                          onClick={sendAssistant}
                          disabled={!assistantInput.trim() || assistantLoading}
                        >
                          {assistantLoading ? t`Thinking...` : t`Send`}
                        </Button>
                      </StyledChatInputRow>
                    </StyledChat>
                    <TextArea
                      textAreaId="fio-transcript"
                      label={t`Script / transcript`}
                      placeholder={t`Paste the script, or add audio and we'll fill it in for you.`}
                      value={transcript}
                      onChange={setTranscript}
                      minRows={3}
                      maxRows={8}
                    />
                    {transcribing && (
                      <StyledHelper>{t`Transcribing your audio...`}</StyledHelper>
                    )}
                  </StyledFieldset>

                  <StyledFieldset>
                    <StyledGroupTitle>{t`Audio (20 to 30 seconds)`}</StyledGroupTitle>
                    <StyledHelper>
                      {t`Generate an AI voiceover of your script, record one in your browser, or upload an MP3.`}
                    </StyledHelper>
                    {voices.length > 0 && (
                      <StyledField>
                        <StyledFieldLabel>{t`AI voice`}</StyledFieldLabel>
                        <StyledUploadRow>
                          <StyledSelect
                            value={voiceId}
                            onChange={(e) => setVoiceId(e.target.value)}
                          >
                            {voices.map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.name} ({v.description})
                              </option>
                            ))}
                          </StyledSelect>
                          <Button
                            variant="outline"
                            onClick={() => void previewVoice()}
                            disabled={!voiceId || previewingVoice}
                          >
                            {previewingVoice ? t`Loading...` : t`Preview voice`}
                          </Button>
                        </StyledUploadRow>
                        <StyledHelper>{t`Hear a short sample before generating.`}</StyledHelper>
                      </StyledField>
                    )}
                    <StyledUploadRow>
                      <Button
                        variant="solid"
                        color="accent"
                        onClick={() => void generateVoiceover()}
                        disabled={recording || generatingVoiceover}
                      >
                        {generatingVoiceover
                          ? t`Generating...`
                          : t`Generate AI voiceover`}
                      </Button>
                      {recording ? (
                        <Button
                          variant="solid"
                          color="accent"
                          onClick={stopRecording}
                        >
                          {t`Stop (${formatSeconds(recordSeconds)})`}
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          onClick={() => void startRecording()}
                        >
                          {t`Record`}
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        onClick={() => audioInputRef.current?.click()}
                        disabled={recording}
                      >
                        {audio ? t`Replace with MP3` : t`Upload MP3`}
                      </Button>
                      {audio && !recording && (
                        <StyledHelper>{audio.filename}</StyledHelper>
                      )}
                      <input
                        ref={audioInputRef}
                        type="file"
                        accept="audio/mpeg,.mp3"
                        style={{ display: 'none' }}
                        onChange={(e) => void handleAudio(e.target.files?.[0])}
                      />
                    </StyledUploadRow>
                    {recording && (
                      <StyledHelper>
                        {t`Recording, up to 30 seconds. Speak your ad, then press Stop.`}
                      </StyledHelper>
                    )}
                    {audioPreviewUrl && !recording && (
                      <audio
                        controls
                        src={audioPreviewUrl}
                        style={{ marginTop: '4px', maxWidth: '100%' }}
                      />
                    )}
                    {audioError && <StyledError>{audioError}</StyledError>}
                  </StyledFieldset>
                </>
              )}

              {step === 3 && (
                <StyledFieldset>
                  <StyledGroupTitle>{t`Review & submit`}</StyledGroupTitle>
                  {reviewRow(t`Contact`, `${contactName} (${contactEmail})`)}
                  {reviewRow(t`Brand`, brandName)}
                  {reviewRow(t`Website`, website)}
                  {reviewRow(t`Headline`, headline)}
                  {reviewRow(t`Subtitle`, subtitle)}
                  {reviewRow(t`CTA URL`, ctaUrl)}
                  {reviewRow(t`Learn More`, learnMoreUrl)}
                  {reviewRow(t`Categories`, categories.join(', '))}
                  {reviewRow(
                    t`Logo / image`,
                    `${logo ? t`logo set` : t`missing`}, ${adImage ? t`image set` : t`missing`}`,
                  )}
                  {reviewRow(t`Audio`, audio ? audio.filename : t`missing`)}
                  {audioPreviewUrl && (
                    <audio
                      controls
                      src={audioPreviewUrl}
                      style={{ maxWidth: '100%' }}
                    />
                  )}
                  {reviewRow(t`Transcript`, transcript)}
                  {!isValid && (
                    <StyledError>
                      {t`Something's missing. Go back and complete the earlier steps.`}
                    </StyledError>
                  )}
                </StyledFieldset>
              )}
            </StyledStepCard>

            <StyledNav>
              <Button
                variant="outline"
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                disabled={step === 0}
              >
                {t`Back`}
              </Button>
              {step < STEPS.length - 1 ? (
                <Button
                  variant="solid"
                  color="accent"
                  onClick={() =>
                    setStep((s) => Math.min(STEPS.length - 1, s + 1))
                  }
                  disabled={!canAdvance}
                >
                  {t`Next`}
                </Button>
              ) : (
                <Button
                  variant="solid"
                  color="accent"
                  onClick={submit}
                  disabled={!isValid || submitting}
                >
                  {submitting ? t`Submitting...` : t`Submit Fio ad`}
                </Button>
              )}
            </StyledNav>
          </>
        )}
      </StyledContent>
    </StyledPage>
  );
};
