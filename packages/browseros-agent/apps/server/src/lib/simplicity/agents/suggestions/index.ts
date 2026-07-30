import formatChatHistoryAsString from '../../utils/formatHistory';
import { suggestionGeneratorPrompt } from '../../prompts/suggestions';
import { ChatTurnMessage } from '../../types';
import z from 'zod/v4';
import BaseLLM from '../../models/base/llm';

type SuggestionGeneratorInput = {
  chatHistory: ChatTurnMessage[];
};

const schema = z.object({
  suggestions: z
    .array(z.string())
    .describe('List of suggested questions or prompts'),
});

const generateSuggestions = async (
  input: SuggestionGeneratorInput,
  llm: BaseLLM<any>,
) => {
  const res = await llm.generateObject<typeof schema>({
    messages: [
      {
        role: 'system',
        content: suggestionGeneratorPrompt,
      },
      {
        role: 'user',
        content: `<chat_history>\n${formatChatHistoryAsString(input.chatHistory)}\n</chat_history>`,
      },
    ],
    schema,
  });

  return res.suggestions;
};

export default generateSuggestions;
