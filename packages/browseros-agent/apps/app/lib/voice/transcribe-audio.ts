import { isNotAnswering, note402, resolveProvider } from '@/lib/publik/publik'

/* Astro 0.2.4 QA, F-011 d: upstream sent every recording to BrowserOS's own
   transcription service. Astro sends it to publik's OpenAI-compatible
   POST /audio/transcriptions with this computer's publik key, and only when
   the person pays with publik ("Connect your plan"); publik charges the
   audio minutes to that plan. With "Use my own key" there is no publik key
   to send, so voice input says so plainly instead of calling anyone. */

/** publik has no tier name for speech; whisper-1 is the one model that returns verbose_json (per-segment confidence) and meters by duration. */
export const TRANSCRIBE_MODEL = 'whisper-1'

export const VOICE_NEEDS_PUBLIK =
  'Voice input needs a publik plan. Open Settings > Models and press Connect your plan, or type your message.'

const BIAS_PROMPT =
  'Transcript of a user dictating a chat message. Do not describe non-speech sounds.'

export interface TranscribeResult {
  text: string
  avgLogprob?: number
}

interface VerboseSegment {
  avg_logprob?: number
  no_speech_prob?: number
}

interface TranscribeResponse {
  text?: string
  segments?: VerboseSegment[]
}

export async function transcribeAudio(
  audioBlob: Blob,
): Promise<TranscribeResult> {
  const provider = await resolveProvider(null)
  if (provider.kind !== 'publik') throw new Error(VOICE_NEEDS_PUBLIK)

  const formData = new FormData()
  formData.append('file', audioBlob, 'recording.webm')
  formData.append('model', TRANSCRIBE_MODEL)
  // verbose_json gives us per-segment avg_logprob; if the gateway
  // ignores it we still get the plain text back and just skip the
  // confidence-based drop in the sanitizer.
  formData.append('response_format', 'verbose_json')
  // Lock Whisper to English. Without this, auto-detect flips short
  // utterances between scripts (e.g. English -> Punjabi/Hindi) and the
  // LLM mirrors the wrong script in its reply.
  formData.append('language', 'en')
  // temperature 0 makes Whisper deterministic and less prone to
  // hallucinating sound-tag descriptions over near-silent input.
  formData.append('temperature', '0')
  // A short decoder bias. Keep neutral; do not feed user history in
  // here or Whisper will complete the prompt as text rather than
  // transcribe the audio.
  formData.append('prompt', BIAS_PROMPT)

  let response: Response
  try {
    response = await fetch(
      `${provider.baseURL.replace(/\/+$/, '')}/audio/transcriptions`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${provider.apiKey}` },
        body: formData,
        signal: AbortSignal.timeout(60_000),
      },
    )
  } catch {
    throw new Error('publik is not reachable. Check your connection.')
  }

  if (!response.ok) {
    const body: { error?: { message?: string } } = await response
      .json()
      .catch(() => ({}))
    const message = body.error?.message
    if (response.status === 402) {
      /* The chat's money banner shows the message with its one link. */
      await note402(`402 ${message ?? ''}`).catch(() => false)
    }
    if (isNotAnswering(response.status)) {
      throw new Error(
        `publik is not answering (error ${response.status}). Try again in a minute.`,
      )
    }
    throw new Error(message || `Transcription failed (${response.status}).`)
  }

  const result: TranscribeResponse = await response.json()
  return {
    text: result.text ?? '',
    avgLogprob: meanLogprob(result.segments),
  }
}

function meanLogprob(
  segments: VerboseSegment[] | undefined,
): number | undefined {
  if (!segments || segments.length === 0) return undefined
  let sum = 0
  let n = 0
  for (const s of segments) {
    if (typeof s.avg_logprob === 'number') {
      sum += s.avg_logprob
      n++
    }
  }
  return n === 0 ? undefined : sum / n
}
