# 工具注册指南

## 1. 在 handleTools.js 中注册工具

在 `api/app/clients/tools/util/handleTools.js` 文件中，找到 `toolConstructors` 对象，添加新工具：

```javascript
const {
  IntentClassificationTool,
  RAGRetrievalTool,
  RerankerTool,
  SQLValidationTool,
  ResultAnalysisTool,
} = require('~/BeCauseSkills');

const toolConstructors = {
  // ... 现有工具
  flux: FluxAPI,
  calculator: Calculator,
  // ...
  sql_executor: SqlExecutor,
  
  // 新增的 BeCauseSkills 工具
  intent_classification: IntentClassificationTool,
  rag_retrieval: RAGRetrievalTool,
  reranker: RerankerTool,
  sql_validation: SQLValidationTool,
  result_analysis: ResultAnalysisTool,
  
  // 保留原有工具（可选，逐步迁移）
  because: BeCause,
};
```

## 2. 工具实例化时的上下文传递

工具类在实例化时可以通过 `fields` 参数接收配置。如果需要传递 `userId` 或 `req` 对象，需要在 `loadTools` 函数中处理。

### 方式1：通过构造函数参数传递（推荐）

修改工具类构造函数，支持接收 `userId` 和 `req`：

```javascript
constructor(fields = {}) {
  super();
  this.userId = fields.userId || 'system';
  this.req = fields.req;
  this.ragApiUrl = fields.ragApiUrl || process.env.RAG_API_URL || 'http://localhost:3001';
}
```

然后在 `loadTools` 函数中实例化工具时传递：

```javascript
// 在 loadTools 函数中
const toolInstance = new ToolClass({
  userId: user,
  req: options.req,
  // 其他配置
});
```

### 方式2：通过环境变量或全局配置

如果工具不需要每个用户独立的配置，可以使用环境变量：

```javascript
constructor(fields = {}) {
  super();
  this.ragApiUrl = fields.ragApiUrl || process.env.RAG_API_URL || 'http://localhost:3001';
}
```

## 3. userId 在工具调用时的获取

如果工具需要在调用时获取 `userId`，有几种方式：

### 方式1：从 config 中获取（LangChain 标准方式）

LangChain 的 Tool 在调用时会传递 `config` 参数，可以包含用户信息：

```javascript
async _call(input, config) {
  const userId = config?.userId || config?.user || 'system';
  // 使用 userId
}
```

### 方式2：从实例属性获取

如果 userId 在实例化时已设置：

```javascript
async _call(input) {
  const userId = this.userId || 'system';
  // 使用 userId
}
```

### 方式3：从输入参数获取（不推荐）

如果每次调用都传递 userId：

```javascript
schema = z.object({
  query: z.string(),
  user_id: z.string().optional(), // 不推荐，应该从上下文获取
});
```

## 4. RAG API 调用的认证

RAG API 调用需要认证，有几种方式：

### 方式1：使用 JWT Token（推荐）

```javascript
const { generateShortLivedToken } = require('@because/api');

async retrieveRAGKnowledge(query, userId) {
  const jwtToken = generateShortLivedToken(userId);
  const response = await axios.post(
    `${this.ragApiUrl}/api/rag/query`,
    { query, options: { ... } },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwtToken}`,
      },
    }
  );
  return response.data;
}
```

### 方式2：使用 userId 直接传递（如果API支持）

```javascript
const response = await axios.post(
  `${this.ragApiUrl}/api/rag/query`,
  {
    query,
    userId, // 如果API支持在body中传递userId
    options: { ... }
  }
);
```

## 5. 完整的工具注册示例

### 修改 handleTools.js

```javascript
// 在文件顶部添加导入
const {
  IntentClassificationTool,
  RAGRetrievalTool,
  RerankerTool,
  SQLValidationTool,
  ResultAnalysisTool,
} = require('~/BeCauseSkills');

// 在 loadTools 函数中
const loadTools = async ({
  user,
  agent,
  // ... 其他参数
  options = {},
}) => {
  const toolConstructors = {
    // ... 现有工具
    intent_classification: IntentClassificationTool,
    rag_retrieval: RAGRetrievalTool,
    reranker: RerankerTool,
    sql_validation: SQLValidationTool,
    result_analysis: ResultAnalysisTool,
  };

  // 实例化工具时传递 userId
  const loadedTools = [];
  for (const toolName of tools) {
    const ToolClass = toolConstructors[toolName];
    if (!ToolClass) continue;

    const toolInstance = new ToolClass({
      userId: user,
      req: options.req,
      // 其他配置
    });

    loadedTools.push(toolInstance);
  }

  return { loadedTools };
};
```

## 6. Agent 配置示例

在 Agent 配置中添加新工具：

```json
{
  "name": "智能问数Agent",
  "tools": [
    "intent_classification",
    "rag_retrieval",
    "reranker",
    "sql_validation",
    "sql_executor",
    "result_analysis"
  ]
}
```

## 7. 迁移步骤

1. **第一步**：注册新工具，保留原有 `because` 工具
2. **第二步**：在新 Agent 中测试新工具
3. **第三步**：逐步迁移现有 Agent 到新工具
4. **第四步**：确认新工具稳定后，考虑废弃 `because` 工具

## 8. 注意事项

1. **向后兼容**：保留原有 `because` 工具，确保现有功能不受影响
2. **测试充分**：每个工具都要充分测试，特别是 RAG 调用和认证
3. **错误处理**：确保工具调用失败时有清晰的错误信息
4. **性能考虑**：RAG 调用可能有延迟，考虑添加超时和重试机制

