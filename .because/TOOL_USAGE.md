# BeCause 工具使用说明

**版本**：2.0.0  
**最后更新**：2025-01-27

## 概述

`BeCause` 是一个类似 `Speckit` 的工具，专门用于智能问数（自然语言转SQL）。它可被集成到工具系统中，可以通过智能体直接调用。

**重要更新（v2.0.0）**：工具已深度集成 RAG 知识检索服务。在执行命令前，系统会自动通过 RAG 服务检索相关的语义模型、QA对、同义词和业务知识。

## 工具命令

### 1. `/because.generate_sql` - 生成 SQL 查询

根据用户输入的自然语言查询生成 ANSI SQL 查询。

**使用方式**：
```
/because.generate_sql 查询每个国家的病例总数
```

**参数**：
- `arguments` (必需): 用户输入的自然语言查询
- `language` (可选): 输出语言

**注意**：
- `semantic_models` 参数已废弃，系统会自动通过 RAG 服务检索相关语义模型
- RAG 服务会自动检索语义模型、QA对、同义词、业务知识等
- 所有 RAG 检索结果会自动填充到提示词变量中（`rag_semantic_models`, `rag_qa_pairs`, `rag_synonyms`, `rag_business_knowledge`）

**示例**：
```json
{
  "command": "generate_sql",
  "arguments": "查询每个国家的病例总数",
  "semantic_models": [...],
  "language": "简体中文"
}
```

### 2. `/because.classify_intent` - 分类查询意图

分类用户查询意图（TEXT_TO_SQL / GENERAL / MISLEADING_QUERY）。

**使用方式**：
```
/because.classify_intent 查询每个国家的病例总数
```

**参数**：
- `arguments` (必需): 用户查询问题
- `histories` (可选): 查询历史
- `language` (可选): 输出语言

**注意**：
- `semantic_models` 参数已废弃，系统会自动通过 RAG 服务检索
- RAG 服务会自动检索语义模型、QA对、业务知识用于意图判断

### 3. `/because.assist_data` - 数据辅助

回答关于数据库模式的一般问题。

**使用方式**：
```
/because.assist_data 这个数据集是关于什么的？
```

**参数**：
- `arguments` (必需): 用户问题
- `language` (可选): 输出语言

**注意**：
- `semantic_models` 参数已废弃，系统会自动通过 RAG 服务检索
- RAG 服务会自动检索语义模型、QA对（可参考类似问题的答案）、业务知识

### 4. `/because.handle_misleading` - 处理误导查询

处理误导性查询并提供建议。

**使用方式**：
```
/because.handle_misleading 你好吗？
```

**参数**：
- `arguments` (必需): 用户查询问题
- `language` (可选): 输出语言

**注意**：
- `semantic_models` 参数已废弃，系统会自动通过 RAG 服务检索

### 5. `/because.generate_reasoning` - 生成推理计划

生成 SQL 生成前的推理计划。

**使用方式**：
```
/because.generate_reasoning 查询每个国家的病例总数
```

**参数**：
- `arguments` (必需): 用户查询问题
- `language` (可选): 输出语言

**注意**：
- `semantic_models` 参数已废弃，系统会自动通过 RAG 服务检索

## 工具工作原理

### 工具执行流程

1. **接收用户输入**：工具接收用户的查询或问题
2. **加载命令模板**：根据命令类型加载对应的命令模板
3. **加载提示词模板**：从模板目录加载系统提示和用户提示模板
4. **返回模板信息**：工具返回命令模板、提示词模板和执行指令

### Agent 执行流程（工具返回后）

当工具返回模板信息后，Agent 需要按以下步骤执行：

1. **RAG 知识检索**（新增，优先执行）：
   - 调用 RAG 服务：`POST /api/rag/query`
   - 检索参数：
     ```json
     {
       "query": "用户查询文本",
       "userId": "用户ID",
       "options": {
         "types": ["semantic_model", "qa_pair", "synonym", "business_knowledge"],
         "topK": 10,
         "useReranking": true
       }
     }
     ```
   - 提取检索结果：
     - `rag_semantic_models`：语义模型
     - `rag_qa_pairs`：QA对
     - `rag_synonyms`：同义词
     - `rag_business_knowledge`：业务知识

2. **准备变量数据**：
   - 从用户输入提取：`query`, `query_time`, `language`
   - 从RAG检索结果提取：`rag_semantic_models`, `rag_qa_pairs`, `rag_synonyms`, `rag_business_knowledge`
   - 可选变量：`instruction`, `histories`, `sql_generation_reasoning` 等

3. **替换变量**：使用 Jinja2 替换模板中的变量（优先使用RAG变量）

4. **调用 LLM**：使用替换后的提示词调用 LLM

5. **处理响应**：解析和处理 LLM 响应

6. **返回结果**：返回处理后的结果

## 在智能体中使用

### 方式一：直接命令调用

用户可以直接在对话中使用命令：

```
用户：/because.generate_sql 查询每个国家的病例总数
```

### 方式二：自然语言描述

用户也可以用自然语言描述，智能体会自动调用工具：

```
用户：帮我查询每个国家的病例总数
```

智能体会：
1. 识别这是 SQL 生成需求
2. 调用 `/because.generate_sql` 工具
3. 生成 SQL 查询

## 工具返回格式

工具返回 JSON 格式的响应，包含：

```json
{
  "success": true,
  "message": "SQL生成命令已识别。请根据命令模板和 Prompt 模板生成 ANSI SQL。",
  "user_input": "用户输入的内容",
  "command_template": "...（包含RAG检索步骤）",
  "command_info": {...},
  "prompt_templates": {
    "system": "Loaded",
    "user": "Loaded"
  },
  "instructions": [
    "1. 阅读命令模板，理解执行步骤和变量说明（注意：包含RAG检索步骤）",
    "2. 执行RAG知识检索：调用 POST /api/rag/query",
    "3. 从检索结果提取 rag_semantic_models, rag_qa_pairs, rag_synonyms, rag_business_knowledge",
    "4. 准备变量（优先使用RAG变量）",
    "5. 使用 Jinja2 替换模板中的变量",
    "6. 调用 LLM 生成 ANSI SQL",
    "7. 校验 SQL 语法与安全性，并返回最终 SQL 查询"
  ]
}
```

## LLM 处理流程（详细说明）

当工具返回后，Agent/LLM 应该：

1. **读取命令模板**：了解执行流程和步骤（注意：命令模板现在包含RAG检索步骤）

2. **执行 RAG 知识检索**（命令模板步骤2）：
   - 调用 RAG API：`POST /api/rag/query`
   - 处理检索结果，提取各类知识
   - 准备 RAG 变量（`rag_semantic_models`, `rag_qa_pairs`, `rag_synonyms`, `rag_business_knowledge`）

3. **读取提示词模板**：了解提示词结构

4. **准备变量**：
   - **必需变量**：`query`, `query_time`, `language`
   - **RAG变量**（优先使用）：`rag_semantic_models`, `rag_qa_pairs`, `rag_synonyms`, `rag_business_knowledge`
   - **传统变量**（仅作为回退）：`semantic_models`, `synonyms`, `docs`
   - **可选变量**：`instruction`, `histories`, `sql_generation_reasoning` 等

5. **替换变量**：使用 Jinja2 替换模板中的变量（优先使用RAG变量）

6. **调用 LLM**：使用替换后的提示词调用 LLM

7. **处理响应**：解析和处理 LLM 响应

8. **返回给用户**：提供最终结果

## 示例工作流程

### 用户输入：
```
查询每个国家的病例总数
```

### 工具调用：
```json
{
  "command": "generate_sql",
  "arguments": "查询每个国家的病例总数"
}
```

### 工具返回：
- 加载命令模板：`commands/generate-sql.md`
- 加载提示词模板：`templates/prompt-templates/default/sql_generation_*.txt`
- 提供执行步骤和变量要求

### Agent 处理：
1. **RAG 知识检索**：
   - 调用 `POST /api/rag/query`
   - 查询："查询每个国家的病例总数"
   - 检索到相关语义模型、QA对、同义词、业务知识

2. **准备变量**：
   - `query`: "查询每个国家的病例总数"
   - `query_time`: "2025-01-27 10:30:00"
   - `language`: "简体中文"
   - `rag_semantic_models`: [RAG检索到的语义模型，包含相似度分数]
   - `rag_qa_pairs`: [相关的QA对，包含类似问题的SQL示例]
   - `rag_synonyms`: [相关的同义词，如"病例"→"cases"]
   - `rag_business_knowledge`: [相关的业务知识]

3. **替换变量**：使用 Jinja2 替换模板中的变量（优先使用RAG变量）

4. **调用 LLM**：发送提示词并获取响应

5. **生成 SQL**：
```sql
SELECT country, SUM(cases) as total_cases 
FROM covid_data 
GROUP BY country
```

## 与 Speckit 的对比

| 特性 | Speckit | BeCause |
|------|---------|---------|
| 用途 | 软件开发规范 | 智能问数（文本转SQL） |
| 命令格式 | `/speckit.xxx` | `/because.xxx` |
| 模板位置 | `.specify/templates/` | `.because/` |
| 输出 | 技术文档 | SQL 查询、意图分类等 |
| 场景支持 | 功能规范、计划等 | SQL生成、数据辅助等 |

## 注意事项

1. **RAG 服务集成**：
   - 工具返回的命令模板包含RAG检索步骤
   - Agent必须执行RAG检索才能获取相关知识
   - RAG检索的知识会自动填充到提示词变量中
   - 优先使用RAG变量（`rag_*`），传统变量仅作为回退

2. **模板文件位置**：确保模板文件在 `.because/` 目录下

3. **权限**：工具不需要特殊权限，可以直接使用

4. **错误处理**：
   - 如果模板文件不存在，工具会返回错误信息
   - 如果RAG检索失败，可以回退到传统变量方式

5. **变量验证**：
   - 必需变量：`query`, `query_time`, `language`
   - RAG变量：优先使用，由RAG服务自动填充
   - 传统变量：已废弃，仅作为回退

## 故障排除

### 问题：工具未加载

**解决方案**：
1. 检查工具注册文件是否存在
2. 检查工具是否正确导入
3. 检查工具路径配置是否正确

### 问题：模板文件未找到

**解决方案**：
1. 确认 `.because/` 目录存在
2. 确认模板文件在正确的位置
3. 检查文件路径是否正确

### 问题：变量缺失

**解决方案**：
1. 检查命令模板中的变量要求
2. 确保所有必需变量都已提供
3. 检查变量名称是否正确

## 扩展开发

如果需要添加新功能：

1. **添加新命令**：在 `commands/` 目录下创建新的命令模板文件
2. **添加提示词模板**：在 `templates/prompt-templates/` 目录下添加新的模板文件
3. **更新工具注册**：在工具系统中注册新的命令

## RAG 服务集成说明

### 为什么需要 RAG？

RAG（检索增强生成）服务提供了智能的知识检索能力：

1. **自动检索**：根据用户查询自动检索最相关的知识
2. **多知识类型**：同时检索语义模型、QA对、同义词、业务知识
3. **相似度评分**：检索结果包含相似度分数，可用于判断相关性
4. **动态更新**：知识库可以动态更新，无需修改代码

### RAG 检索的知识类型

- **semantic_model**：语义模型（数据库表结构、业务含义）
- **qa_pair**：QA对（常见问题和答案，自动从对话中提取）
- **synonym**：同义词（业务术语映射）
- **business_knowledge**：业务知识（业务规则、文档等）

### 如何使用 RAG

在执行命令时，Agent需要：

1. 先调用 RAG 服务检索相关知识
2. 提取并分类检索结果
3. 将检索结果填充到提示词变量中
4. 继续执行原有的命令流程

详细步骤请参考各命令模板（`commands/*.md`）中的"RAG 知识检索"步骤。

---

**最后更新**：2025-01-27  
**版本**：2.0.0
