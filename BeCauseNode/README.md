# BeCause 提示词模板系统

用于智能问数（自然语言转SQL）的提示词模板系统，供 AI 智能体使用。

## 核心组件

### 命令模板 (`commands/`)

每个命令模板包含详细的执行步骤，指导如何：
1. 分析用户需求
2. 选择提示词模板
3. 准备变量数据
4. 加载模板文件
5. 执行变量替换（Jinja2）
6. 调用 LLM
7. 处理响应
8. 返回结果

### 提示词模板 (`templates/prompt-templates/`)

原始的 Jinja2 模板文件（.txt 格式），包含：
- `default/` - 默认模式的提示词模板
- `agentic/` - Agentic 模式的提示词模板

## 可用命令

### SQL 生成类
- `sql-generation` - 将自然语言转换为 ANSI SQL
- `sql-generation-reasoning` - 生成 SQL 生成前的推理计划

### 意图理解类
- `intent-classification` - 分类用户意图（TEXT_TO_SQL / GENERAL / MISLEADING_QUERY）

### 辅助功能类
- `data-assistance` - 回答关于数据库模式的一般问题
- `misleading-assistance` - 处理误导性查询并提供建议
- `scoring` - 评估文档与查询的相关性
- `hypothetical-questions` - 基于语义模型生成潜在问题

### Agentic 代理类
- `agentic/main-agent` - Agentic 代理的主系统提示
- `agentic/text-to-sql` - Agentic 模式的文本转SQL
- `agentic/data-assistance` - Agentic 模式的数据辅助
- `agentic/misleading-assistance` - Agentic 模式的误导查询处理

## 使用流程

1. **读取命令模板**：从 `commands/` 目录读取对应的命令模板
2. **理解执行步骤**：按照命令模板中的执行步骤操作
3. **加载提示词模板**：从 `templates/prompt-templates/` 加载原始模板
4. **准备变量**：根据命令模板要求准备变量
5. **替换变量**：使用 Jinja2 替换模板中的变量
6. **调用 LLM**：发送提示词并获取响应
7. **处理响应**：验证和提取结果

## 常用变量

- `{{ semantic_models }}` - 语义模型列表
- `{{ query }}` - 用户查询
- `{{ query_time }}` - 当前时间
- `{{ language }}` - 输出语言
- `{{ instruction }}` - 用户自定义指令（可选）
- `{{ text_to_sql_rules }}` - SQL 生成规则（可选）
- `{{ data_samples }}` - 数据样本（可选）
- `{{ sql_samples }}` - SQL 示例（可选）
- `{{ synonyms }}` - 同义词列表（可选）
- `{{ docs }}` - 业务知识文档（可选）
- `{{ histories }}` - 查询历史（可选）
