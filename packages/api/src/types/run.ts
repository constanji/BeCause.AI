import type { Providers, ClientOptions } from '@because/agents';
import type { AgentModelParameters } from '@because/data-provider';
import type { OpenAIConfiguration } from './openai';

export type RunLLMConfig = {
  provider: Providers;
  streaming: boolean;
  streamUsage: boolean;
  usage?: boolean;
  configuration?: OpenAIConfiguration;
} & AgentModelParameters &
  ClientOptions;
