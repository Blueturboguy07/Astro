import z from 'zod/v4';
import { ClassifierInput } from './types';
import { classifierPrompt } from '../../prompts/search/classifier';
import formatChatHistoryAsString from '../../utils/formatHistory';
import { generateObjectWithRetry } from '../../utils/generateObjectWithRetry';

const schema = z.object({
  classification: z.object({
    skipSearch: z
      .boolean()
      .describe('Indicates whether to skip the search step.'),
    personalSearch: z
      .boolean()
      .describe('Indicates whether to perform a personal search.'),
    academicSearch: z
      .boolean()
      .describe('Indicates whether to perform an academic search.'),
    discussionSearch: z
      .boolean()
      .describe('Indicates whether to perform a discussion search.'),
    showWeatherWidget: z
      .boolean()
      .describe('Indicates whether to show the weather widget.'),
    showStockWidget: z
      .boolean()
      .describe('Indicates whether to show the stock widget.'),
    showCalculationWidget: z
      .boolean()
      .describe('Indicates whether to show the calculation widget.'),
  }),
  standaloneFollowUp: z
    .string()
    .describe(
      "A self-contained, context-independent reformulation of the user's question.",
    ),
});

export const classify = async (input: ClassifierInput) => {
  try {
    return await generateObjectWithRetry<typeof schema>(input.llm, {
      messages: [
        {
          role: 'system',
          content: classifierPrompt,
        },
        {
          role: 'user',
          content: `<conversation_history>\n${formatChatHistoryAsString(input.chatHistory)}\n</conversation_history>\n<user_query>\n${input.query}\n</user_query>`,
        },
      ],
      schema,
    });
  } catch (err) {
    /* Classification failing must never kill the turn — fall back to the
       search-everything default with the raw query as the standalone form. */
    console.error('Classifier failed, defaulting to plain web search:', err);
    return {
      classification: {
        skipSearch: false,
        personalSearch: false,
        academicSearch: false,
        discussionSearch: false,
        showWeatherWidget: false,
        showStockWidget: false,
        showCalculationWidget: false,
      },
      standaloneFollowUp: input.query,
    };
  }
};
