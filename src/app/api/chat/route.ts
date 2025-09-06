import * as ai from 'ai';
import type { UIMessage } from 'ai';
import { type OpenAIResponsesProviderOptions } from '@ai-sdk/openai';
import { gateway } from '@ai-sdk/gateway';
import { SearchState, UIMessagePro } from '@/lib/types';
import z from 'zod';
import { googleSearch as googleSearchAgent, googleSearchAgent as agent } from '@/lib/agent';
import dedent from 'dedent';
import { wrapAISDK } from 'langsmith/experimental/vercel';

const { streamText } = wrapAISDK(ai);

const {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
  tool,
} = ai;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function POST(req: Request) {
  const { messages, model }: { messages: UIMessage[]; model: string } =
    await req.json();

  const stream = createUIMessageStream<UIMessagePro>({
    execute: async ({ writer }) => {
      const citationsId = generateId();
      const searchStateId = generateId();
      const searchState: SearchState[] = [];

      function updateSearchState(state: SearchState) {
        searchState.push(state);
        writer.write({
          type: 'data-search-state',
          id: searchStateId,
          data: searchState,
        });
      }

      function answerStream(writer: ai.UIMessageStreamWriter<UIMessagePro>) {
        const answerId = generateId();
        let preAnswer: string | undefined = undefined;

        return {
          update: (content: string) => {
            if (!preAnswer) {
              writer.write({
                type: 'text-start',
                id: answerId,
              });
            }
            if (preAnswer !== content) {
              preAnswer ??= content;
              writer.write({
                type: 'text-delta',
                id: answerId,
                delta: content.slice(preAnswer.length),
              });
              preAnswer = content;
            }
          },
          done: () => {
            writer.write({
              type: 'text-end',
              id: answerId,
            });
          },
        };
      }

      let query: string | undefined = undefined;

      const result = streamText({
        model: gateway(model),
        messages: convertToModelMessages(messages),
        system: dedent`
          You are a helpful assistant that can answer questions and help with tasks.
          IMPORTANT: If the user asks about a specific topic, you should use the search tool to find relevant information.`,
        toolChoice: 'auto',
        tools: {
          'search-agent': tool({
            description:
              "Useful for when you need to answer questions using the latest knowledge. Input should be user's query.",
            inputSchema: z.object({
              query: z
                .string()
                .describe('The user query passed to the search tool.'),
            }),
            execute: async ({ query: userQuery }) => {
              query = userQuery;
            },
          }),
        },
        providerOptions: {
          openai: {
            reasoningSummary: 'auto',
          } satisfies OpenAIResponsesProviderOptions,
        },
      });

      writer.merge(result.toUIMessageStream());

      await result.consumeStream();

      if (query) {
        // const results = await googleSearchAgent(query);
        const results = await agent(query);
        const answer = answerStream(writer);
        for await (const data of results) {
          switch (data.type) {
            case 'answer':
              // writer.write({
              //   type: 'data-search-answer',
              //   id: answerId,
              //   data: {
              //     content: data.content,
              //   },
              // });
              answer.update(data.content);
              break;
            case 'citations':
              writer.write({
                type: 'data-search-citation',
                id: citationsId,
                data: {
                  citations: data.citations,
                },
              });
              break;
            case 'reading':
            case 'searching':
              updateSearchState(data);
              break;
            default:
              break;
          }
        }
        answer.done();
      }
    },
  });

  return createUIMessageStreamResponse({
    stream,
  });
}
