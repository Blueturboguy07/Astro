/* A provider that refuses a request can send the refusal as the answer
   text ("The request was rejected because it was considered high risk")
   or end with finish_reason "content_filter". The turn then showed as a
   "Completed" answer (Astro 0.2.4 QA, INV-DOCS-23). Returns the error
   message for such an answer, or null for a real answer. Only short
   answers are checked, so an answer that quotes such a sentence passes. */
const REFUSAL =
  /\b(request was rejected|considered (high|too) risk|content (management |filtering )?policy|flagged (as|by) (unsafe|inappropriate|our)|blocked by (the )?(safety|content) (system|filter))/i;

export const providerRefusal = (
  answer: string,
  finishReason?: string | null,
): string | null => {
  const text = answer.trim();
  const filtered = finishReason === 'content_filter';
  if (!filtered && (text.length === 0 || text.length > 300 || !REFUSAL.test(text)))
    return null;
  const said = text ? ` It said: "${text.slice(0, 200)}"` : '';
  return `The model's provider refused this request.${said} Try again, rephrase the question, or choose another model.`;
};
