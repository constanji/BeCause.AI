---
name: result-analysis-tool
description: SQL查询结果分析工具，解释结果含义、指出关键维度、生成后续查询建议
category: result-analysis
version: 1.0
---

# Result Analysis Tool

## 概述

SQL查询结果分析工具，对SQL执行结果进行深度分析：
- **结果解释**：用自然语言解释查询结果的含义
- **关键维度识别**：指出影响指标的关键维度
- **归因分析**：说明结论来自哪些表、哪些字段、哪些过滤条件
- **后续建议**：生成follow-up问题建议

## 核心能力

1. **结果解释**：将数据结果转换为业务语言
2. **维度分析**：识别关键业务维度
3. **归因说明**：清晰说明数据来源
4. **智能建议**：基于结果生成后续查询建议

## 输入参数

- `sql` (string, 必需): 执行的SQL查询语句
- `results` (array, 必需): SQL查询结果数组
- `row_count` (number, 可选): 结果行数
- `attribution` (object, 可选): 归因信息（来自sql_executor）
  - `tables` (array): 使用的表名
  - `columns` (array): 返回的字段名
  - `has_where` (boolean): 是否有WHERE条件
  - `has_group_by` (boolean): 是否有GROUP BY
  - `has_order_by` (boolean): 是否有ORDER BY

## 输出格式

```json
{
  "summary": "结果摘要（自然语言）",
  "key_insights": [
    {
      "dimension": "维度名称",
      "value": "维度值",
      "impact": "影响说明"
    }
  ],
  "attribution": {
    "tables": ["table1", "table2"],
    "columns": ["col1", "col2"],
    "filters": "WHERE条件说明",
    "grouping": "GROUP BY说明",
    "data_source": "数据来源说明"
  },
  "follow_up_suggestions": [
    {
      "question": "后续问题建议",
      "reason": "建议原因",
      "sql_hint": "SQL提示（可选）"
    }
  ],
  "metadata": {
    "row_count": 10,
    "column_count": 5,
    "analysis_confidence": 0.8
  }
}
```

## 执行流程

1. **结果分析**
   - 分析结果数据的结构和内容
   - 识别关键字段和维度
   - 计算统计信息（如果有数值字段）

2. **归因说明**
   - 从SQL中提取表、字段、过滤条件信息
   - 生成数据来源说明

3. **洞察提取**
   - 识别关键业务维度
   - 分析数据趋势和模式（如果有时间序列数据）

4. **建议生成**
   - 基于当前结果生成后续查询建议
   - 提供深入分析的查询方向

## 使用场景

- **SQL执行后**：分析执行结果，生成业务解释
- **数据报告**：生成数据报告和洞察
- **用户问答**：帮助用户理解查询结果

## 注意事项

- 分析结果应基于实际返回的数据，不能臆造
- 归因说明应清晰指出数据来源
- 后续建议应基于当前结果，具有实际意义

