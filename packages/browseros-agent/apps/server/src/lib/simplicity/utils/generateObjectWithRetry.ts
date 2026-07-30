import z from 'zod/v4';
import BaseLLM from '../models/base/llm';
import { GenerateObjectInput } from '../models/types';

/* Structured-output calls are the backbone of the deterministic search
   pipeline (classification, query planning, refinement). Providers that parse
   JSON out of plain text — the Claude Code CLI above all — fail these
   single-shot on occasion, and one malformed response must not take the whole
   turn down with it. */
export const generateObjectWithRetry = async <T extends z.ZodTypeAny>(
  llm: BaseLLM<any>,
  input: GenerateObjectInput,
  tries = 2,
): Promise<z.infer<T>> => {
  let lastErr: unknown;

  for (let attempt = 0; attempt <= tries; attempt++) {
    try {
      return await llm.generateObject<T>(input);
    } catch (err) {
      lastErr = err;
    }
  }

  throw lastErr;
};
