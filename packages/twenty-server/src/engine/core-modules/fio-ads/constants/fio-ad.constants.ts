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

// Fio voiceovers use Cartesia (Sonic) TTS. We surface a curated selection of
// Cartesia's most natural English voices. The real voice catalog is fetched live
// from Cartesia (/voices) at runtime and intersected with this recommended-name
// allowlist (see FioAdsService.fetchCuratedVoices), so the IDs stay correct as
// Cartesia updates its library and we never hardcode a UUID that can drift.
//
// This allowlist is Cartesia's own "stable, realistic" English picks, in the
// order we want them shown, each with a friendly tone description for the picker.
export const CARTESIA_EN_VOICE_ALLOWLIST: ReadonlyArray<{
  name: string;
  description: string;
}> = [
  { name: 'Daniel', description: 'Male, warm and natural, great for ads' },
  { name: 'Skylar', description: 'Female, friendly and clear' },
  { name: 'Jacqueline', description: 'Female, warm and professional' },
  { name: 'Parker', description: 'Male, calm and trustworthy' },
  { name: 'Emma', description: 'Female, bright and conversational' },
  { name: 'Jameson', description: 'Male, deep and smooth' },
  { name: 'Gemma', description: 'Female, British, warm' },
  { name: 'Archie', description: 'Male, British, confident' },
  { name: 'Lauren', description: 'Female, expressive and engaging' },
  { name: 'Corey', description: 'Male, clear and upbeat' },
];

// Verified Cartesia voice IDs, used ONLY as a fallback if the live /voices fetch
// fails (or before the API key is set), so the picker is never empty.
export const FIO_VOICE_FALLBACK: ReadonlyArray<{
  id: string;
  name: string;
  description: string;
}> = [
  { id: '47c38ca4-5f35-497b-b1a3-415245fb35e1', name: 'Daniel', description: 'Male, warm and natural, great for ads' },
  { id: 'db6b0ed5-d5d3-463d-ae85-518a07d3c2b4', name: 'Skylar', description: 'Female, friendly and clear' },
  { id: '9626c31c-bec5-4cca-baa8-f8ba9e84c8bc', name: 'Jacqueline', description: 'Female, warm and professional' },
  { id: '62ae83ad-4f6a-430b-af41-a9bede9286ca', name: 'Gemma', description: 'Female, British, warm' },
  { id: 'ef191366-f52f-447a-a398-ed8c0f2943a1', name: 'Archie', description: 'Male, British, confident' },
];

// Default voice when the user doesn't pick one (Daniel: warm male read).
export const CARTESIA_DEFAULT_VOICE_ID = '47c38ca4-5f35-497b-b1a3-415245fb35e1';
