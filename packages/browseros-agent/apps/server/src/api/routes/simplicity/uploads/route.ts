import ModelRegistry from '../../../../lib/simplicity/models/registry';
import UploadManager from '../../../../lib/simplicity/uploads/manager';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();

    const files = formData.getAll('files') as File[];
    const embeddingModel = formData.get('embedding_model_key') as string;
    const embeddingModelProvider = formData.get('embedding_model_provider_id') as string;

    if (!embeddingModel || !embeddingModelProvider) {
      return Response.json(
        { message: 'Missing embedding model or provider' },
        { status: 400 },
      );
    }

    const registry = new ModelRegistry();

    const model = await registry.loadEmbeddingModel(embeddingModelProvider, embeddingModel);
    
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
      { message: 'An error has occurred.' },
      { status: 500 },
    );
  }
}
