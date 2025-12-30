# DAT Tools - DAT 组件工具集合

这个目录包含了三个工具，用于发现和配置 DAT 系统中的组件：

- **DatAdapter**: 数据库适配器发现和配置工具
- **DatEmbedder**: 嵌入模型发现和配置工具
- **DatReranker**: 重排序模型发现和配置工具

## 设计说明

这些工具参考了 `BeCause.js` 的实现模式，采用以下设计：

1. **服务层（Service）**: 负责扫描和解析 Java 源文件，提取组件信息
2. **工具层（Tool）**: 继承自 LangChain 的 `Tool` 类，提供统一的工具接口
3. **命令模式**: 每个工具支持多个命令（list、info、config）

## 文件结构

```text
datools/
├── DatAdapterService.js    # 数据库适配器服务层
├── DatAdapter.js           # 数据库适配器工具
├── DatEmbedderService.js   # 嵌入模型服务层
├── DatEmbedder.js          # 嵌入模型工具
├── DatRerankerService.js   # 重排序模型服务层
├── DatReranker.js          # 重排序模型工具
├── index.js                # 导出文件
└── README.md               # 说明文档
```

## 使用方法

### 1. DatAdapter - 数据库适配器工具

用于发现和配置数据库适配器（MySQL、PostgreSQL、Oracle、DuckDB 等）。

```javascript
const { DatAdapter } = require('./datools');

const adapter = new DatAdapter();

// 列出所有可用适配器
await adapter.invoke({
  command: 'list'
});

// 获取特定适配器信息
await adapter.invoke({
  command: 'info',
  adapter: 'mysql'
});

// 获取适配器配置选项
await adapter.invoke({
  command: 'config',
  adapter: 'postgresql'
});
```

**可用命令**:

- `list`: 列出所有可用的数据库适配器
- `info`: 获取特定适配器的详细信息
- `config`: 获取适配器的配置选项说明

### 2. DatEmbedder - 嵌入模型工具

用于发现和配置嵌入模型（BGE、OpenAI、Jina、Ollama 等）。

```javascript
const { DatEmbedder } = require('./datools');

const embedder = new DatEmbedder();

// 列出所有可用嵌入模型
await embedder.invoke({
  command: 'list'
});

// 获取特定模型信息
await embedder.invoke({
  command: 'info',
  embedder: 'bge-small-zh'
});

// 获取模型配置选项
await embedder.invoke({
  command: 'config',
  embedder: 'openai'
});
```

**可用命令**:

- `list`: 列出所有可用的嵌入模型
- `info`: 获取特定模型的详细信息
- `config`: 获取模型的配置选项说明

### 3. DatReranker - 重排序模型工具

用于发现和配置重排序模型（MS-MARCO、Jina、ONNX 等）。

```javascript
const { DatReranker } = require('./datools');

const reranker = new DatReranker();

// 列出所有可用重排序模型
await reranker.invoke({
  command: 'list'
});

// 获取特定模型信息
await reranker.invoke({
  command: 'info',
  reranker: 'ms-marco-minilm-l6-v2'
});

// 获取模型配置选项
await reranker.invoke({
  command: 'config',
  reranker: 'jina'
});
```

**可用命令**:

- `list`: 列出所有可用的重排序模型
- `info`: 获取特定模型的详细信息
- `config`: 获取模型的配置选项说明

## 实现原理

### 服务层实现

每个服务类（如 `DatAdapterService`）负责：

1. **目录扫描**: 扫描 `dat-main/dat-adapters`、`dat-main/dat-embedders` 或 `dat-main/dat-rerankers` 目录
2. **文件查找**: 查找对应的 Factory 类 Java 文件
3. **信息提取**: 使用正则表达式解析 Java 源文件，提取：
   - `IDENTIFIER`: 组件标识符
   - `factoryClass`: Factory 类名
   - `requiredOptions`: 必需配置选项
   - `optionalOptions`: 可选配置选项
   - `configOptions`: 配置选项的详细说明

### 工具层实现

每个工具类（如 `DatAdapter`）负责：

1. **命令路由**: 根据 `command` 参数路由到对应的处理方法
2. **参数验证**: 使用 Zod schema 验证输入参数
3. **结果格式化**: 返回 JSON 格式的结构化结果
4. **日志记录**: 记录工具调用的详细信息

## 返回格式

所有工具都返回 JSON 格式的结果，包含：

```json
{
  "success": true,
  "message": "操作描述",
  "data": {
    // 具体数据
  },
  "instructions": [
    "使用说明1",
    "使用说明2"
  ]
}
```

## 注意事项

1. **目录要求**: 工具需要在项目根目录下存在 `dat-main` 目录
2. **Java 文件解析**: 使用正则表达式解析 Java 源文件，可能无法处理所有复杂情况
3. **配置选项**: 配置选项信息从 Java 源文件中提取，可能与实际运行时有所不同
4. **错误处理**: 所有错误都会返回 JSON 格式的错误信息

## 扩展

如果需要添加新的功能或支持新的组件类型：

1. 创建对应的 Service 类（如 `DatStorerService.js`）
2. 创建对应的 Tool 类（如 `DatStorer.js`）
3. 在 `index.js` 中导出新工具
4. 参考现有实现模式保持一致

## 与 BeCause.js 的对比

| 特性 | BeCause.js | DAT Tools |
|------|-----------|-----------|
| 数据源 | BeCauseNode 目录 | dat-main 目录 |
| 文件类型 | Markdown 模板 | Java 源文件 |
| 解析方式 | 文件读取 + YAML 解析 | 文件读取 + 正则表达式 |
| 命令模式 | 多种命令（sql-generation 等） | 统一命令（list/info/config） |
| 返回格式 | JSON 字符串 | JSON 字符串 |

## 许可证

与主项目保持一致。
