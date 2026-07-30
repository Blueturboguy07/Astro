import { UIConfigField } from '../../../config/types';
import { Model, ModelList, ProviderMetadata } from '../../types';
import BaseEmbedding from '../../base/embedding';
import BaseModelProvider from '../../base/provider';
import BaseLLM from '../../base/llm';
import ClaudeCodeLLM, { findClaudeBinary } from './claudeCodeLLM';

/* Claude through the user's own Claude Code install.
 *
 * The alternative to pasting an API key: if the user already has Claude Code
 * signed in, their subscription answers the query and there is no key to
 * manage, no billing to set up, and no credential for this app to store.
 * Authentication stays entirely inside Claude Code — we only invoke the binary.
 */

interface ClaudeCodeConfig {
  /* Path to the CLI. Blank means "find it", which is the normal case — the UI
     never asks for it, and it's only surfaced for unusual install locations. */
  binary: string;
}

const providerConfigFields: UIConfigField[] = [
  {
    type: 'string',
    name: 'Claude Code path',
    key: 'binary',
    description:
      'Leave blank to detect it automatically. Only set this if Claude Code is installed somewhere unusual.',
    required: false,
    placeholder: '/usr/local/bin/claude',
    scope: 'server',
  },
];

/* Aliases rather than pinned IDs: the CLI resolves these to whatever the
   current model is, so this list doesn't rot when a new Claude ships. */
const models: Model[] = [
  { key: 'opus', name: 'Claude Opus' },
  { key: 'sonnet', name: 'Claude Sonnet' },
  { key: 'haiku', name: 'Claude Haiku' },
];

class ClaudeCodeProvider extends BaseModelProvider<ClaudeCodeConfig> {
  constructor(id: string, name: string, config: ClaudeCodeConfig) {
    super(id, name, config);
  }

  private resolveBinary(): string {
    const bin = this.config.binary || findClaudeBinary();
    if (!bin) {
      throw new Error(
        'Claude Code was not found. Install it from claude.com/claude-code and sign in, then connect again.',
      );
    }
    return bin;
  }

  async getDefaultModels(): Promise<ModelList> {
    return { embedding: [], chat: models };
  }

  async getModelList(): Promise<ModelList> {
    return this.getDefaultModels();
  }

  async loadChatModel(key: string): Promise<BaseLLM<any>> {
    const exists = models.find((m) => m.key === key);
    if (!exists) {
      throw new Error(
        'Error Loading Claude Code Chat Model. Invalid Model Selected',
      );
    }

    return new ClaudeCodeLLM({ model: key, binary: this.resolveBinary() });
  }

  async loadEmbeddingModel(key: string): Promise<BaseEmbedding<any>> {
    throw new Error('Claude Code provider does not support embedding models.');
  }

  static override parseAndValidate(raw: any): ClaudeCodeConfig {
    if (raw && typeof raw !== 'object')
      throw new Error('Invalid config provided. Expected object');

    const binary = raw?.binary ? String(raw.binary) : '';

    /* Fail at connect time rather than at the first search — an empty model
       list with no explanation is a much worse way to find this out. */
    if (!binary && !findClaudeBinary()) {
      throw new Error(
        'Claude Code was not found on this computer. Install it from claude.com/claude-code and sign in, then try again.',
      );
    }

    return { binary };
  }

  static override getProviderConfigFields(): UIConfigField[] {
    return providerConfigFields;
  }

  static override getProviderMetadata(): ProviderMetadata {
    return {
      key: 'claudecode',
      name: 'Claude (your account)',
    };
  }
}

export default ClaudeCodeProvider;
