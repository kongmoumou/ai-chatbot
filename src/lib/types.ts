import { UIMessage } from 'ai';
import { Citations } from './agent';

export type SearchState =
  | {
      type: 'searching';
      query: string;
    }
  | {
      type: 'reading';
      url: string;
    }

export type UIMessagePro = UIMessage<
  never,
  {
    'search-state': SearchState[];
    'search-answer': {
      content: string;
    };
    'search-citation': {
      citations?: Citations;
    };
  }
>;
