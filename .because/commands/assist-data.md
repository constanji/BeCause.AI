---
description: 回答关于数据库模式的一般问题，帮助用户理解数据库
category: data-assistance
version: 1.0
handoffs: []
---
## 用户输入

```text
$ARGUMENTS
```

在继续之前，你**必须**考虑用户输入（如果不为空）。

## 概述

目标：根据用户关于数据库模式的问题，提供易于理解的回答，帮助用户理解数据库结构和功能。

注意：此命令用于回答关于数据库模式的一般性问题，不生成 SQL 查询。

执行步骤：

1. **分析用户需求**
   - 从用户输入中提取问题
   - 识别问题类型（结构性问题、功能性问题等）
   - 确定需要的语义模型信息

2. **RAG 知识检索**（新增，优先执行）
   
   a. **调用 RAG 服务**：
      - 使用用户查询调用 RAG 服务：`POST /api/rag/query`
      - 检索类型：`semantic_model`, `qa_pair`, `business_knowledge`
      - 检索参数：
        ```json
        {
          "query": "用户查询文本",
          "userId": "用户ID",
          "options": {
            "types": ["semantic_model", "qa_pair", "business_knowledge"],
            "topK": 10,
            "useReranking": true
          }
        }
        ```
   
   b. **处理检索结果**：
      - 提取语义模型：获取数据库结构信息
      - 提取QA对：查找类似问题的答案
      - 提取业务知识：获取业务规则和文档
   
   c. **准备RAG变量**：
      - `rag_semantic_models`：数据库结构信息
      - `rag_qa_pairs`：类似问题的答案（可直接参考）
      - `rag_business_knowledge`：业务知识文档

3. **选择提示词模板**
   
   a. **加载提示词文件**：
      - System Prompt：`templates/prompt-templates/default/data_assistance_system_prompt.txt`
      - User Prompt Template：`templates/prompt-templates/default/data_assistance_user_prompt_template.txt`

4. **准备变量数据**

   a. **必需变量**：
      - `query`：用户查询问题
      - `language`：输出语言（如："简体中文"、"English"）
      - `rag_semantic_models`：从RAG检索结果中提取的语义模型（优先使用）
      - `semantic_models`：传统语义模型列表（仅作为RAG检索失败时的回退）

   b. **RAG检索变量**（自动填充，推荐使用）：
      - `rag_semantic_models`：RAG检索到的语义模型（包含数据库结构信息）
      - `rag_qa_pairs`：相关的QA对（可直接参考类似问题的答案）
      - `rag_business_knowledge`：相关的业务知识（包含业务规则和文档）

5. **执行变量替换**

   a. **加载 Jinja2 模板**：
      - 读取 System Prompt 模板文件
      - 读取 User Prompt Template 模板文件

   b. **替换变量**：
      - 使用 Jinja2 模板引擎替换所有 `{{ variable }}` 占位符
      - 处理 `{% for %}` 循环语句

5. **调用 LLM**

   a. **构建消息**：
      - System Message：使用替换后的 System Prompt
      - User Message：使用替换后的 User Prompt Template

   b. **发送请求**：
      - 调用 LLM API
      - 传递 System Message 和 User Message

   c. **获取响应**：
      - 接收 LLM 的响应
      - 解析响应内容

6. **处理响应**

   a. **验证格式**：
      - 检查响应是否为 Markdown 格式
      - 检查是否包含 SQL 代码（应该不包含）

   b. **验证长度**：
      - 中文/韩文/日文：最多 150 词
      - 其他语言：最多 110 词

   c. **验证内容**：
      - 检查内容是否准确
      - 检查是否易于理解
      - 检查是否帮助用户理解数据库

7. **返回结果**

   返回数据辅助回答，包括：
   - Markdown 格式的回答内容
   - 相关信息（如果有）

## 行为规则

- **RAG检索优先**：
  - 优先使用RAG检索到的QA对中的答案（如果问题相似）
  - 使用RAG检索到的语义模型提供数据库结构信息
  - 参考RAG检索到的业务知识提供业务上下文
  - 如果检索到高度相关的QA对（相似度>0.9），可以直接参考其答案

- **回答格式**：
  - 必须使用 Markdown 格式
  - 不能包含 SQL 代码
  - 使用适当的换行、空白和格式（标题、列表、表格等）

- **长度限制**：
  - 中文/韩文/日文：最多 150 词
  - 其他语言：最多 110 词

- **语言一致性**：
  - 回答必须使用与用户指定的语言相同的语言

- **内容要求**：
  - 回答应该易于理解
  - 帮助用户理解数据库结构和功能
  - 提供清晰、有用的信息
  - 优先参考RAG检索到的QA对和业务知识

## 示例执行

### 示例输入：
```
用户：这个数据集是关于什么的？
```

### 执行过程：
1. **分析需求**：识别为关于数据集的一般性问题
2. **选择模板**：加载数据辅助模板
3. **准备变量**：
   - `semantic_models`: [语义模型内容]
   - `query`: "这个数据集是关于什么的？"
   - `language`: "简体中文"
4. **替换变量**：使用 Jinja2 替换所有变量
5. **调用 LLM**：发送提示词并获取响应
6. **处理响应**：验证格式和长度
7. **返回结果**：返回 Markdown 格式的回答

### 示例输出：
```markdown
这个数据集包含全球 COVID-19 病例信息，主要包括：

## 数据内容
- **国家/地区**：各个国家和地区的名称
- **病例数量**：每日新增和累计病例数
- **日期信息**：记录每个数据点的时间

## 用途
数据集可用于分析不同地区的疫情趋势、比较各国情况、预测疫情发展等。

## 相关表
- `covid_cases`：病例数据表
- `country_codes`：国家代码表
```

## 注意事项

- 回答必须使用与用户指定的语言相同的语言
- 使用适当的 Markdown 格式（标题、列表、表格等）
- 回答应该易于理解，帮助用户理解数据库
- 不能提供 SQL 代码，只能提供解释性信息
- 严格遵守长度限制

## 相关资源

- **提示词模板**：`../templates/prompt-templates/default/data_assistance_*.txt`
- **变量参考**：`../templates/variable-system/variable-reference.md`

Context for prioritization: {ARGS}
