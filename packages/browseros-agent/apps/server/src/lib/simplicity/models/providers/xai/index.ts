import { UIConfigField } from '../../../config/types';
import { getConfiguredModelProviderById } from '../../../config/serverRegistry';
import { Model, ModelList, ProviderMetadata } from '../../types';
import BaseEmbedding from '../../base/embedding';
import BaseModelProvider from '../../base/provider';
import BaseLLM from '../../base/llm';
import XAILLM from './xaiLLM';

interface XAIConfig {
  apiKey: string;
}

const providerConfigFields: UIConfigField[] = [
  {
    type: 'password',
    name: 'API Key',
    key: 'apiKey',
    description: 'Your xAI API key',
    required: true,
    placeholder: 'xAI API Key',
    env: 'XAI_API_KEY',
    scope: 'server',
  },
];

/* xAI's API is OpenAI-compatible, so the whole provider is Groq's shape
   pointed at api.x.ai — it exists so Grok can hold a row in the model
   catalog. */
class XAIProvider extends BaseModelProvider<XAIConfig> {
  constructor(id: string, name: string, config: XAIConfig) {
    super(id, name, config);
  }

  async getDefaultModels(): Promise<ModelList> {
    const res = await fetch(`https://api.x.ai/v1/models`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
    });

    if (!res.ok) {
      throw new Error(`xAI API error: ${res.statusText}`);
    }

    const data = await res.json();

    const defaultChatModels: Model[] = [];

    data.data.forEach((m: any) => {
      defaultChatModels.push({
        key: m.id,
        name: m.id,
      });
    });

    return {
      embedding: [],
      chat: defaultChatModels,
    };
  }

  async getModelList(): Promise<ModelList> {
    const defaultModels = await this.getDefaultModels();
    const configProvider = getConfiguredModelProviderById(this.id)!;

    return {
      embedding: [
        ...defaultModels.embedding,
        ...configProvider.embeddingModels,
      ],
      chat: [...defaultModels.chat, ...configProvider.chatModels],
    };
  }

  async loadChatModel(key: string): Promise<BaseLLM<any>> {
    const modelList = await this.getModelList();

    const exists = modelList.chat.find((m) => m.key === key);

    if (!exists) {
      throw new Error('Error Loading xAI Chat Model. Invalid Model Selected');
    }

    return new XAILLM({
      apiKey: this.config.apiKey,
      model: key,
      baseURL: 'https://api.x.ai/v1',
    });
  }

  async loadEmbeddingModel(key: string): Promise<BaseEmbedding<any>> {
    throw new Error('xAI Provider does not support embedding models.');
  }

  static override parseAndValidate(raw: any): XAIConfig {
    if (!raw || typeof raw !== 'object')
      throw new Error('Invalid config provided. Expected object');
    if (!raw.apiKey)
      throw new Error('Invalid config provided. API key must be provided');

    return {
      apiKey: String(raw.apiKey),
    };
  }

  static override getProviderConfigFields(): UIConfigField[] {
    return providerConfigFields;
  }

  static override getProviderMetadata(): ProviderMetadata {
    return {
      key: 'xai',
      name: 'xAI',
    };
  }
}

export default XAIProvider;
