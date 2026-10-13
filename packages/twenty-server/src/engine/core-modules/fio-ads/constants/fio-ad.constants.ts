// Fio ads feature constants.

// Per-user KV key recording that a user has submitted their Fio ad (one per
// user; stored user-scoped via KeyValuePairService with workspaceId null).
export const FIO_AD_SUBMISSION_KV_KEY = 'FIO_AD_SUBMISSION';

// SAFETY (do not remove): Fio ad emails must NEVER default to the real Fio
// inbox. Until Jackson explicitly sets FIO_ADS_EMAIL on an environment, every
// submission goes ONLY to this address. ads@fio.fm is deliberately NOT written
// anywhere as a default; it only ships once FIO_ADS_EMAIL is set to it.
export const FIO_ADS_FALLBACK_RECIPIENT = 'jackson@desync.ai';

export const FIO_AD_LIMITS = {
  headlineMax: 45,
  subtitleMax: 100,
  imageMaxBytes: 1024 * 1024, // 1MB per Fio spec
  audioMaxBytes: 20 * 1024 * 1024, // generous cap for a 20-30s MP3
  minCategories: 1,
  maxCategories: 5,
};

// Fio listening categories (verbatim from the spec sheet). Used to validate the
// client's selection server-side.
export const FIO_AD_CATEGORIES = [
  'Apologetics', 'Arts', 'AudioDramas', 'Business', 'Catechism', 'Children',
  'Coaching', 'Comedy', 'Dating&Relationships', 'Development&Philanthropy',
  'Discernment', 'DivineMercy', 'Education', 'Eucharist', 'Evangelization',
  'Faith/Formation', 'Fatherhood', 'Finance', 'Fiction', 'Healing',
  'Health&Fitness', 'History', 'Homeschooling', 'Homilies', 'Leadership',
  'Literature', 'Liturgy', 'LiturgyoftheHours', 'Marriage&Family', 'Mary',
  'MentalHealth', 'Men', 'Ministry', 'Motherhood', 'Music', 'News', 'Novenas',
  'Parenthood', 'PersonalDevelopment', 'Philosophy', 'Prayer', 'Pregnancy',
  'Priesthood', 'Pro-Life', 'Psychology', 'Reflections', 'Rosary', 'Saints',
  'Sacraments', 'Scripture', 'Sleep', 'Society&Culture', 'Sports', 'TalkShow',
  'Talks', 'Theology', 'TheologyoftheBody', 'Travel', 'Women', 'YoungAdults',
  'YouthMinistry',
] as const;

export const FIO_AD_CATEGORY_SET: ReadonlySet<string> = new Set(
  FIO_AD_CATEGORIES,
);

// ElevenLabs' newer default voices. These sound far more natural than the old
// v1 premade set (Rachel/Adam/Antoni/Bella/Josh), and (verified 2026-10-12) they
// synthesize over the API even on a free plan, unlike the old library voices
// which 402 "paid_plan_required". First entry is the default. Users pick one for
// the AI voiceover. (Default voices are slated to retire 2026-12-31; revisit then.)
export const FIO_VOICES: ReadonlyArray<{
  id: string;
  name: string;
  description: string;
}> = [
  { id: 'nPczCjzI2devNBz1zQrb', name: 'Brian', description: 'Male, deep and warm, great for ads' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', description: 'Female, warm and professional' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', description: 'Male, British, warm narration' },
  { id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda', description: 'Female, warm and friendly' },
  { id: 'pqHfZKP75CvOlQylNhV4', name: 'Bill', description: 'Male, friendly and trustworthy' },
  { id: 'Xb7hH8MSUJpSbSDYk0k2', name: 'Alice', description: 'Female, British, clear and friendly' },
  { id: 'cjVigY5qzO86Huf0OWal', name: 'Eric', description: 'Male, smooth and natural' },
  { id: 'cgSgspJ2msm6clMCkdW9', name: 'Jessica', description: 'Female, expressive and conversational' },
];

export const FIO_VOICE_IDS: ReadonlySet<string> = new Set(
  FIO_VOICES.map((v) => v.id),
);
