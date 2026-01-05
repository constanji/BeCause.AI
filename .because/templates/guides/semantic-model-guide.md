# 语义模型使用指南

本指南说明语义模型在 BeCause 智能问数工具系统中的用途和使用方法。

## 概述

语义模型（Semantic Model）是 BeCause 系统的核心概念，它描述了数据库的结构和业务含义，帮助 LLM 理解用户查询并生成正确的 SQL。

## RAG 知识库集成

**重要更新**：从 v2.0.0 开始，语义模型已集成到 RAG 知识库中。系统会自动通过 RAG 服务检索相关的语义模型，无需手动提供。

### RAG 检索的优势

1. **智能检索**：根据用户查询自动检索最相关的语义模型
2. **相似度评分**：检索结果包含相似度分数，可用于判断相关性
3. **多知识类型**：同时检索语义模型、QA对、同义词、业务知识
4. **自动更新**：知识库中的语义模型可以动态更新，无需修改代码

## 语义模型结构

语义模型通常包含以下元素：

- **name**：模型名称
- **description**：模型描述
- **model**：关联的数据表或视图
- **entities**：实体（主键、外键等）
- **dimensions**：维度（时间、分类、枚举等）
- **measures**：度量（聚合函数、计算字段等）

## 使用方式

### 方式一：RAG 自动检索（推荐）

系统会自动通过 RAG 服务检索相关的语义模型：

```javascript
// 自动调用 RAG 服务
const ragResults = await ragService.query({
  query: "用户查询",
  userId: "用户ID",
  options: {
    types: ["semantic_model"],
    topK: 10,
    useReranking: true
  }
});

// 提取语义模型
const ragSemanticModels = ragResults.results
  .filter(r => r.type === 'semantic_model')
  .map(r => ({
    ...r.metadata,
    content: r.content,
    score: r.score  // 相似度分数
  }));
```

### 方式二：手动提供（已废弃，仅作为回退）

传统方式，手动提供语义模型列表：

```yaml
semantic_models:
  - name: covid_data
    description: COVID-19 病例数据
    model: ref('covid_cases')
    entities:
      - name: country
        description: 国家名称
        type: primary
    dimensions:
      - name: date
        description: 日期
        type: time
        type_params:
          time_granularity: day
    measures:
      - name: cases
        description: 病例数量
        agg: sum
```

**注意**：此方式已废弃，仅在 RAG 检索失败时作为回退使用。

## 最佳实践

### RAG 知识库管理

1. **语义模型存储**：将语义模型存储到 RAG 知识库中
   - 使用 `POST /api/rag/knowledge` 添加语义模型
   - 系统会自动生成向量嵌入并存储

2. **定期更新**：当数据库结构变化时，及时更新知识库中的语义模型

3. **质量保证**：确保语义模型的描述清晰准确，便于检索

### 语义模型设计

1. **清晰描述**：确保模型和字段的描述清晰准确
2. **完整信息**：提供完整的实体、维度和度量信息
3. **业务术语**：使用业务术语而非技术术语
4. **关系定义**：明确定义实体之间的关系

### 使用建议

1. **优先使用RAG检索**：让系统自动检索最相关的语义模型
2. **参考相似度分数**：使用相似度分数判断语义模型的相关性
3. **结合其他知识**：同时利用QA对、同义词、业务知识增强理解

## 相关资源

- **be-cause 项目**：`../../../be-cause/my-project/models/`
- **SQL 生成命令**：`../../commands/generate-sql.md`

---

**最后更新**：2025-12-17  
**版本**：1.0.0
