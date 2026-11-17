import NullEmbedding from '../../../../lib/simplicity/models/base/null-embedding';
import ModelRegistry from '../../../../lib/simplicity/models/registry';
import UploadManager from '../../../../lib/simplicity/uploads/manager';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();

    const files = formData.getAll('files') as File[];
    const embeddingModel = String(formData.get('embedding_model_key') ?? '');
    const embeddingModelProvider = String(
      formData.get('embedding_model_provider_id') ?? '',
    );

    if (files.length === 0) {
      return Response.json({ message: 'No file was sent.' }, { status: 400 });
    }

    const registry = new ModelRegistry();

    /* No embedding model (publik only): NullEmbedding, and the answer finds
       the relevant parts of the file by its words (F-068). */
    const model = embeddingModelProvider && embeddingModel
      ? await registry.loadEmbeddingModel(embeddingModelProvider, embeddingModel)
      : new NullEmbedding();
    
    const uploadManager = new UploadManager({
      embeddingModel: model,
    })

    const processedFiles = await uploadManager.processFiles(files);

    return Response.json({
      files: processedFiles,
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    return Response.json(
      /* The reason, not "An error has occurred.": the composer shows this
         text (F-042). */
      {
        message:
          error instanceof Error && error.message
            ? error.message
            : 'An error has occurred.',
      },
      { status: 500 },
    );
  }
}
