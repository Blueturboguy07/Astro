/**
 * The embedding model sent with an upload. Without one (a publik-only
 * setup has none) the fields go empty and the server finds the relevant
 * parts of the file by its words instead. The upload used to stop with
 * "Please select an embedding model before uploading." and no screen
 * offered one (Astro 0.2.4 QA, F-068).
 */
export function appendEmbeddingModel(
  data: FormData,
  storage: Pick<Storage, 'getItem'> = localStorage,
): void {
  data.append(
    'embedding_model_provider_id',
    storage.getItem('embeddingModelProviderId') ?? '',
  )
  data.append('embedding_model_key', storage.getItem('embeddingModelKey') ?? '')
}
