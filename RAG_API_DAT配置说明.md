# RAG API 与 DAT 组件配置说明

## 当前架构说明

### 1. RAG API 实现

当前系统中的 RAG API 是一个**独立的 Python 服务**，通过 Docker 容器部署：

```yaml
# rag.yml
rag_api:
  image: ghcr.io/constanji/because-rag-api-dev:latest
  environment:
    - DB_HOST=vectordb
    - DB_PORT=5432
    - POSTGRES_DB=mydatabase
    - POSTGRES_USER=myuser
    - POSTGRES_PASSWORD=mypassword
```

**RAG API 提供的主要功能：**

1. **文件嵌入（Embedding）**：
   - 端点：`POST /embed`
   - 位置：`api/server/services/Files/VectorDB/crud.js`
   - 功能：将上传的文件转换为向量并存储到向量数据库

2. **向量查询（Query）**：
   - 端点：`POST /query`
   - 位置：`api/app/clients/prompts/createContextHandlers.js`
   - 功能：根据用户查询检索相关的文档片段

### 2. DAT 组件

DAT 组件是 **Java 实现**的模块化组件：

- **dat-embedder-bge-small-zh-v15-q**：BGE Small ZH v1.5 量化版嵌入模型
- **dat-reranker-ms-marco-minilm-l6-v2**：MS MARCO MiniLM L6 v2 重排序模型

这些组件在 `dat-main/dat-embedders` 和 `dat-main/dat-rerankers` 目录下。

## 问题分析

**技术栈差异：**
- RAG API：Python 服务
- DAT 组件：Java 实现

这两者使用不同的技术栈，**不能直接互换使用**。

## 解决方案

### 方案一：配置 RAG API 使用相应的模型（推荐）

如果 RAG API 支持通过环境变量配置模型，可以在 `rag.yml` 中添加相应的环境变量：

```yaml
rag_api:
  image: ghcr.io/constanji/because-rag-api-dev:latest
  environment:
    - DB_HOST=vectordb
    - DB_PORT=5432
    - POSTGRES_DB=mydatabase
    - POSTGRES_USER=myuser
    - POSTGRES_PASSWORD=mypassword
    # 如果 RAG API 支持，添加以下环境变量
    - EMBEDDING_MODEL=bge-small-zh-v15-q  # 或对应的 Python 模型名称
    - RERANKER_MODEL=ms-marco-minilm-l6-v2  # 或对应的 Python 模型名称
```

**注意：** 需要确认 RAG API 是否支持这些环境变量，以及模型名称的格式。

### 方案二：在 DAT 项目中使用 DAT 组件（独立使用）

如果您想在 DAT 项目中使用这些组件，可以在 `dat_project.yaml` 中配置：

```yaml
# dat-main/dat_project.yaml
version: 1
name: BeCause
description: 因为智能

# 数据库配置
db:
  provider: mysql
  configuration:
    url: jdbc:mysql://localhost:3306/mall_demo
    username: root
    password: jinzijun
    timeout: 1 min

# LLM配置
llms:
  - name: default
    provider: deepseek
    configuration:
      api-key: sk-f49ac4c972004801a72cbb9d42efe2a7
      model-name: deepseek-chat
      base-url: https://api.deepseek.com/v1

# 嵌入模型配置 - 使用 DAT 组件
embedding:
  provider: bge-small-zh-v15-q  # ✅ 已经在使用 dat-embedder-bge-small-zh-v15-q

# 如果需要配置重排序模型（如果 DAT 支持）
# reranker:
#   provider: ms-marco-minilm-l6-v2
```

**当前状态：** 您的 `dat_project.yaml` 已经配置了 `bge-small-zh-v15-q` 作为嵌入模型。

### 方案三：修改 RAG API 实现（需要开发工作）

如果需要完全替换为 DAT 组件，需要：

1. **创建适配层**：在 RAG API 和 DAT 组件之间创建适配层
2. **集成 DAT 组件**：将 Java 实现的 DAT 组件集成到 Python RAG API 中
3. **API 桥接**：可能需要通过 HTTP 或 gRPC 调用 DAT 服务

这是一个较大的架构改动，需要一定的开发工作。

## 推荐做法

### 1. 检查 RAG API 支持的模型

首先，检查 RAG API 是否已经支持类似的模型：

- **BGE Small ZH v1.5**：检查 RAG API 是否支持 `bge-small-zh-v15` 或类似的模型名称
- **MS MARCO MiniLM L6 v2**：检查是否支持相应的重排序模型

### 2. 查看 RAG API 文档或源码

查找 RAG API 的配置文档，了解如何配置：
- 嵌入模型
- 重排序模型

可能需要查看：
- RAG API 的 GitHub 仓库
- Docker 镜像的 README
- 环境变量列表

### 3. 测试配置

在 `rag.yml` 中尝试添加环境变量：

```yaml
rag_api:
  image: ghcr.io/constanji/because-rag-api-dev:latest
  environment:
    - DB_HOST=vectordb
    - DB_PORT=5432
    - POSTGRES_DB=mydatabase
    - POSTGRES_USER=myuser
    - POSTGRES_PASSWORD=mypassword
    # 尝试添加模型配置（需要根据实际 RAG API 的文档调整）
    - EMBEDDING_PROVIDER=bge-small-zh-v15-q
    - RERANKER_PROVIDER=ms-marco-minilm-l6-v2
  env_file:
    - .env  # 也可以在 .env 文件中配置
```

### 4. 验证配置是否生效

重启 RAG API 服务后，检查：
- 日志输出是否显示使用了新的模型
- 嵌入和查询功能是否正常工作
- 性能是否有变化

## 相关文件位置

1. **RAG API 配置**：
   - `rag.yml`：Docker Compose 配置
   - `.env`：环境变量配置（如果使用）

2. **代码调用位置**：
   - `api/server/services/Files/VectorDB/crud.js`：文件嵌入
   - `api/app/clients/prompts/createContextHandlers.js`：向量查询

3. **DAT 组件**：
   - `dat-main/dat-embedders/dat-embedder-bge-small-zh-v15-q/`
   - `dat-main/dat-rerankers/dat-reranker-ms-marco-minilm-l6-v2/`
   - `dat-main/dat_project.yaml`：DAT 项目配置

## 推荐方案：在 DAT 中实现 RAG 服务

**结论：是的，在 DAT 里单独跑一个 RAG 服务确实更简单！**

### 为什么更简单？

1. **统一技术栈**：
   - DAT 组件都是 Java 实现
   - 可以直接使用 `dat-embedder-bge-small-zh-v15-q` 和 `dat-reranker-ms-marco-minilm-l6-v2`
   - 无需跨语言调用

2. **已有基础设施**：
   - ✅ DAT 已支持 `dat-storer-pgvector`（与现有 vectordb 兼容）
   - ✅ DAT 已有 `dat-server-openapi` 作为服务框架
   - ✅ DAT 已配置好嵌入模型（`bge-small-zh-v15-q`）

3. **配置简单**：
   - 在 `dat_project.yaml` 中配置即可
   - 不需要额外的 Docker 服务
   - 统一的配置管理

### 实现思路

#### 方案 A：扩展现有的 dat-server-openapi

在 `dat-server-openapi` 中添加 RAG 相关的端点：

```java
// 需要添加的端点
POST /api/v1/rag/embed      // 文件嵌入
POST /api/v1/rag/query      // 向量查询
GET  /api/v1/rag/documents/{file_id}/context  // 获取文档上下文
DELETE /api/v1/rag/documents  // 删除文档
```

#### 方案 B：创建新的 dat-server-rag

创建一个专门的 RAG 服务模块，复用 DAT 的组件：
- 使用 `dat-embedder-bge-small-zh-v15-q` 进行嵌入
- 使用 `dat-storer-pgvector` 存储向量
- 使用 `dat-reranker-ms-marco-minilm-l6-v2` 进行重排序

### 配置示例

在 `dat_project.yaml` 中：

```yaml
version: 1
name: BeCause
description: 因为智能

# 数据库配置
db:
  provider: postgresql  # 使用 PostgreSQL（与 vectordb 一致）
  configuration:
    url: jdbc:postgresql://localhost:5434/mydatabase
    username: myuser
    password: mypassword
    timeout: 1 min

# LLM配置（如果需要）
llms:
  - name: default
    provider: deepseek
    configuration:
      api-key: sk-f49ac4c972004801a72cbb9d42efe2a7
      model-name: deepseek-chat
      base-url: https://api.deepseek.com/v1

# 嵌入模型配置 - ✅ 已配置
embedding:
  provider: bge-small-zh-v15-q

# 向量存储配置
content-store:
  provider: pgvector  # 使用 pgvector 存储向量
  configuration:
    url: jdbc:postgresql://localhost:5434/mydatabase
    username: myuser
    password: mypassword

# 重排序模型配置（如果需要）
# 可以在代码中配置使用 dat-reranker-ms-marco-minilm-l6-v2
```

### 实施步骤

1. **开发 RAG 端点**：
   - 文件上传和嵌入（`/embed`）
   - 向量查询（`/query`）
   - 文档管理（增删改查）

2. **集成 DAT 组件**：
   - 使用 `EmbeddingModel` 进行文本嵌入
   - 使用 `EmbeddingStore` 存储和检索向量
   - 使用 `ScoringModel` 进行重排序

3. **部署和测试**：
   - 启动 DAT 服务
   - 修改 BecauseChat 的 `RAG_API_URL` 指向 DAT 服务
   - 测试文件嵌入和查询功能

### 优势总结

✅ **技术栈统一**：都是 Java，无需跨语言调用  
✅ **组件复用**：直接使用 DAT 的 embedder 和 reranker  
✅ **配置简单**：在 YAML 中统一配置  
✅ **易于维护**：代码和配置都在一个项目中  
✅ **性能更好**：无需网络调用，本地直接使用  

### 注意事项

- 需要开发 RAG 相关的 API 端点
- 需要处理文件上传和解析（PDF、Word、TXT 等）
- 需要与现有的 vectordb（PostgreSQL + pgvector）兼容
- 可能需要调整 BecauseChat 的调用代码以适配新的 API

## 下一步操作

如果选择在 DAT 中实现 RAG 服务：

1. **设计 API 接口**：
   - 参考现有 RAG API 的接口设计
   - 确定需要的端点和参数

2. **开发实现**：
   - 在 `dat-server-openapi` 中添加 RAG 端点
   - 或者创建新的 `dat-server-rag` 模块

3. **集成测试**：
   - 测试文件嵌入功能
   - 测试向量查询功能
   - 测试与 BecauseChat 的集成

4. **部署上线**：
   - 启动 DAT RAG 服务
   - 更新 BecauseChat 的配置
   - 迁移现有数据（如果需要）






