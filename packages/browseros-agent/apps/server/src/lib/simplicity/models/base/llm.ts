import z from 'zod/v4';
import {
  GenerateObjectInput,
  GenerateOptions,
  GenerateTextInput,
  GenerateTextOutput,
  StreamTextOutput,
} from '../types';
import { UsageMeter, LLMUsage } from '../../pricing/meter';

/* The LLM instance only knows its own `model` string — not the providerType
   or per-connection providerId the pricing table keys off of — so attribution
   is handed in by the caller (the chat route) rather than inferred here. */
export type UsageAttribution = {
  providerType: string;
  providerId: string;
  model: string;
};

abstract class BaseLLM<CONFIG> {
  protected meter?: UsageMeter;
  protected attribution?: UsageAttribution;

  constructor(protected config: CONFIG) {}
  abstract generateText(input: GenerateTextInput): Promise<GenerateTextOutput>;
  abstract streamText(
    input: GenerateTextInput,
  ): AsyncGenerator<StreamTextOutput>;
  abstract generateObject<T>(input: GenerateObjectInput): Promise<z.infer<T>>;
  abstract streamObject<T>(
    input: GenerateObjectInput,
  ): AsyncGenerator<Partial<z.infer<T>>>;

  /* Attaches a per-turn UsageMeter to this instance. Called once per LLM per
     turn (chat route) — NOT plumbed through generateObject/generateText
     return values, since generateObject<T> returns the parsed object directly
     and changing that signature would touch every call site in the pipeline. */
  setMeter(meter: UsageMeter, attribution: UsageAttribution) {
    this.meter = meter;
    this.attribution = attribution;
  }

  /* Called by subclasses after each API response that carries usage.
     No-op when no meter is attached (e.g. in tests, or providers that never
     call it). */
  protected recordUsage(usage: Omit<LLMUsage, keyof UsageAttribution>) {
    if (!this.meter || !this.attribution) return;
    this.meter.record({ ...this.attribution, ...usage });
  }
}

export default BaseLLM;
