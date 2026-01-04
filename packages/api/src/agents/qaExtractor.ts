/** QA Pair Extractor Agent */
import { z } from 'zod';
import { tool } from '@langchain/core/tools';
import { Tools } from '@because/data-provider';
import { logger } from '@because/data-schemas';
import { Run, Providers, GraphEvents } from '@because/agents';
import type {
  OpenAIClientOptions,
  StreamEventData,
  ToolEndCallback,
  ClientOptions,
  EventHandler,
  ToolEndData,
  LLMConfig,
} from '@because/agents';
import type { TAttachment } from '@because/data-provider';
import type { ObjectId } from '@because/data-schemas';
import type { BaseMessage } from '@langchain/core/messages';
import type { Response as ServerResponse } from 'express';

type QAExtractorMethods = {
  addQAPair: (params: {
    userId: string | ObjectId;
    question: string;
    answer: string;
    entityId?: string;
  }) => Promise<{ _id: string }>;
};

type ToolEndMetadata = Record<string, unknown> & {
  run_id?: string;
  thread_id?: string;
};

export interface QAExtractorConfig {
  instructions?: string;
  llmConfig?: Partial<LLMConfig>;
  entityId?: string; // 数据源ID，用于关联知识库
  minQuestionLength?: number;
  minAnswerLength?: number;
}

const getDefaultInstructions = () => `你是一个智能QA对提取助手。分析对话内容，自动识别并提取有价值的问答对（QA对）。

## 提取规则：

1. **识别有价值的问答对**：
   - 用户提出了明确的问题（包含疑问词：什么、如何、怎么、为什么、能否、是否等，或包含问号）
   - AI提供了有意义的回答（不是"抱歉"、"我不确定"等无法回答的情况）
   - 问题和答案都有实际价值，不是临时性的闲聊

2. **提取标准**：
   - 问题应该清晰、完整，能够独立理解
   - 答案应该准确、有用，包含实际信息
   - 避免提取：
     * 过于简单或模糊的问题（如"你好"、"谢谢"）
     * 无法回答的问题（如"我不知道"）
     * 临时性的对话（如"再见"、"下次聊"）
     * 重复的问题（如果知识库中已有相似问题）

3. **使用工具**：
   - 使用 \`add_qa_pair\` 工具存储提取的QA对
   - 每个有价值的问答对都应该被提取
   - 如果对话中没有有价值的QA对，不要调用工具，直接结束

4. **注意事项**：
   - 只提取真正有价值的QA对
   - 确保问题和答案的准确性
   - 避免重复提取已存在的QA对

## 示例：

**应该提取**：
- 用户："如何查询订单数据？"
- AI："可以使用SELECT语句从orders表中查询订单数据..."
- ✅ 这是一个有价值的QA对，应该提取

**不应该提取**：
- 用户："你好"
- AI："你好，有什么可以帮助你的吗？"
- ❌ 这是临时性对话，不应该提取

- 用户："订单查询"
- AI："抱歉，我不太确定你的问题"
- ❌ AI无法回答，不应该提取`;

/**
 * Creates a QA pair tool instance
 */
export const createQAPairTool = ({
  userId,
  addQAPair,
  entityId,
}: {
  userId: string | ObjectId;
  addQAPair: QAExtractorMethods['addQAPair'];
  entityId?: string;
}) => {
  return tool(
    async ({ question, answer }) => {
      try {
        if (!question || question.trim().length < 5) {
          return [
            `问题太短或为空，最小长度为5个字符`,
            undefined,
          ];
        }

        if (!answer || answer.trim().length < 10) {
          return [
            `答案太短或为空，最小长度为10个字符`,
            undefined,
          ];
        }

        const result = await addQAPair({
          userId,
          question: question.trim(),
          answer: answer.trim(),
          entityId,
        });

        logger.debug(`QA Pair extracted and stored: ${question.substring(0, 50)}...`);

        const artifact: Record<string, unknown> = {
          type: 'qa_pair',
          question: question.trim(),
          answer: answer.trim(),
          entryId: result._id,
        };

        return [
          `QA对已成功提取并存储到知识库${entityId ? `（数据源: ${entityId}）` : ''}`,
          artifact,
        ];
      } catch (error) {
        logger.error('QA Extractor Agent failed to add QA pair', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return [`提取QA对失败: ${errorMessage}`, undefined];
      }
    },
    {
      name: 'add_qa_pair',
      description:
        '从对话中提取有价值的问答对（QA对）并存储到知识库。只有当对话包含明确的问题和有意义的答案时才使用此工具。',
      responseFormat: 'content_and_artifact',
      schema: z.object({
        question: z
          .string()
          .min(5, '问题至少需要5个字符')
          .describe('用户提出的问题，应该清晰、完整，能够独立理解'),
        answer: z
          .string()
          .min(10, '答案至少需要10个字符')
          .describe('AI提供的答案，应该准确、有用，包含实际信息'),
      }),
    },
  );
};

export class BasicToolEndHandler implements EventHandler {
  private callback?: ToolEndCallback;

  constructor(callback?: ToolEndCallback) {
    this.callback = callback;
  }

  handle(
    event: string,
    data: StreamEventData | undefined,
    metadata?: Record<string, unknown>,
  ): void {
    if (event !== GraphEvents.TOOL_END || !data) {
      return;
    }

    const toolEndData = data as ToolEndData;
    this.callback?.(toolEndData, metadata);
  }
}

function createQACallback({
  res,
  artifactPromises,
}: {
  res: ServerResponse;
  artifactPromises: Promise<TAttachment | null>[];
}): ToolEndCallback {
  return async (data: ToolEndData, metadata?: ToolEndMetadata) => {
    try {
      if (data.name === 'add_qa_pair' && data.content) {
        const artifact: TAttachment = {
          type: 'qa_extractor',
          data: {
            question: data.content.question || '',
            answer: data.content.answer || '',
            entryId: data.content.entryId || '',
          },
        };

        artifactPromises.push(Promise.resolve(artifact));
        logger.debug('QA Extractor artifact created', artifact);
      }
    } catch (error) {
      logger.error('QA Extractor callback error', error);
      artifactPromises.push(Promise.resolve(null));
    }
  };
}

export async function processQAExtraction({
  res,
  userId,
  addQAPair,
  messages,
  messageId,
  conversationId,
  instructions,
  llmConfig,
  entityId,
  minQuestionLength = 5,
  minAnswerLength = 10,
}: {
  res: ServerResponse;
  addQAPair: QAExtractorMethods['addQAPair'];
  userId: string | ObjectId;
  messages: BaseMessage[];
  messageId: string;
  conversationId: string;
  instructions: string;
  llmConfig?: Partial<LLMConfig>;
  entityId?: string;
  minQuestionLength?: number;
  minAnswerLength?: number;
}): Promise<(TAttachment | null)[] | undefined> {
  try {
    const qaPairTool = createQAPairTool({
      userId,
      addQAPair,
      entityId,
    });

    const defaultLLMConfig: LLMConfig = {
      provider: Providers.OPENAI,
      model: 'gpt-4.1-mini',
      temperature: 0.2, // 较低温度，确保提取准确性
      streaming: false,
      disableStreaming: true,
    };

    const finalLLMConfig: ClientOptions = {
      ...defaultLLMConfig,
      ...llmConfig,
      /**
       * Ensure streaming is always disabled for QA extraction
       */
      streaming: false,
      disableStreaming: true,
    };

    // Handle GPT-5+ models
    if (
      'model' in finalLLMConfig &&
      /\bgpt-[5-9](?:\.\d+)?\b/i.test(finalLLMConfig.model ?? '')
    ) {
      // Remove temperature for GPT-5+ models
      delete finalLLMConfig.temperature;

      // Move maxTokens to modelKwargs for GPT-5+ models
      if ('maxTokens' in finalLLMConfig && finalLLMConfig.maxTokens != null) {
        const modelKwargs = (finalLLMConfig as OpenAIClientOptions).modelKwargs ?? {};
        const paramName =
          (finalLLMConfig as OpenAIClientOptions).useResponsesApi === true
            ? 'max_output_tokens'
            : 'max_completion_tokens';
        modelKwargs[paramName] = finalLLMConfig.maxTokens;
        delete finalLLMConfig.maxTokens;
        (finalLLMConfig as OpenAIClientOptions).modelKwargs = modelKwargs;
      }
    }

    const artifactPromises: Promise<TAttachment | null>[] = [];
    const qaCallback = createQACallback({ res, artifactPromises });
    const customHandlers = {
      [GraphEvents.TOOL_END]: new BasicToolEndHandler(qaCallback),
    };

    const run = await Run.create({
      runId: messageId,
      graphConfig: {
        type: 'standard',
        llmConfig: finalLLMConfig,
        tools: [qaPairTool],
        instructions,
        toolEnd: true,
      },
      customHandlers,
      returnContent: true,
    });

    const config = {
      runName: 'QAExtractorRun',
      configurable: {
        user_id: userId,
        thread_id: conversationId,
        provider: llmConfig?.provider,
      },
      streamMode: 'values',
      recursionLimit: 3,
      version: 'v2',
    } as const;

    const inputs = {
      messages,
    };
    const content = await run.processStream(inputs, config);
    if (content) {
      logger.debug('QA Extractor Agent processed QA extraction successfully', content);
    } else {
      logger.debug('QA Extractor Agent processed but found no QA pairs to extract');
    }
    return await Promise.all(artifactPromises);
  } catch (error) {
    logger.error('QA Extractor Agent failed to process QA extraction', error);
    return undefined;
  }
}

export async function createQAExtractorProcessor({
  res,
  userId,
  messageId,
  qaExtractorMethods,
  conversationId,
  config = {},
}: {
  res: ServerResponse;
  messageId: string;
  conversationId: string;
  userId: string | ObjectId;
  qaExtractorMethods: QAExtractorMethods;
  config?: QAExtractorConfig;
}): Promise<(messages: BaseMessage[]) => Promise<(TAttachment | null)[] | undefined>> {
  const { instructions, llmConfig, entityId, minQuestionLength, minAnswerLength } = config;
  const finalInstructions = instructions || getDefaultInstructions();

  return async function (
    messages: BaseMessage[],
  ): Promise<(TAttachment | null)[] | undefined> {
    try {
      return await processQAExtraction({
        res,
        userId,
        messages,
        llmConfig,
        messageId,
        conversationId,
        entityId,
        instructions: finalInstructions,
        addQAPair: qaExtractorMethods.addQAPair,
        minQuestionLength,
        minAnswerLength,
      });
    } catch (error) {
      logger.error('QA Extractor Agent failed to process QA extraction', error);
    }
  };
}

