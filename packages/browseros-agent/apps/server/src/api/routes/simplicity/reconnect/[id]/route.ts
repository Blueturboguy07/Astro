import { ndjsonWriter } from '../../ndjson-writer';
import { messageEndEvent } from '../../../../../lib/simplicity/turn-end';
import SessionManager from '../../../../../lib/simplicity/session';

export const POST = async (
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  try {
    const { id } = await params;

    const session = SessionManager.getSession(id);

    if (!session) {
      return Response.json({ message: 'Session not found' }, { status: 404 });
    }

    const responseStream = new TransformStream<Uint8Array, Uint8Array>();
    const out = ndjsonWriter(responseStream.writable);

    const disconnect = session.subscribe((event, data) => {
      if (event === 'data') {
        if (data.type === 'block') {
          out.write({ type: 'block', block: data.block });
        } else if (data.type === 'updateBlock') {
          out.write({
            type: 'updateBlock',
            blockId: data.blockId,
            patch: data.patch,
          });
        } else if (data.type === 'researchComplete') {
          out.write({ type: 'researchComplete' });
        }
      } else if (event === 'end') {
        out.write(messageEndEvent(data));
        out.close();
        disconnect();
      } else if (event === 'error') {
        out.write({ type: 'error', data: data.data });
        out.close();
        disconnect();
      }
    });

    req.signal.addEventListener('abort', () => {
      disconnect();
      out.close();
    });

    return new Response(responseStream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        Connection: 'keep-alive',
        'Cache-Control': 'no-cache, no-transform',
      },
    });
  } catch (err) {
    console.error('Error in reconnecting to session stream: ', err);
    return Response.json(
      { message: 'An error has occurred.' },
      { status: 500 },
    );
  }
};
