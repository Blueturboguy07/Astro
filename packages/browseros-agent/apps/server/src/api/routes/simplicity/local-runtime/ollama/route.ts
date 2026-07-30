import ModelRegistry from '../../../../../lib/simplicity/models/registry';
import {
  MODEL_TIERS,
  OLLAMA_URL,
  Progress,
  provision,
  status,
} from '../../../../../lib/simplicity/localRuntime/ollama';

/* Install-and-connect for the free local engine.
 *
 * GET  — what's already on this machine, so the UI can label the button
 *        "Install" or "Connect" before the user commits to a download.
 * POST — provision the runtime and register it as a provider, streaming
 *        progress as newline-delimited JSON. A model download is minutes long
 *        and hundreds of megabytes; a silent spinner isn't good enough.
 */

export const GET = async () => {
  try {
    return Response.json({ ...(await status()), tiers: MODEL_TIERS }, { status: 200 });
  } catch (err) {
    console.error('Failed to read local runtime status', err);
    return Response.json({ message: 'An error has occurred.' }, { status: 500 });
  }
};

export const POST = async (req: Request) => {
  const { tier } = await req.json().catch(() => ({ tier: undefined }));

  const selected =
    MODEL_TIERS.find((t) => t.key === tier) ??
    MODEL_TIERS.find((t) => t.key === 'balanced')!;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Progress | { phase: 'done'; provider: unknown }) => {
        controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'));
      };

      try {
        await provision(selected.model, send);

        /* Register it the same way the picker's Connect button would, so the
           rest of the app sees an ordinary configured provider. */
        const registry = new ModelRegistry();
        const provider = await registry.addProvider('ollama', 'Ollama', {
          baseURL: OLLAMA_URL,
        });

        send({ phase: 'done', provider });
      } catch (err: any) {
        console.error('Local runtime provisioning failed', err);
        send({
          phase: 'error',
          message: err?.message ?? 'Setup failed. Please try again.',
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache, no-transform',
    },
  });
};
