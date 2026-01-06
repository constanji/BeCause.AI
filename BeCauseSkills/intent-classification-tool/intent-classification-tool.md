---
name: intent-classification-tool
description: 分类用户查询意图（TEXT_TO_SQL / GENERAL / MISLEADING_QUERY），使用RAG检索提高分类准确性
category: intent-classification
version: 1.0
---

# Intent Classification Tool

## 概述

智能意图分类工具，根据用户查询和RAG检索的知识，将用户查询分类为三种意图之一：
- **TEXT_TO_SQL**: 查询与数据库模式相关，需要生成SQL
- **GENERAL**: 查询关于数据库模式的一般信息
- **MISLEADING_QUERY**: 查询与数据库模式无关或缺乏详细信息

## 核心能力

1. **RAG知识检索集成**：自动检索语义模型、QA对、业务知识，提高分类准确性
2. **轻量级设计**：只返回分类结果，不包含冗长的模板说明
3. **上下文感知**：结合查询历史和上下文信息进行意图判断

## 输入参数

- `query` (string, 必需): 用户查询文本
- `use_rag` (boolean, 可选): 是否使用RAG检索，默认 true
- `top_k` (number, 可选): RAG检索返回数量，默认 5

## 输出格式

```json
{
  "intent": "TEXT_TO_SQL" | "GENERAL" | "MISLEADING_QUERY",
  "confidence": 0.0-1.0,
  "reasoning": "简短推理说明（最多20词）",
  "rephrased_question": "重述后的完整问题（如有）",
  "rag_context": {
    "semantic_models_found": boolean,
    "qa_pairs_found": boolean,
    "business_knowledge_found": boolean
  }
}
```

## 执行流程

1. **RAG知识检索**（如果启用）
   - 调用 `/api/rag/query` 检索语义模型、QA对、业务知识
   - 提取检索结果，判断查询与数据库的相关性

2. **意图分析**
   - 基于RAG检索结果和查询文本分析意图
   - 如果检索到相关语义模型，更可能是 TEXT_TO_SQL
   - 参考QA对中类似问题的处理方式

3. **返回分类结果**
   - 返回意图类型、置信度、推理说明
   - 包含RAG上下文信息

## 意图分类规则

### TEXT_TO_SQL
- 用户的输入与数据库模式相关，需要SQL查询
- 问题包含对特定表、列或数据详情的引用
- RAG检索到相关语义模型

### GENERAL
- 用户寻求关于数据库模式或其整体功能的一般信息
- 查询没有提供足够的细节来生成特定的SQL查询

### MISLEADING_QUERY
- 用户的输入与数据库模式无关
- 用户的输入缺乏生成SQL查询所需的特定细节
- RAG检索未找到相关语义模型

## 注意事项

- 推理说明必须清晰、简洁，限制在20个词以内
- 重述问题和推理必须使用与用户输出语言相同的语言
- 如果有查询历史，必须结合上下文理解当前查询

