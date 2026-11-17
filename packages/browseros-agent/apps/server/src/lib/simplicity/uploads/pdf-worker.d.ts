/* pdfjs-dist ships no types for its worker entry; pdf-text.ts only needs the
   handler that pdfjs looks up on globalThis.pdfjsWorker. */
declare module 'pdfjs-dist/legacy/build/pdf.worker.mjs' {
  export const WorkerMessageHandler: unknown
}
