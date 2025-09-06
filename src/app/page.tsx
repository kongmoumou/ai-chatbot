'use client';

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/conversation';
import { Message, MessageContent } from '@/components/message';
import {
  PromptInput,
  PromptInputButton,
  PromptInputModelSelect,
  PromptInputModelSelectContent,
  PromptInputModelSelectItem,
  PromptInputModelSelectTrigger,
  PromptInputModelSelectValue,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
} from '@/components/prompt-input';
import { useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { Response } from '@/components/response';
import { GlobeIcon } from 'lucide-react';
import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from '@/components/sources';
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from '@/components/reasoning';
import { Loader } from '@/components/loader';
import { SearchState, UIMessagePro } from '@/lib/types';
import { cn } from '@/lib/utils';
import {
  InlineCitation,
  InlineCitationCard,
  InlineCitationCardBody,
  InlineCitationCardTrigger,
  InlineCitationCarousel,
  InlineCitationCarouselContent,
  InlineCitationCarouselHeader,
  InlineCitationCarouselIndex,
  InlineCitationCarouselItem,
  InlineCitationCarouselNext,
  InlineCitationCarouselPrev,
  InlineCitationQuote,
  InlineCitationSource,
} from '@/components/inline-citation';
import { Task, TaskContent, TaskItem, TaskTrigger } from '@/components/task';
import { InlineSkeleton as Skeleton } from '@/components/ui/skeleton';

const models = [
  {
    name: 'GPT 5 Mini',
    value: 'openai/gpt-5-mini',
  },
  {
    name: 'Deepseek R1',
    value: 'deepseek/deepseek-r1',
  },
];

const ChatBotDemo = () => {
  const [input, setInput] = useState('');
  const [model, setModel] = useState<string>(models[0].value);
  const { messages, sendMessage, status } = useChat<UIMessagePro>({});
  const latestMessageId = messages[messages.length - 1]?.id;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      sendMessage(
        { text: input },
        {
          body: {
            model: model,
          },
        }
      );
      setInput('');
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 relative size-full h-screen">
      <div className="flex flex-col h-full">
        <Conversation className="h-full">
          <ConversationContent>
            {messages.map((message) => {
              const usedSourcesCount = message.parts.filter(
                (part) => part.type === 'source-url'
              ).length;
              return (
                <div key={message.id}>
                  {message.role === 'assistant' && usedSourcesCount !== 0 && (
                    <Sources>
                      <SourcesTrigger
                        count={
                          message.parts.filter(
                            (part) => part.type === 'source-url'
                          ).length
                        }
                      />
                      {message.parts
                        .filter((part) => part.type === 'source-url')
                        .map((part, i) => (
                          <SourcesContent key={`${message.id}-${i}`}>
                            <Source
                              key={`${message.id}-${i}`}
                              href={part.url}
                              title={part.url}
                            />
                          </SourcesContent>
                        ))}
                    </Sources>
                  )}
                  <Message from={message.role} key={message.id}>
                    <MessageContent>
                      {message.parts.map((part, i) => {
                        const citations = message.parts.find(
                          (p) => p.type === 'data-search-citation'
                        )?.data?.citations;

                        switch (part.type) {
                          case 'data-search-state':
                            return (
                              <SearchStateComp
                                key={`${message.id}-${i}`}
                                state={part}
                                status={status}
                              />
                            );
                          case 'text':
                            return (
                              <Response
                                allowedLinkPrefixes={['*']}
                                key={`${message.id}-${i}-${citations?.map(
                                  (c) => c?.url
                                )}`}
                                components={{
                                  a: ({
                                    children,
                                    className,
                                    href,
                                    ...props
                                  }) => {
                                    if (href?.includes('citation')) {
                                      const citation = citations?.find(
                                        (c) => c?.number === children
                                      );
                                      if (URL.canParse(citation?.url ?? '')) {
                                        return (
                                          <SearchCitation
                                            key={children as string}
                                            citation={citation!}
                                          />
                                        );
                                      } else {
                                        return (
                                          <Skeleton className="bg-neutral-500 align-text-bottom inline-block w-8 h-4 px-2 py-0.5 rounded-full" />
                                        );
                                      }
                                    }

                                    return (
                                      <a
                                        className={cn(
                                          'font-medium text-primary underline',
                                          className
                                        )}
                                        data-citations={citations}
                                        data-streamdown="link"
                                        href={href}
                                        rel="noreferrer"
                                        target="_blank"
                                        {...props}
                                      >
                                        {children}
                                      </a>
                                    );
                                  },
                                }}
                              >
                                {part.text}
                              </Response>
                            );
                          case 'reasoning':
                            return (
                              <Reasoning
                                key={`${message.id}-${i}`}
                                className="w-full"
                                isStreaming={
                                  message.id === latestMessageId &&
                                  status === 'streaming'
                                }
                              >
                                <ReasoningTrigger />
                                <ReasoningContent>{part.text}</ReasoningContent>
                              </Reasoning>
                            );
                          default:
                            return null;
                        }
                      })}
                    </MessageContent>
                  </Message>
                </div>
              );
            })}
            {status === 'submitted' && <Loader />}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        <PromptInput onSubmit={handleSubmit} className="mt-4">
          <PromptInputTextarea
            onChange={(e) => setInput(e.target.value)}
            value={input}
          />
          <PromptInputToolbar>
            <PromptInputTools>
              <PromptInputModelSelect
                onValueChange={(value) => {
                  setModel(value);
                }}
                value={model}
              >
                <PromptInputModelSelectTrigger>
                  <PromptInputModelSelectValue />
                </PromptInputModelSelectTrigger>
                <PromptInputModelSelectContent>
                  {models.map((model) => (
                    <PromptInputModelSelectItem
                      key={model.value}
                      value={model.value}
                    >
                      {model.name}
                    </PromptInputModelSelectItem>
                  ))}
                </PromptInputModelSelectContent>
              </PromptInputModelSelect>
            </PromptInputTools>
            <PromptInputSubmit disabled={!input} status={status} />
          </PromptInputToolbar>
        </PromptInput>
      </div>
    </div>
  );
};

export default ChatBotDemo;

function SearchStateComp({
  state,
  status,
}: {
  state: { type: 'data-search-state'; id?: string; data: SearchState[] };
  status: string;
}) {
  return (
    <Task defaultOpen={state.data.length > 0}>
      <TaskTrigger
        title={
          status === 'streaming'
            ? 'Search Agent Working...'
            : 'Search Agent Done'
        }
      />
      <TaskContent>
        {state.data.map((item, itemIndex) => {
          switch (item.type) {
            case 'reading':
              return (
                <TaskItem key={itemIndex} className="flex gap-1">
                  Reading{' '}
                  <a
                    className="min-w-0 fit-content flex-shrink-1 underline underline-offset-2 text-ellipsis overflow-hidden whitespace-nowrap"
                    href={item.url}
                    target="_blank"
                    referrerPolicy="no-referrer"
                  >
                    {item.url}
                  </a>
                </TaskItem>
              );
            case 'searching':
              return (
                <TaskItem key={itemIndex}>
                  Searching{' '}
                  <span className="inline bg-background rounded-md px-1 py-1 text-xs break-words outline-none">
                    {item.query}
                  </span>
                </TaskItem>
              );
            default:
              item satisfies never;
              return null;
          }
        })}
      </TaskContent>
    </Task>
  );
}

function SearchCitation({
  citation,
}: {
  citation: Partial<{
    number: string;
    title: string;
    url: string;
    description?: string | undefined;
    quote?: string | undefined;
  }>;
}) {
  return (
    <InlineCitation>
      <InlineCitationCard>
        <InlineCitationCardTrigger sources={[citation.url ?? '']} />
        <InlineCitationCardBody>
          <InlineCitationCarousel>
            <InlineCitationCarouselHeader>
              <InlineCitationCarouselPrev />
              <InlineCitationCarouselNext />
              <InlineCitationCarouselIndex />
            </InlineCitationCarouselHeader>
            <InlineCitationCarouselContent>
              <InlineCitationCarouselItem>
                <InlineCitationSource
                  title={citation.title}
                  url={citation.url}
                  description={citation.description}
                />
                {citation.quote && (
                  <InlineCitationQuote>{citation.quote}</InlineCitationQuote>
                )}
              </InlineCitationCarouselItem>
            </InlineCitationCarouselContent>
          </InlineCitationCarousel>
        </InlineCitationCardBody>
      </InlineCitationCard>
    </InlineCitation>
  );
}
