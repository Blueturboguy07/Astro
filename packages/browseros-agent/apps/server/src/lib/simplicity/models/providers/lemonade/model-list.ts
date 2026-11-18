import type { Model } from '../../types';

/* Which models of a Lemonade (or other OpenAI-compatible) /models answer
   can chat. Only `recipe: 'llamacpp'` entries were listed, so Lemonade's
   ONNX/NPU models and any server without a `recipe` field gave an empty
   list, and a working connection had no row in the model picker (Astro
   0.2.4 QA, F-040, O4-M-13). Speech, image and embedding models stay out. */
const NON_CHAT_RECIPES = new Set(['whispercpp', 'sd-cpp', 'kokoro']);
const NON_CHAT_LABELS = new Set([
  'embeddings',
  'reranking',
  'audio',
  'image',
  'tts',
]);

type ListedModel = { id?: unknown; recipe?: unknown; labels?: unknown };

const labelsOf = (m: ListedModel): string[] =>
  Array.isArray(m.labels)
    ? m.labels.filter((l): l is string => typeof l === 'string')
    : [];

export const lemonadeChatModels = (data: unknown): Model[] => {
  const list = Array.isArray((data as { data?: unknown })?.data)
    ? ((data as { data: ListedModel[] }).data ?? [])
    : [];
  return list
    .filter((m) => typeof m?.id === 'string' && m.id !== '')
    .filter(
      (m) =>
        !(typeof m.recipe === 'string' && NON_CHAT_RECIPES.has(m.recipe)) &&
        !labelsOf(m).some((l) => NON_CHAT_LABELS.has(l)),
    )
    .map((m) => ({ name: m.id as string, key: m.id as string }));
};

/* Embedding models: the ones Lemonade labels so, plus llama.cpp models
   (the list used before, which embeds through the same server). */
export const lemonadeEmbeddingModels = (data: unknown): Model[] => {
  const list = Array.isArray((data as { data?: unknown })?.data)
    ? ((data as { data: ListedModel[] }).data ?? [])
    : [];
  return list
    .filter((m) => typeof m?.id === 'string' && m.id !== '')
    .filter(
      (m) => m.recipe === 'llamacpp' || labelsOf(m).includes('embeddings'),
    )
    .map((m) => ({ name: m.id as string, key: m.id as string }));
};
