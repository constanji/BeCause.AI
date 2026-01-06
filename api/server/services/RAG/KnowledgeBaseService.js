const { logger } = require('@because/data-schemas');
const mongoose = require('mongoose');
const { createModels } = require('@because/data-schemas');

/**
 * 语义角色定义
 * 每个语义模型必须声明其语义角色，而不是通过表名猜测
 */
const SemanticRole = {
  ENTITY: 'entity',      // 实体：人、物、概念（如客户、商品、医生）
  FACT: 'fact',          // 事实表：交易、订单、支付（可聚合的业务事实）
  SNAPSHOT: 'snapshot',  // 快照：库存、状态、余额（时间点的状态）
  EVENT: 'event',        // 事件：行为、日志、变更（不可聚合的事件流）
};

/**
 * 语义描述符基类
 * 定义生成语义模型说明的接口
 */
class SemanticDescriptor {
  /**
   * 生成模型描述
   * @param {Object} model - 语义模型对象
   * @param {Object} context - 上下文信息（主键、维度、度量等）
   * @returns {string} 生成的描述文本
   */
  generateDescription(model, context) {
    throw new Error('generateDescription must be implemented by subclass');
  }

  /**
   * 生成业务问题示例
   * @param {Object} model - 语义模型对象
   * @param {Object} context - 上下文信息
   * @returns {Array<string>} 业务问题列表
   */
  generateBusinessQuestions(model, context) {
    return [];
  }

  /**
   * 生成关键点
   * @param {Object} model - 语义模型对象
   * @param {Object} context - 上下文信息
   * @returns {Array<string>} 关键点列表
   */
  generateKeyPoints(model, context) {
    return [];
  }
}

/**
 * 实体描述符
 * 用于描述"人"、"物"、"概念"等实体
 */
class EntityDescriptor extends SemanticDescriptor {
  generateDescription(model, context) {
    const { primaryKey, dimensions, measures } = context;
    const modelName = model.name || model.model || '实体';
    
    let desc = '这是一个"实体"的抽象\n\n';
    
    // 根据实体的维度推断实体类型
    if (dimensions.some(d => d.includes('name') || d.includes('title'))) {
      desc += '一个实体是谁？它有哪些基本属性？';
    } else {
      desc += `这是"${modelName}"实体，包含实体的基本信息和属性`;
    }
    
    return desc;
  }

  generateBusinessQuestions(model, context) {
    const { dimensions, measures } = context;
    const questions = [];
    
    if (dimensions.length > 0) {
      questions.push(`按${dimensions[0]}分析的数据分布如何？`);
    }
    if (measures.length > 0) {
      questions.push(`实体的${measures[0]}统计情况如何？`);
    }
    
    return questions;
  }

  generateKeyPoints(model, context) {
    const { primaryKey } = context;
    const points = [];
    
    if (primaryKey) {
      points.push(`${primaryKey} 是唯一标识`);
    }
    
    return points;
  }
}

/**
 * 事实表描述符
 * 用于描述交易、订单等可聚合的业务事实
 */
class FactDescriptor extends SemanticDescriptor {
  generateDescription(model, context) {
    const { measures, dimensions } = context;
    const modelName = model.name || model.model || '事实表';
    
    let desc = '这是一次"交易事件"或"业务事实"\n\n';
    
    if (measures.some(m => m.includes('amount') || m.includes('price'))) {
      desc += '包含可汇总的金额、数量等度量值\n\n';
      desc += '这是业务分析的核心事实表，可用于计算GMV、销量等关键指标';
    } else {
      desc += `这是"${modelName}"事实表，记录业务发生的事实`;
    }
    
    return desc;
  }

  generateBusinessQuestions(model, context) {
    const { measures, dimensions } = context;
    const questions = [];
    
    if (measures.some(m => m.includes('amount') || m.includes('total'))) {
      questions.push('总金额、总数量统计');
    }
    if (measures.some(m => m.includes('price') || m.includes('cost'))) {
      questions.push('价格、成本分析');
    }
    if (dimensions.length > 0) {
      questions.push(`按${dimensions[0]}维度的数据分布`);
    }
    
    return questions;
  }

  generateKeyPoints(model, context) {
    const { primaryKey, measures, dimensions } = context;
    const points = [];
    
    if (primaryKey) {
      points.push(`${primaryKey} 是唯一标识`);
    }
    
    // 检查是否有既是维度又是度量的字段
    const dualFields = dimensions.filter(d => measures.includes(d));
    if (dualFields.length > 0) {
      points.push(`${dualFields[0]} 既是属性（维度）又是可统计指标（measure）`);
    }
    
    if (measures.some(m => m.includes('quantity') || m.includes('count'))) {
      points.push('数量、金额等字段都是可汇总的数值');
    }
    
    return points;
  }
}

/**
 * 快照描述符
 * 用于描述库存、状态等时间点快照
 */
class SnapshotDescriptor extends SemanticDescriptor {
  generateDescription(model, context) {
    const { dimensions, measures } = context;
    const modelName = model.name || model.model || '快照表';
    
    let desc = '这是"当前状态"的快照模型\n\n';
    desc += '快照不是交易，而是某个时间点的状态记录\n\n';
    
    if (measures.some(m => m.includes('quantity') || m.includes('stock'))) {
      desc += '可直接回答的问题：哪些商品库存不足？最近多久补过货？库存总量趋势如何？';
    } else {
      desc += `这是"${modelName}"状态快照，记录实体的当前状态`;
    }
    
    return desc;
  }

  generateBusinessQuestions(model, context) {
    const { measures, dimensions } = context;
    const questions = [];
    
    if (measures.some(m => m.includes('quantity') || m.includes('stock'))) {
      questions.push('哪些商品库存不足？');
      questions.push('最近多久补过货？');
      questions.push('库存总量趋势如何？');
    } else {
      questions.push('当前状态分布如何？');
      questions.push('状态变化趋势如何？');
    }
    
    return questions;
  }

  generateKeyPoints(model, context) {
    const { primaryKey, measures, dimensions } = context;
    const points = [];
    
    if (primaryKey) {
      points.push(`${primaryKey} 是唯一标识`);
    }
    
    // 快照表的特点：状态字段可能既是维度又是度量
    const stateFields = measures.filter(m => 
      m.includes('quantity') || m.includes('stock') || m.includes('balance')
    );
    if (stateFields.length > 0) {
      points.push(`${stateFields[0]} 既是维度又是度量，这在 BI / LLM 场景是完全合理的（状态 & 汇总）`);
    }
    
    return points;
  }
}

/**
 * 事件描述符
 * 用于描述行为、日志等不可聚合的事件流
 */
class EventDescriptor extends SemanticDescriptor {
  generateDescription(model, context) {
    const { dimensions } = context;
    const modelName = model.name || model.model || '事件表';
    
    let desc = '这是"事件"或"行为"的记录\n\n';
    
    if (dimensions.some(d => d.includes('type') || d.includes('action'))) {
      desc += '记录了事件类型、发生时间、相关对象等信息\n\n';
      desc += '这是分析转化、用户行为路径的关键数据源';
    } else {
      desc += `这是"${modelName}"事件表，记录业务事件的发生`;
    }
    
    return desc;
  }

  generateBusinessQuestions(model, context) {
    const { dimensions } = context;
    const questions = [];
    
    questions.push('转化漏斗分析');
    questions.push('用户行为路径');
    
    if (dimensions.some(d => d.includes('type'))) {
      questions.push('事件类型分布');
    }
    
    return questions;
  }

  generateKeyPoints(model, context) {
    const { primaryKey, dimensions } = context;
    const points = [];
    
    if (primaryKey) {
      points.push(`${primaryKey} 是唯一标识`);
    }
    
    points.push('行为类型、行为时间、行为对象（人 + 商品）');
    points.push('这是漏斗 / 推荐 / 画像的输入层');
    
    return points;
  }
}

/**
 * 语义角色注册表
 * 将语义角色映射到对应的描述符
 */
const SemanticRoleRegistry = {
  [SemanticRole.ENTITY]: EntityDescriptor,
  [SemanticRole.FACT]: FactDescriptor,
  [SemanticRole.SNAPSHOT]: SnapshotDescriptor,
  [SemanticRole.EVENT]: EventDescriptor,
};

/**
 * 从语义模型结构中提取上下文信息
 * @param {Object} model - 语义模型对象
 * @returns {Object} 上下文信息
 */
function extractModelContext(model) {
  const entities = model.entities || [];
  const dimensions = model.dimensions || [];
  const measures = model.measures || [];
  const columns = model.columns || [];

  // 提取主键
  const primaryEntity = entities.find(e => e.type === 'primary');
  const primaryKey = primaryEntity 
    ? (primaryEntity.expr || primaryEntity.name)
    : null;

  // 提取外键
  const foreignEntities = entities.filter(e => e.type === 'foreign');
  const foreignKeys = foreignEntities.map(e => e.expr || e.name);

  // 从语义模型结构提取维度
  let allDimensions = dimensions.map(d => d.expr || d.name || d.alias).filter(Boolean);
  
  // 从语义模型结构提取度量
  let allMeasures = measures.map(m => m.expr || m.name || m.alias).filter(Boolean);

  // 如果没有语义模型结构，从 columns 分析
  if (columns && columns.length > 0) {
    if (allDimensions.length === 0) {
      allDimensions = columns.filter(col => {
        const type = (col.type || '').toLowerCase();
        const name = (col.name || '').toLowerCase();
        return type.includes('date') || type.includes('time') || type.includes('enum') || 
               type.includes('varchar') || type.includes('char') || 
               name.includes('type') || name.includes('status') || name.includes('category');
      }).map(col => col.name);
    }

    if (allMeasures.length === 0) {
      allMeasures = columns.filter(col => {
        const type = (col.type || '').toLowerCase();
        const name = (col.name || '').toLowerCase();
        return type.includes('int') || type.includes('decimal') || type.includes('float') || 
               type.includes('double') || type.includes('numeric') ||
               name.includes('amount') || name.includes('price') || name.includes('quantity') || 
               name.includes('count') || name.includes('total') || name.includes('sum');
      }).map(col => col.name);
    }

    if (!primaryKey) {
      const primaryKeys = columns.filter(col => {
        const key = (col.key || '').toUpperCase();
        return key === 'PRI' || key === 'PRIMARY' || key.includes('PRIMARY');
      }).map(col => col.name);
      if (primaryKeys.length > 0) {
        primaryKey = primaryKeys[0];
      }
    }
  }

  // 提取可识别字段
  const identifiableFields = columns ? columns.filter(col => {
    const name = (col.name || '').toLowerCase();
    return name.includes('name') || name.includes('title') || name.includes('phone') || 
           name.includes('email') || name.includes('mobile') || name.includes('tel') ||
           name.includes('code') || name.includes('no') || name.includes('number');
  }).map(col => col.name) : [];

  return {
    primaryKey,
    foreignKeys,
    dimensions: allDimensions,
    measures: allMeasures,
    identifiableFields,
  };
}

/**
 * 推断语义角色（如果模型未显式声明）
 * 这是兜底逻辑，优先使用模型声明的 semantic_role
 * @param {Object} model - 语义模型对象
 * @param {Object} context - 上下文信息
 * @returns {string} 推断的语义角色
 */
function inferSemanticRole(model, context) {
  // 优先使用模型显式声明的角色
  if (model.semantic_role && SemanticRoleRegistry[model.semantic_role]) {
    return model.semantic_role;
  }

  const { measures, dimensions } = context;
  const modelName = (model.name || model.model || '').toLowerCase();

  // 基于模型特征推断角色
  // 如果有明确的度量字段，通常是事实表
  if (measures.length > 0 && measures.some(m => 
    m.includes('amount') || m.includes('price') || m.includes('quantity') || m.includes('total')
  )) {
    // 如果包含时间维度且度量是状态类，可能是快照
    if (measures.some(m => m.includes('stock') || m.includes('balance') || m.includes('quantity')) &&
        dimensions.some(d => d.includes('time') || d.includes('date'))) {
      return SemanticRole.SNAPSHOT;
    }
    return SemanticRole.FACT;
  }

  // 如果有事件类型字段，通常是事件表
  if (dimensions.some(d => d.includes('type') || d.includes('action') || d.includes('event')) ||
      modelName.includes('behavior') || modelName.includes('log') || modelName.includes('event')) {
    return SemanticRole.EVENT;
  }

  // 如果有状态字段且没有明显的度量，可能是快照
  if (dimensions.some(d => d.includes('status') || d.includes('state')) ||
      modelName.includes('inventory') || modelName.includes('stock') || modelName.includes('snapshot')) {
    return SemanticRole.SNAPSHOT;
  }

  // 默认作为实体
  return SemanticRole.ENTITY;
}

/**
 * 生成语义模型说明文本
 * 基于语义角色注册表 + 策略模式，而非 if-else 猜测
 * @param {Object} params
 * @param {string} params.databaseName - 数据库名称
 * @param {Array} params.semanticModels - 语义模型数组
 * @returns {string} 生成的说明文本
 */
function generateSemanticModelDescription({ databaseName, semanticModels }) {
  if (!semanticModels || semanticModels.length === 0) {
    return '';
  }

  let description = '';
  const emojiMap = {
    1: '1️⃣',
    2: '2️⃣',
    3: '3️⃣',
    4: '4️⃣',
    5: '5️⃣',
    6: '6️⃣',
    7: '7️⃣',
    8: '8️⃣',
    9: '9️⃣',
  };

  // 生成每个表的说明
  semanticModels.forEach((model, index) => {
    const emoji = emojiMap[index + 1] || `${index + 1}.`;
    const modelName = model.name || model.model || '未知表';
    
    // 提取模型上下文
    const context = extractModelContext(model);
    
    // 确定语义角色（优先使用声明，否则推断）
    const semanticRole = inferSemanticRole(model, context);
    
    // 从注册表获取对应的描述符
    const DescriptorClass = SemanticRoleRegistry[semanticRole];
    if (!DescriptorClass) {
      // 如果角色不存在，使用默认实体描述符
      const descriptor = new EntityDescriptor();
      const modelDesc = model.description || descriptor.generateDescription(model, context);
      description += `${emoji} ${modelName}\n\n${modelDesc}\n\n---\n\n`;
      return;
    }
    
    // 实例化描述符并生成内容
    const descriptor = new DescriptorClass();
    
    // 生成模型描述（如果模型已有描述且足够详细，则使用模型的描述）
    let modelDesc = model.description;
    if (!modelDesc || modelDesc.includes('数据库表:') || modelDesc.length < 20) {
      modelDesc = descriptor.generateDescription(model, context);
    }
    
    description += `${emoji} ${modelName}\n\n`;
    description += `${modelDesc}\n\n`;

    // 生成核心语义
    if (context.primaryKey) {
      description += `核心语义：\n`;
      // 提取主键显示名称
      let keyDisplayName = context.primaryKey;
      if (context.primaryKey.endsWith('_id')) {
        keyDisplayName = context.primaryKey.replace(/_id$/, '');
      }
      description += `${keyDisplayName}唯一标识：${context.primaryKey}\n\n`;
    }

    // 可识别属性
    if (context.identifiableFields.length > 0) {
      const entityType = modelDesc.includes('人') ? '人' : modelDesc.includes('商品') ? '商品' : '实体';
      description += `可直接识别${entityType}的属性：\n`;
      context.identifiableFields.slice(0, 5).forEach(field => {
        description += `${field}\n`;
      });
    }

    // 可分析属性
    const analysisFields = [];
    context.dimensions.slice(0, 3).forEach(field => {
      analysisFields.push(`${field}（维度）`);
    });
    context.measures.slice(0, 3).forEach(field => {
      analysisFields.push(`${field}（度量）`);
    });
    
    if (analysisFields.length > 0) {
      description += `\n可分析属性：\n`;
      analysisFields.forEach(field => {
        description += `${field}\n`;
      });
    }

    // 业务问题示例
    const businessQuestions = descriptor.generateBusinessQuestions(model, context);
    if (businessQuestions.length > 0) {
      description += `\n业务能问的问题：\n`;
      businessQuestions.forEach(q => {
        description += `${q}\n`;
      });
    }

    // 关键点
    const keyPoints = [];
    
    // 添加描述符生成的关键点
    const descriptorKeyPoints = descriptor.generateKeyPoints(model, context);
    keyPoints.push(...descriptorKeyPoints);
    
    // 添加外键关联信息
    if (context.foreignKeys.length > 0) {
      keyPoints.push(`${context.foreignKeys[0]} 是关联字段`);
    }
    
    if (keyPoints.length > 0) {
      description += `\n关键点（语义正确）：\n`;
      keyPoints.forEach(point => {
        description += `${point}\n`;
      });
    }

    description += '\n---\n\n';
  });

  return description;
}



// 确保模型已创建（如果还没有）
// 注意：模型需要在 MongoDB 连接后才能使用，但可以在连接前创建
let KnowledgeEntry;
try {
  const models = require('~/db/models');
  KnowledgeEntry = models.KnowledgeEntry;
  if (!KnowledgeEntry) {
    // 如果模型未导出，直接创建
    const createdModels = createModels(mongoose);
    KnowledgeEntry = createdModels.KnowledgeEntry;
  }
} catch (e) {
  // 如果从 db/models 导入失败，直接创建模型
  const createdModels = createModels(mongoose);
  KnowledgeEntry = createdModels.KnowledgeEntry;
}
// 从编译后的包中导入，或使用本地 JavaScript 文件
let KnowledgeType;
try {
  KnowledgeType = require('@because/data-schemas/schema/knowledgeBase').KnowledgeType;
} catch (e) {
  // 如果包中不可用，尝试从本地文件导入
  try {
    KnowledgeType = require('../../../../packages/data-schemas/src/schema/knowledgeBase').KnowledgeType;
  } catch (e2) {
    // 使用硬编码的值作为后备
    KnowledgeType = {
      SEMANTIC_MODEL: 'semantic_model',
      QA_PAIR: 'qa_pair',
      SYNONYM: 'synonym',
      BUSINESS_KNOWLEDGE: 'business_knowledge',
      FILE: 'file',
    };
  }
}
const EmbeddingService = require('./EmbeddingService');
const VectorDBService = require('./VectorDBService');

/**
 * 知识库管理服务
 * 负责管理语义模型、QA对、同义词、业务知识等知识条目
 */
class KnowledgeBaseService {
  constructor() {
    this.embeddingService = new EmbeddingService();
    this.vectorDBService = new VectorDBService();
    this.useVectorDB = process.env.USE_VECTOR_DB !== 'false'; // 默认启用向量数据库
  }

  /**
   * 添加语义模型到知识库
   * @param {Object} params
   * @param {string} params.userId - 用户ID
   * @param {string} params.semanticModelId - 语义模型ID
   * @param {string} params.databaseName - 数据库名称
   * @param {string} params.tableName - 表名
   * @param {string} params.content - 语义模型内容（JSON字符串或文本）
   * @param {string} [params.entityId] - 实体ID
   * @param {string} [params.parentId] - 父级知识条目ID（用于层级结构）
   * @param {boolean} [params.isDatabaseLevel] - 是否为数据库级别的语义模型
   * @returns {Promise<Object>} 创建的知识条目
   */
  async addSemanticModel({ userId, semanticModelId, databaseName, tableName, content, entityId, parentId, isDatabaseLevel = false, semanticDescription = null, title: customTitle = null, modelType = null }) {
    try {
      // 如果提供了自定义标题，使用自定义标题；否则使用默认标题
      const title = customTitle || (isDatabaseLevel 
        ? `数据库语义模型: ${databaseName}`
        : `语义模型: ${databaseName}.${tableName}`);
      
      // 生成向量嵌入（如果失败，允许没有 embedding）
      let embedding = null;
      try {
        embedding = await this.embeddingService.embedText(content, userId);
        logger.debug(`[KnowledgeBaseService] Generated embedding for semantic model: ${semanticModelId}`);
      } catch (embeddingError) {
        logger.warn(`[KnowledgeBaseService] Failed to generate embedding for semantic model ${semanticModelId}, continuing without embedding:`, embeddingError.message);
        // 继续执行，允许没有 embedding 的知识条目
      }

      // 确保 parentId 是正确的格式（ObjectId 或 null）
      let parentIdValue = null;
      if (parentId) {
        // 如果 parentId 是字符串，尝试转换为 ObjectId
        if (typeof parentId === 'string') {
          try {
            const mongoose = require('mongoose');
            parentIdValue = new mongoose.Types.ObjectId(parentId);
            logger.debug(`[KnowledgeBaseService] 转换 parentId 字符串为 ObjectId: ${parentId} -> ${parentIdValue}`);
          } catch (e) {
            logger.warn(`[KnowledgeBaseService] 无效的 parentId 格式: ${parentId}, 将设置为 null`, e);
            parentIdValue = null;
          }
        } else {
          parentIdValue = parentId;
          logger.debug(`[KnowledgeBaseService] parentId 已经是 ObjectId 格式: ${parentIdValue}`);
        }
      } else {
        logger.debug(`[KnowledgeBaseService] parentId 为 null，这是父级条目`);
      }

      const knowledgeEntry = new KnowledgeEntry({
        user: userId,
        type: KnowledgeType.SEMANTIC_MODEL,
        title,
        content,
        embedding,
        parent_id: parentIdValue,
        metadata: {
          semantic_model_id: semanticModelId,
          database_name: databaseName,
          table_name: tableName,
          entity_id: entityId,
          is_database_level: isDatabaseLevel,
          // 语义模型说明（仅用于展示，不参与向量检索）
          semantic_description: semanticDescription || null,
          // 模型类型（如果提供）
          model_type: modelType || null,
        },
      });

      await knowledgeEntry.save();
      
      // 验证 parent_id 是否正确保存
      const savedEntry = await KnowledgeEntry.findById(knowledgeEntry._id).lean();
      if (parentIdValue) {
        logger.info(`[KnowledgeBaseService] 子级条目保存后验证 - _id: ${savedEntry._id}, parent_id: ${savedEntry.parent_id}, parent_id类型: ${typeof savedEntry.parent_id}, 是否为ObjectId: ${savedEntry.parent_id instanceof require('mongoose').Types.ObjectId}`);
      } else {
        logger.info(`[KnowledgeBaseService] 父级条目保存后验证 - _id: ${savedEntry._id}, parent_id: ${savedEntry.parent_id || 'null'}`);
      }
      
      // 同时存储到向量数据库（如果启用且有 embedding）
      // 注意：semantic_description 不参与向量检索，只存储在 MongoDB 中供展示使用
      if (this.useVectorDB && embedding) {
        try {
          await this.vectorDBService.storeKnowledgeVector({
            knowledgeEntryId: knowledgeEntry._id.toString(),
            userId: userId.toString(),
            type: KnowledgeType.SEMANTIC_MODEL,
            content,
            embedding,
            metadata: {
              semantic_model_id: semanticModelId,
              database_name: databaseName,
              table_name: tableName,
              entity_id: entityId,
              is_database_level: isDatabaseLevel,
              parent_id: parentId || null,
              // 不包含 semantic_description，因为它不参与向量检索
            },
          });
        } catch (vectorError) {
          logger.warn('[KnowledgeBaseService] Failed to store vector in VectorDB, continuing with MongoDB only:', vectorError.message);
        }
      }
      
      logger.info(`[KnowledgeBaseService] 添加语义模型: ${semanticModelId}${isDatabaseLevel ? ' (数据库级别)' : ''}${embedding ? ' (with embedding)' : ' (without embedding)'}`);

      // 确保 toObject() 包含 parent_id 字段
      const result = knowledgeEntry.toObject();
      // 验证 parent_id 是否正确包含在返回结果中
      if (parentIdValue) {
        logger.info(`[KnowledgeBaseService] 返回子级条目 - _id: ${result._id}, parent_id: ${result.parent_id || 'null'}, parent_id类型: ${typeof result.parent_id}`);
      } else {
        logger.info(`[KnowledgeBaseService] 返回父级条目 - _id: ${result._id}, parent_id: ${result.parent_id || 'null'}`);
      }
      return result;
    } catch (error) {
      logger.error('[KnowledgeBaseService] 添加语义模型失败:', error);
      throw error;
    }
  }

  /**
   * 批量添加数据库语义模型（包含数据库级别和表级别）
   * @param {Object} params
   * @param {string} params.userId - 用户ID
   * @param {string} params.databaseName - 数据库名称
   * @param {Array} params.semanticModels - 表级别的语义模型数组
   * @param {string} params.databaseContent - 数据库级别的完整内容（JSON字符串）
   * @param {Object} [params.metadata] - 数据库级别的元数据
   * @returns {Promise<Object>} 包含父级和子级的结果
   */
  async addDatabaseSemanticModel({ userId, databaseName, semanticModels, databaseContent, metadata = {} }) {
    try {
      // 生成语义模型说明（仅用于展示，不参与向量检索）
      const semanticDescription = generateSemanticModelDescription({
        databaseName,
        semanticModels,
      });

      // 1. 先创建数据库级别的父模型
      // 使用metadata中的title，如果没有则使用databaseName
      const parentTitle = metadata.title || databaseName;
      const parentEntry = await this.addSemanticModel({
        userId,
        semanticModelId: databaseName,
        databaseName,
        tableName: '', // 数据库级别没有表名
        content: databaseContent,
        isDatabaseLevel: true,
        entityId: metadata.entity_id,
        semanticDescription, // 传递说明文本
        title: parentTitle, // 使用metadata中的title
        modelType: metadata.model_type, // 使用metadata中的model_type
      });

      // 确保 parentId 是正确的 ObjectId 或字符串格式
      // toObject() 返回的对象中，_id 可能是 ObjectId 或字符串
      let parentId = null;
      if (parentEntry._id) {
        parentId = parentEntry._id.toString ? parentEntry._id.toString() : String(parentEntry._id);
      } else if (parentEntry.id) {
        parentId = String(parentEntry.id);
      }
      
      if (!parentId) {
        logger.error(`[KnowledgeBaseService] 无法获取父级模型ID, parentEntry:`, JSON.stringify(parentEntry, null, 2));
        throw new Error('无法获取父级模型ID');
      }

      logger.info(`[KnowledgeBaseService] 创建父级模型: ${databaseName}, parentId: ${parentId}, parentEntry keys: ${Object.keys(parentEntry).join(', ')}`);

      // 2. 批量创建表级别的子模型
      const childEntries = [];
      for (const model of semanticModels) {
        const childEntry = await this.addSemanticModel({
          userId,
          semanticModelId: model.name || model.model,
          databaseName,
          tableName: model.name || model.model,
          content: JSON.stringify(model),
          parentId: parentId, // 使用字符串格式的 parentId
          isDatabaseLevel: false,
          entityId: metadata.entity_id,
        });
        childEntries.push(childEntry);
        logger.info(`[KnowledgeBaseService] 创建子级模型: ${model.name || model.model}, parentId: ${parentId}, childEntry.parent_id: ${childEntry.parent_id || 'null'}, childEntry._id: ${childEntry._id}`);
      }

      logger.info(`[KnowledgeBaseService] 添加数据库语义模型: ${databaseName} (1个父级 + ${childEntries.length}个子级)`);

      return {
        parent: parentEntry,
        children: childEntries,
        total: 1 + childEntries.length,
      };
    } catch (error) {
      logger.error('[KnowledgeBaseService] 添加数据库语义模型失败:', error);
      throw error;
    }
  }

  /**
   * 检查是否存在重复的QA对
   * @param {string} question - 问题文本
   * @param {string} userId - 用户ID
   * @param {string} [entityId] - 实体ID（数据源ID）
   * @param {number} [minScore=0.85] - 最小相似度阈值
   * @returns {Promise<Object|null>} 如果存在重复则返回已存在的QA对，否则返回null
   */
  async checkDuplicateQA({ question, userId, entityId, minScore = 0.85 }) {
    try {
      // 先尝试在MongoDB中直接查找相同的问题（精确匹配）
      const query = {
        type: KnowledgeType.QA_PAIR,
        'metadata.question': question.trim(),
      };
      
      // 如果指定了entityId，在同一数据源内检查；否则检查所有数据源
      if (entityId) {
        query['metadata.entity_id'] = entityId;
      }

      const existingQA = await KnowledgeEntry.findOne(query);
      if (existingQA) {
        logger.debug(`[KnowledgeBaseService] 发现完全相同的QA对（精确匹配）`);
        return existingQA.toObject();
      }

      // 如果没有精确匹配，使用向量相似度搜索（如果启用了向量数据库）
      if (this.useVectorDB) {
        try {
          const questionEmbedding = await this.embeddingService.embedText(question, userId);
          if (questionEmbedding) {
            const similarResults = await this.vectorDBService.searchSimilar({
              queryEmbedding: questionEmbedding,
              type: KnowledgeType.QA_PAIR,
              topK: 1,
              minScore,
              entityId, // 在同一数据源内搜索
            });

            if (similarResults && similarResults.length > 0) {
              const topResult = similarResults[0];
              if (topResult.score >= minScore) {
                logger.debug(`[KnowledgeBaseService] 发现相似的QA对（相似度: ${topResult.score.toFixed(3)}）`);
                // 从MongoDB获取完整信息
                const existingEntry = await KnowledgeEntry.findById(topResult.knowledgeEntryId);
                if (existingEntry) {
                  return existingEntry.toObject();
                }
              }
            }
          }
        } catch (vectorError) {
          logger.warn('[KnowledgeBaseService] 向量相似度检查失败，继续执行:', vectorError.message);
        }
      }

      return null;
    } catch (error) {
      logger.warn('[KnowledgeBaseService] 检查重复QA失败:', error);
      return null; // 出错时不阻止添加
    }
  }

  /**
   * 添加QA对到知识库
   * @param {Object} params
   * @param {string} params.userId - 用户ID
   * @param {string} params.question - 问题
   * @param {string} params.answer - 答案
   * @param {string} [params.entityId] - 实体ID（数据源ID）
   * @param {boolean} [params.skipDuplicateCheck=false] - 是否跳过去重检查
   * @returns {Promise<Object>} 创建的知识条目（如果已存在则返回已存在的条目）
   */
  async addQAPair({ userId, question, answer, entityId, skipDuplicateCheck = false }) {
    try {
      // 去重检查（除非明确跳过）
      if (!skipDuplicateCheck) {
        const duplicate = await this.checkDuplicateQA({ question, userId, entityId });
        if (duplicate) {
          logger.info(`[KnowledgeBaseService] QA对已存在，跳过添加: ${question.substring(0, 30)}...`);
          return duplicate;
        }
      }

      // 将问题和答案组合作为内容
      const content = `问题: ${question}\n答案: ${answer}`;
      const title = `QA: ${question.substring(0, 50)}${question.length > 50 ? '...' : ''}`;

      // 生成向量嵌入（使用问题作为主要向量化内容，如果失败则允许没有 embedding）
      let embedding = null;
      try {
        embedding = await this.embeddingService.embedText(question, userId);
        logger.debug(`[KnowledgeBaseService] Generated embedding for QA pair`);
      } catch (embeddingError) {
        logger.warn(`[KnowledgeBaseService] Failed to generate embedding for QA pair, continuing without embedding:`, embeddingError.message);
      }

      const knowledgeEntry = new KnowledgeEntry({
        user: userId,
        type: KnowledgeType.QA_PAIR,
        title,
        content,
        embedding,
        metadata: {
          question,
          answer,
          entity_id: entityId,
        },
      });

      await knowledgeEntry.save();

      // 同时存储到向量数据库（如果启用且有 embedding）
      if (this.useVectorDB && embedding) {
        try {
          await this.vectorDBService.storeKnowledgeVector({
            knowledgeEntryId: knowledgeEntry._id.toString(),
            userId: userId.toString(),
            type: KnowledgeType.QA_PAIR,
            content,
            embedding,
            metadata: {
              question,
              answer,
              entity_id: entityId,
            },
          });
        } catch (vectorError) {
          logger.warn('[KnowledgeBaseService] Failed to store vector in VectorDB, continuing with MongoDB only:', vectorError.message);
        }
      }

      logger.info(`[KnowledgeBaseService] 添加QA对: ${question.substring(0, 30)}...${embedding ? ' (with embedding)' : ' (without embedding)'}`);

      return knowledgeEntry.toObject();
    } catch (error) {
      logger.error('[KnowledgeBaseService] 添加QA对失败:', error);
      throw error;
    }
  }

  /**
   * 添加同义词到知识库
   * @param {Object} params
   * @param {string} params.userId - 用户ID
   * @param {string} params.noun - 名词
   * @param {string[]} params.synonyms - 同义词数组
   * @param {string} [params.entityId] - 实体ID
   * @returns {Promise<Object>} 创建的知识条目
   */
  async addSynonym({ userId, noun, synonyms, entityId }) {
    try {
      const synonymsText = synonyms.join(', ');
      const content = `名词: ${noun}\n同义词: ${synonymsText}`;
      const title = `同义词: ${noun}`;

      // 生成向量嵌入（使用名词和同义词组合，如果失败则允许没有 embedding）
      let embedding = null;
      try {
        embedding = await this.embeddingService.embedText(content, userId);
        logger.debug(`[KnowledgeBaseService] Generated embedding for synonym`);
      } catch (embeddingError) {
        logger.warn(`[KnowledgeBaseService] Failed to generate embedding for synonym, continuing without embedding:`, embeddingError.message);
      }

      const knowledgeEntry = new KnowledgeEntry({
        user: userId,
        type: KnowledgeType.SYNONYM,
        title,
        content,
        embedding,
        metadata: {
          noun,
          synonyms,
          entity_id: entityId,
        },
      });

      await knowledgeEntry.save();

      // 同时存储到向量数据库（如果启用且有 embedding）
      if (this.useVectorDB && embedding) {
        try {
          await this.vectorDBService.storeKnowledgeVector({
            knowledgeEntryId: knowledgeEntry._id.toString(),
            userId: userId.toString(),
            type: KnowledgeType.SYNONYM,
            content,
            embedding,
            metadata: {
              noun,
              synonyms,
              entity_id: entityId,
            },
          });
        } catch (vectorError) {
          logger.warn('[KnowledgeBaseService] Failed to store vector in VectorDB, continuing with MongoDB only:', vectorError.message);
        }
      }

      logger.info(`[KnowledgeBaseService] 添加同义词: ${noun}${embedding ? ' (with embedding)' : ' (without embedding)'}`);

      return knowledgeEntry.toObject();
    } catch (error) {
      logger.error('[KnowledgeBaseService] 添加同义词失败:', error);
      throw error;
    }
  }

  /**
   * 添加业务知识到知识库
   * @param {Object} params
   * @param {string} params.userId - 用户ID
   * @param {string} params.title - 标题
   * @param {string} params.content - 内容
   * @param {string} [params.category] - 分类
   * @param {string[]} [params.tags] - 标签
   * @param {string} [params.entityId] - 实体ID
   * @returns {Promise<Object>} 创建的知识条目
   */
  async addBusinessKnowledge({ userId, title, content, category, tags, entityId, fileId, filename }) {
    try {
      // 如果有关联的文件，文件已经通过上传 API 向量化，不需要再次生成 embedding
      // 否则，为文本内容生成向量嵌入
      let embedding = null;
      if (!fileId && content) {
        try {
          embedding = await this.embeddingService.embedText(content, userId);
          logger.debug(`[KnowledgeBaseService] Generated embedding for business knowledge`);
        } catch (embeddingError) {
          logger.warn(`[KnowledgeBaseService] Failed to generate embedding for business knowledge, continuing without embedding:`, embeddingError.message);
        }
      } else if (fileId) {
        logger.debug(`[KnowledgeBaseService] Business knowledge linked to file ${fileId}, file already vectorized`);
      }

      const knowledgeEntry = new KnowledgeEntry({
        user: userId,
        type: KnowledgeType.BUSINESS_KNOWLEDGE,
        title,
        content: content || (fileId ? `文档: ${filename || '已上传文档'}` : ''),
        embedding,
        metadata: {
          category,
          tags: tags || [],
          entity_id: entityId,
          file_id: fileId, // 关联的文件ID
          filename: filename, // 文件名
        },
      });

      await knowledgeEntry.save();

      // 同时存储到向量数据库（如果启用且有 embedding）
      // 注意：如果有关联的文件，文件已经通过上传 API 向量化，不需要再次存储
      if (this.useVectorDB && embedding && !fileId) {
        try {
          await this.vectorDBService.storeKnowledgeVector({
            knowledgeEntryId: knowledgeEntry._id.toString(),
            userId: userId.toString(),
            type: KnowledgeType.BUSINESS_KNOWLEDGE,
            content,
            embedding,
            metadata: {
              category,
              tags: tags || [],
              entity_id: entityId,
              file_id: fileId,
              filename: filename,
            },
          });
        } catch (vectorError) {
          logger.warn('[KnowledgeBaseService] Failed to store vector in VectorDB, continuing with MongoDB only:', vectorError.message);
        }
      }

      logger.info(`[KnowledgeBaseService] 添加业务知识: ${title}${embedding ? ' (with embedding)' : ' (without embedding)'}`);

      return knowledgeEntry.toObject();
    } catch (error) {
      logger.error('[KnowledgeBaseService] 添加业务知识失败:', error);
      throw error;
    }
  }

  /**
   * 更新QA对
   * @param {Object} params
   * @param {string} params.entryId - 知识条目ID
   * @param {string} params.userId - 用户ID
   * @param {string} params.question - 问题
   * @param {string} params.answer - 答案
   * @returns {Promise<Object>} 更新后的知识条目
   */
  async updateQAPair({ entryId, userId, question, answer }) {
    try {
      const entry = await KnowledgeEntry.findOne({ _id: entryId, user: userId });
      if (!entry) {
        throw new Error('知识条目不存在或无权修改');
      }

      const content = `问题: ${question}\n答案: ${answer}`;
      const title = `QA: ${question.substring(0, 50)}${question.length > 50 ? '...' : ''}`;

      // 重新生成向量嵌入
      let embedding = null;
      try {
        embedding = await this.embeddingService.embedText(question, userId);
      } catch (embeddingError) {
        logger.warn(`[KnowledgeBaseService] Failed to regenerate embedding for QA pair, continuing without embedding:`, embeddingError.message);
      }

      entry.title = title;
      entry.content = content;
      entry.embedding = embedding;
      entry.metadata = {
        ...entry.metadata,
        question,
        answer,
      };
      entry.updatedAt = new Date();

      await entry.save();

      // 更新向量数据库
      if (this.useVectorDB && embedding) {
        try {
          await this.vectorDBService.updateKnowledgeVector({
            knowledgeEntryId: entry._id.toString(),
            userId: userId.toString(),
            type: KnowledgeType.QA_PAIR,
            content,
            embedding,
            metadata: entry.metadata,
          });
        } catch (vectorError) {
          logger.warn('[KnowledgeBaseService] Failed to update vector in VectorDB:', vectorError.message);
        }
      }

      logger.info(`[KnowledgeBaseService] 更新QA对: ${entryId}`);
      return entry.toObject();
    } catch (error) {
      logger.error('[KnowledgeBaseService] 更新QA对失败:', error);
      throw error;
    }
  }

  /**
   * 更新同义词
   * @param {Object} params
   * @param {string} params.entryId - 知识条目ID
   * @param {string} params.userId - 用户ID
   * @param {string} params.noun - 名词
   * @param {string[]} params.synonyms - 同义词数组
   * @returns {Promise<Object>} 更新后的知识条目
   */
  async updateSynonym({ entryId, userId, noun, synonyms }) {
    try {
      const entry = await KnowledgeEntry.findOne({ _id: entryId, user: userId });
      if (!entry) {
        throw new Error('知识条目不存在或无权修改');
      }

      const synonymsText = synonyms.join(', ');
      const content = `名词: ${noun}\n同义词: ${synonymsText}`;
      const title = `同义词: ${noun}`;

      // 重新生成向量嵌入
      let embedding = null;
      try {
        embedding = await this.embeddingService.embedText(content, userId);
      } catch (embeddingError) {
        logger.warn(`[KnowledgeBaseService] Failed to regenerate embedding for synonym, continuing without embedding:`, embeddingError.message);
      }

      entry.title = title;
      entry.content = content;
      entry.embedding = embedding;
      entry.metadata = {
        ...entry.metadata,
        noun,
        synonyms,
      };
      entry.updatedAt = new Date();

      await entry.save();

      // 更新向量数据库
      if (this.useVectorDB && embedding) {
        try {
          await this.vectorDBService.updateKnowledgeVector({
            knowledgeEntryId: entry._id.toString(),
            userId: userId.toString(),
            type: KnowledgeType.SYNONYM,
            content,
            embedding,
            metadata: entry.metadata,
          });
        } catch (vectorError) {
          logger.warn('[KnowledgeBaseService] Failed to update vector in VectorDB:', vectorError.message);
        }
      }

      logger.info(`[KnowledgeBaseService] 更新同义词: ${entryId}`);
      return entry.toObject();
    } catch (error) {
      logger.error('[KnowledgeBaseService] 更新同义词失败:', error);
      throw error;
    }
  }

  /**
   * 更新业务知识
   * @param {Object} params
   * @param {string} params.entryId - 知识条目ID
   * @param {string} params.userId - 用户ID
   * @param {string} params.title - 标题
   * @param {string} params.content - 内容
   * @param {string} [params.category] - 分类
   * @param {string[]} [params.tags] - 标签
   * @returns {Promise<Object>} 更新后的知识条目
   */
  async updateBusinessKnowledge({ entryId, userId, title, content, category, tags }) {
    try {
      const entry = await KnowledgeEntry.findOne({ _id: entryId, user: userId });
      if (!entry) {
        throw new Error('知识条目不存在或无权修改');
      }

      // 如果有关联的文件，不需要重新生成 embedding
      const fileId = entry.metadata?.file_id;
      let embedding = entry.embedding; // 保留原有 embedding

      if (!fileId && content) {
        // 重新生成向量嵌入
        try {
          embedding = await this.embeddingService.embedText(content, userId);
        } catch (embeddingError) {
          logger.warn(`[KnowledgeBaseService] Failed to regenerate embedding for business knowledge, continuing without embedding:`, embeddingError.message);
        }
      }

      entry.title = title;
      entry.content = content || entry.content;
      entry.embedding = embedding;
      entry.metadata = {
        ...entry.metadata,
        category,
        tags: tags || [],
      };
      entry.updatedAt = new Date();

      await entry.save();

      // 更新向量数据库（如果有关联文件，文件已经向量化，不需要更新）
      if (this.useVectorDB && embedding && !fileId) {
        try {
          await this.vectorDBService.updateKnowledgeVector({
            knowledgeEntryId: entry._id.toString(),
            userId: userId.toString(),
            type: KnowledgeType.BUSINESS_KNOWLEDGE,
            content: entry.content,
            embedding,
            metadata: entry.metadata,
          });
        } catch (vectorError) {
          logger.warn('[KnowledgeBaseService] Failed to update vector in VectorDB:', vectorError.message);
        }
      }

      logger.info(`[KnowledgeBaseService] 更新业务知识: ${entryId}`);
      return entry.toObject();
    } catch (error) {
      logger.error('[KnowledgeBaseService] 更新业务知识失败:', error);
      throw error;
    }
  }

  /**
   * 批量添加知识条目
   * @param {Object} params
   * @param {string} params.userId - 用户ID
   * @param {Array} params.entries - 知识条目数组
   * @returns {Promise<Object[]>} 创建的知识条目数组
   */
  async addKnowledgeEntries({ userId, entries }) {
    try {
      const results = [];

      for (const entry of entries) {
        const { type, ...params } = entry;

        switch (type) {
          case KnowledgeType.SEMANTIC_MODEL:
            results.push(await this.addSemanticModel({ userId, ...params }));
            break;
          case KnowledgeType.QA_PAIR:
            results.push(await this.addQAPair({ userId, ...params }));
            break;
          case KnowledgeType.SYNONYM:
            results.push(await this.addSynonym({ userId, ...params }));
            break;
          case KnowledgeType.BUSINESS_KNOWLEDGE:
            results.push(await this.addBusinessKnowledge({ userId, ...params }));
            break;
          default:
            logger.warn(`[KnowledgeBaseService] 未知的知识类型: ${type}`);
        }
      }

      return results;
    } catch (error) {
      logger.error('[KnowledgeBaseService] 批量添加知识条目失败:', error);
      throw error;
    }
  }

  /**
   * 删除知识条目
   * @param {Object} params
   * @param {string} params.entryId - 知识条目ID
   * @param {string} params.userId - 用户ID（用于权限验证）
   * @returns {Promise<boolean>} 是否删除成功
   */
  async deleteKnowledgeEntry({ entryId, userId }) {
    try {
      // 先获取条目信息，检查是否有子项
      const entry = await KnowledgeEntry.findOne({ _id: entryId, user: userId }).lean();
      if (!entry) {
        logger.warn(`[KnowledgeBaseService] 删除失败：未找到知识条目 ${entryId}`);
        return false;
      }

      // 如果删除的是父级（parent_id 为 null），同时删除所有子项
      if (!entry.parent_id) {
        const children = await KnowledgeEntry.find({
          parent_id: entryId,
          user: userId,
        }).lean();

        logger.info(`[KnowledgeBaseService] 删除父级条目 ${entryId}，同时删除 ${children.length} 个子项`);

        // 删除所有子项的向量（如果启用）
        if (this.useVectorDB && children.length > 0) {
          for (const child of children) {
            try {
              await this.vectorDBService.deleteKnowledgeVector(child._id.toString(), child.type);
            } catch (vectorError) {
              logger.warn(`[KnowledgeBaseService] Failed to delete child vector from VectorDB: ${child._id}`, vectorError.message);
            }
          }
        }

        // 删除所有子项
        const childrenDeleteResult = await KnowledgeEntry.deleteMany({
          parent_id: entryId,
          user: userId,
        });
        logger.info(`[KnowledgeBaseService] 已删除 ${childrenDeleteResult.deletedCount} 个子项`);
      }

      // 删除主条目
      const result = await KnowledgeEntry.deleteOne({
        _id: entryId,
        user: userId,
      });

      if (result.deletedCount > 0) {
        // 同时从向量数据库删除（如果启用）
        if (this.useVectorDB) {
          try {
            await this.vectorDBService.deleteKnowledgeVector(entryId.toString(), entry.type);
          } catch (vectorError) {
            logger.warn('[KnowledgeBaseService] Failed to delete vector from VectorDB:', vectorError.message);
          }
        }

        logger.info(`[KnowledgeBaseService] 删除知识条目: ${entryId} (类型: ${entry.type})`);
        return true;
      }

      return false;
    } catch (error) {
      logger.error('[KnowledgeBaseService] 删除知识条目失败:', error);
      throw error;
    }
  }

  /**
   * 获取知识条目列表
   * 
   * @param {Object} params
   * @param {string} [params.userId] - 用户ID（可选，用于过滤特定用户创建的知识）
   * @param {string} [params.type] - 知识类型过滤
   * @param {string} [params.entityId] - 实体ID过滤
   * @param {boolean} [params.includeChildren] - 是否包含子项（默认只返回父级）
   * @param {number} [params.limit] - 限制数量
   * @param {number} [params.skip] - 跳过数量
   * @returns {Promise<Object[]>} 知识条目数组
   */
  async getKnowledgeEntries({ userId, type, entityId, includeChildren = false, limit = 100, skip = 0 }) {
    try {
      const query = {};

      // userId改为可选，如果提供则过滤，否则查询所有
      if (userId) {
        query.user = userId;
      }

      if (type) {
        query.type = type;
      }

      if (entityId) {
        query['metadata.entity_id'] = entityId;
      }

      // 无论 includeChildren 是否为 true，查询时都只返回父级（parent_id 为 null 或不存在的条目）
      // 如果 includeChildren 为 true，会在后面单独加载子项
      // 在 MongoDB 中，由于 schema 中 parent_id 的 default 是 null，所以父级条目的 parent_id 都是 null
      // 直接查询 parent_id 为 null 即可（这会匹配字段值为 null 的情况）
      // 如果字段不存在，使用 $in: [null] 可以同时匹配 null 和不存在的字段
      query.$and = query.$and || [];
      query.$and.push({
        $or: [
          { parent_id: null },
          { parent_id: { $exists: false } }
        ]
      });

      const entries = await KnowledgeEntry.find(query)
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(skip)
        .lean();

      logger.info(`[KnowledgeBaseService] 查询父级结果: ${entries.length} 条，includeChildren: ${includeChildren}, type: ${type}, query: ${JSON.stringify(query)}`);
      if (entries.length > 0 && type === 'semantic_model') {
        entries.forEach((entry, index) => {
          logger.info(`[KnowledgeBaseService] 父级条目 ${index + 1}: _id=${entry._id}, parent_id=${entry.parent_id || 'null'}, title=${entry.title}`);
        });
      } else if (entries.length === 0 && type === 'semantic_model') {
        // 如果查询结果为空，尝试查询所有条目看看是否有数据
        const allEntriesQuery = { type: type };
        if (userId) {
          allEntriesQuery.user = userId;
        }
        const allEntries = await KnowledgeEntry.find(allEntriesQuery).limit(5).lean();
        logger.warn(`[KnowledgeBaseService] 查询父级结果为空，但数据库中有 ${allEntries.length} 条语义模型条目（前5条）`);
        allEntries.forEach((entry, index) => {
          logger.warn(`[KnowledgeBaseService] 条目 ${index + 1}: _id=${entry._id}, parent_id=${entry.parent_id || 'null'}, title=${entry.title}`);
        });
      }

      // 如果请求包含子项，为每个父级加载子项
      if (includeChildren && entries.length > 0) {
        const mongoose = require('mongoose');
        const parentIds = entries
          .filter(e => !e.parent_id)
          .map(e => {
            // 确保 _id 是 ObjectId 格式
            if (e._id instanceof mongoose.Types.ObjectId) {
              return e._id;
            }
            return new mongoose.Types.ObjectId(e._id);
          });
        
        if (parentIds.length > 0) {
          const childrenQuery = {
            parent_id: { $in: parentIds },
          };
          
          // userId改为可选
          if (userId) {
            childrenQuery.user = userId;
          }
          
          // 如果提供了 entityId，子项查询也需要过滤 entityId，确保数据源隔离
          if (entityId) {
            childrenQuery['metadata.entity_id'] = entityId;
          }
          
          const children = await KnowledgeEntry.find(childrenQuery)
            .sort({ createdAt: -1 })
            .lean();

          // 将子项附加到父级
          const childrenMap = new Map();
          children.forEach(child => {
            const parentId = child.parent_id?.toString();
            if (parentId) {
              if (!childrenMap.has(parentId)) {
                childrenMap.set(parentId, []);
              }
              childrenMap.get(parentId).push(child);
            }
          });

          entries.forEach(entry => {
            const entryId = entry._id.toString();
            if (childrenMap.has(entryId)) {
              entry.children = childrenMap.get(entryId);
              logger.debug(`[KnowledgeBaseService] 条目 ${entry.title} 有 ${entry.children.length} 个子项`);
            } else {
              entry.children = []; // 确保所有条目都有 children 字段
            }
          });
          
          logger.info(`[KnowledgeBaseService] 加载子项完成，共 ${entries.length} 个父级，${children.length} 个子项`);
        } else {
          // 如果没有父级，确保所有条目都有 children 字段
          entries.forEach(entry => {
            entry.children = [];
          });
        }
      } else {
        // 如果不需要子项，确保所有条目都没有 children 字段（或设为空数组）
        entries.forEach(entry => {
          entry.children = [];
        });
      }

      logger.info(`[KnowledgeBaseService] 最终返回 ${entries.length} 条条目（全部为父级）`);
      return entries;
    } catch (error) {
      logger.error('[KnowledgeBaseService] 获取知识条目失败:', error);
      throw error;
    }
  }
}

module.exports = KnowledgeBaseService;

