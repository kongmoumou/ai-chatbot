import { search, OrganicResult } from 'google-sr';
// import { generateObject, streamObject } from 'ai';
import * as ai from 'ai';
import { deepseek } from '@ai-sdk/deepseek';
import { gateway } from '@ai-sdk/gateway';
import { z } from 'zod';
import dedent from 'dedent';

import { wrapAISDK } from 'langsmith/experimental/vercel';
import { traceable } from 'langsmith/traceable';
import { TransformStream } from 'node:stream/web';

const { generateObject, streamObject, streamText } = wrapAISDK(ai);

async function genSearchQuery(
  userQuery: string,
  prevQueries: string[]
): Promise<string> {
  const resp = await generateObject({
    model: gateway('openai/gpt-5-mini'),
    schema: z.object({
      query: z
        .string()
        .describe(
          "A concise google search query related to the user's request."
        ),
    }),
    prompt: dedent`
    Given the following query, generate a concise google search query that captures the main intent of the user's request. 
    The search query should be specific and relevant to the topic of interest. Don't duplicate previous queries. Answer in the format of JSON.

    Original user query: ${userQuery}
    Previous Queries: ${prevQueries.join(', ')}
    Example Output:
    {
      "query": "search keywords"
    }
  `,
  });

  return resp.object.query;
}

async function answerOrSearch(context: {
  knowledges: { url: string; title: string; content: string }[];
  userQuery: string;
}): Promise<'search' | 'answer'> {
  const resp = await generateObject({
    model: gateway('openai/gpt-5-mini'),
    schema: z.object({
      nextStep: z
        .enum(['answer', 'search'])
        .describe(
          'The next step to take, either answer the question using the provided knowledge or perform a further search.'
        ),
    }),
    prompt: dedent`
            Given the following context and user query, determine whether to answer the question using the provided knowledge or perform a further search.
            Context must be relevant and provide sufficient information to answer the query.
            Answer in the format of JSON.

            Context: ${JSON.stringify(context)}
            User Query: ${context.userQuery}
            Example Output:
            {
              "nextStep": "search"
            }
        `,
  });

  return resp.object.nextStep;
}

const citationSchema = z.object({
  number: z.string(),
  title: z.string(),
  url: z.string(),
  description: z.string().optional(),
  quote: z.string().optional(),
});
const citationsSchema = z.array(citationSchema);

export type Citation = z.infer<typeof citationSchema>;
export type PartialCitation = Partial<Citation> | undefined;
export type Citations = PartialCitation[];

const answerSchema = z.object({
  content: z
    .string()
    .describe(
      'The main content of the answer. Must use markdown for better formatting'
    ),
  citations: citationsSchema,
});
async function answerWithContext(context: {
  knowledges: { url: string; title: string; content: string }[];
  userQuery: string;
}) {
  const resp = await streamObject({
    model: gateway('openai/gpt-5-mini'),
    schema: answerSchema,
    prompt: dedent`Generate a well-researched answer in markdown about ${
      context.userQuery
    } with proper citations.
    Answer in the format of JSON.
    <context>
    ${JSON.stringify(context)}
    </context>

    Include:
    - A short but concise answer with inline citations marked as [1](http://citation/1), [2](http://citation/2), etc.
    - 2-3 citations with realistic source information
    - Each citation should have a title, URL, and optional description/quote
    - Make the content informative and the sources credible
    
    Format citations as numbered references within the text.`,
  });

  return resp.partialObjectStream;
}

type AgentData =
  | {
      type: 'searching';
      query: string;
    }
  | {
      type: 'reading';
      url: string;
    }
  | {
      type: 'answer';
      content: string;
    }
  | {
      type: 'citations';
      citations?: PartialCitation[];
    };

export const googleSearch = traceable(async function* googleSearch(
  query: string
): AsyncGenerator<AgentData, void, unknown> {
  const context = {
    userQuery: query,
    searchQueries: [] as string[],
    knowledges: [] as { url: string; title: string; content: string }[],
  };
  while (true) {
    const searchQuery = await genSearchQuery(
      context.userQuery,
      context.searchQueries
    );
    context.searchQueries.push(searchQuery);
    console.log('Searching with query:', searchQuery);
    yield {
      type: 'searching',
      query: searchQuery,
    };
    const results = await search({
      query: searchQuery,
      parsers: [OrganicResult],
      noPartialResults: true,
    });
    console.log('Search results:', results.slice(0, 3));
    for (const result of results.slice(0, 2)) {
      yield {
        type: 'reading',
        url: result.link,
      };
      const content = await webReader(result.link);
      context.knowledges.push({
        url: result.link,
        title: result.title,
        content,
      });
      console.log(
        'Knowledge added:',
        context.knowledges[context.knowledges.length - 1]
      );
      const nextStep = await answerOrSearch(context);
      if (nextStep === 'answer') {
        console.log('Answering with context');
        const partialObjectStream = await answerWithContext(context);
        for await (const data of partialObjectStream) {
          if (data.content) {
            yield {
              type: 'answer',
              content: data.content,
            };
          }
          if (data.citations) {
            yield {
              type: 'citations',
              citations: data.citations,
            };
          }
        }
        return;
      }
    }
  }
});

async function webReader(url: string): Promise<string> {
  const resp = await fetch(`https://r.jina.ai/${url}`, {
    headers: {
      Authorization: `Bearer ${process.env.JINA_API_KEY}`,
      'X-Md-Link-Style': 'discarded',
      'X-Remove-Selector': 'header, footer, nav',
      'X-Retain-Images': 'none',
    },
  });
  return resp.text();
}

export const googleSearchAgent = traceable(async function* googleSearchAgent(
  query: string
): AsyncGenerator<AgentData, void, unknown> {
  const { readable, writable } = new TransformStream<AgentData, AgentData>();
  const writer = writable.getWriter();
  const resp = streamText({
    // model: gateway('openai/gpt-5-mini'),
    model: deepseek('deepseek-chat'),
    system: dedent`You are a search agent that assists users by searching the web.
    JSON
    1. When given a user query, you must first perform a google search to find relevant information.
    2. Then you can pick the most relevant result to read and extract information from it.
    3. You should decide whether to answer the user with the information gathered or perform another search.

    Output Format:
    - A short but concise answer with inline citations marked as [1](http://citation/1), [2](http://citation/2), etc.
    - 2-3 citations with realistic source information
    - Each citation should have a title, URL, and optional description/quote
    - Make the content informative and the sources credible
    
    Format citations as numbered references within the text.
    `,
    prompt: dedent`User query: ${query}`,
    tools: {
      'google-search': ai.tool({
        description:
          "Useful for when you need to answer questions using the latest knowledge. Input should be google search query based on the user's question.",
        inputSchema: z.object({
          query: z
            .string()
            .describe('The generated query passed to the search tool.'),
        }),
        execute: async ({ query: userQuery }) => {
          writer.write({
            type: 'searching',
            query: userQuery,
          });
          const results = await search({
            query: userQuery,
            parsers: [OrganicResult],
            noPartialResults: true,
          });
          return results.slice(0, 3).map((r) => ({
            url: r.link,
            title: r.title,
            description: r.description,
          }));
        },
      }),
      'web-reader': ai.tool({
        description: 'Useful for when you need to read web pages.',
        inputSchema: z.object({
          url: z.string().describe('The URL of the web page to read.'),
        }),
        execute: async ({ url }) => {
          writer.write({
            type: 'reading',
            url,
          });
          const content = await webReader(url);
          return content;
        },
      }),
    },
    stopWhen: ai.stepCountIs(10),
    experimental_output: ai.Output.object({
      schema: answerSchema,
    }),
  });

  async function process() {
    for await (const data of resp.experimental_partialOutputStream) {
      if (data.content) {
        writer.write({
          type: 'answer',
          content: data.content,
        });
      }
      if (data.citations) {
        writer.write({
          type: 'citations',
          citations: data.citations,
        });
      }
    }
  }
  process();
  resp.consumeStream().finally(() => {
    writer.close();
  });

  yield* readable;
});

// async function main() {
//   const query = 'how vue fetch remote data';
//   const result = await googleSearch(query);
//   console.log('Final result:', result);
// }
// main();
