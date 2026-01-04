#!/usr/bin/env node

/**
 * 验证文件向量化服务的前提条件
 * 
 * 验证项：
 * 1. Postgres pgvector 扩展是否启用
 * 2. file_vectors 表结构是否正确
 * 3. ONNX 模型输出维度与数据库配置是否匹配
 * 4. parseText 支持的文件类型
 */

const path = require('path');

// 设置环境变量路径（如果需要）
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function verifySetup() {
  console.log('🔍 验证文件向量化服务配置...\n');
  const errors = [];
  const warnings = [];

  // 1. 验证数据库连接和表结构
  try {
    console.log('1️⃣ 验证数据库连接和表结构...');
    const VectorDBService = require('../api/server/services/RAG/VectorDBService');
    const vectorDB = new VectorDBService();
    await vectorDB.initialize();
    const pool = vectorDB.getPool();

    // 检查 pgvector 扩展
    const extResult = await pool.query(
      "SELECT * FROM pg_extension WHERE extname = 'vector'"
    );
    if (extResult.rows.length > 0) {
      console.log('   ✅ pgvector 扩展已启用');
    } else {
      errors.push('pgvector 扩展未启用');
      console.log('   ❌ pgvector 扩展未启用');
    }

    // 检查 file_vectors 表
    const tableResult = await pool.query(`
      SELECT column_name, data_type, udt_name 
      FROM information_schema.columns 
      WHERE table_name = 'file_vectors' AND column_name = 'embedding'
    `);
    if (tableResult.rows.length > 0) {
      const col = tableResult.rows[0];
      const dimension = col.udt_name.match(/vector\((\d+)\)/)?.[1] || 'unknown';
      console.log(`   ✅ file_vectors 表存在，embedding 类型: ${col.udt_name} (维度: ${dimension})`);
    } else {
      errors.push('file_vectors 表不存在或 embedding 列不存在');
      console.log('   ❌ file_vectors 表不存在或 embedding 列不存在');
    }

    // 检查表结构完整性
    const allColumns = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'file_vectors'
      ORDER BY ordinal_position
    `);
    const requiredColumns = ['id', 'file_id', 'user_id', 'entity_id', 'chunk_index', 'content', 'embedding', 'metadata', 'created_at'];
    const existingColumns = allColumns.rows.map(r => r.column_name);
    const missingColumns = requiredColumns.filter(col => !existingColumns.includes(col));
    
    if (missingColumns.length === 0) {
      console.log('   ✅ 表结构完整，所有必需字段都存在');
    } else {
      warnings.push(`file_vectors 表缺少字段: ${missingColumns.join(', ')}`);
      console.log(`   ⚠️  表缺少字段: ${missingColumns.join(', ')}`);
    }
  } catch (error) {
    errors.push(`数据库验证失败: ${error.message}`);
    console.log(`   ❌ 数据库验证失败: ${error.message}`);
  }

  // 2. 验证 ONNX 模型维度
  try {
    console.log('\n2️⃣ 验证 ONNX 模型...');
    const ONNXEmbeddingService = require('../api/server/services/RAG/ONNXEmbeddingService');
    const embeddingService = new ONNXEmbeddingService();
    await embeddingService.initialize();
    const embedding = await embeddingService.embedText('测试文本');
    const actualDimension = embedding.length;
    console.log(`   ✅ ONNX 模型输出维度: ${actualDimension}`);

    // 检查维度是否匹配
    const expectedDim = parseInt(process.env.EMBEDDING_DIMENSION || '512', 10);
    if (actualDimension === expectedDim) {
      console.log(`   ✅ 维度匹配 (${expectedDim})`);
    } else {
      errors.push(`维度不匹配: 模型输出 ${actualDimension}，配置期望 ${expectedDim}`);
      console.log(`   ❌ 维度不匹配: 模型输出 ${actualDimension}，配置期望 ${expectedDim}`);
      console.log(`   💡 请设置 EMBEDDING_DIMENSION=${actualDimension} 或更换模型`);
    }

    // 验证向量格式
    if (Array.isArray(embedding) && embedding.every(v => typeof v === 'number')) {
      console.log('   ✅ 向量格式正确（数字数组）');
    } else {
      errors.push('向量格式错误：应为数字数组');
      console.log('   ❌ 向量格式错误：应为数字数组');
    }
  } catch (error) {
    if (error.message.includes('not found')) {
      warnings.push(`ONNX 模型文件未找到: ${error.message}`);
      console.log(`   ⚠️  ONNX 模型文件未找到: ${error.message}`);
      console.log('   💡 请确保模型文件存在于 api/server/services/RAG/onnx/embedding/resources/');
    } else if (error.message.includes('@xenova/transformers')) {
      warnings.push('缺少依赖: @xenova/transformers');
      console.log(`   ⚠️  缺少依赖: ${error.message}`);
      console.log('   💡 请运行: cd api && npm install @xenova/transformers');
    } else {
      errors.push(`ONNX 模型验证失败: ${error.message}`);
      console.log(`   ❌ ONNX 模型验证失败: ${error.message}`);
    }
  }

  // 3. 验证文件解析支持
  console.log('\n3️⃣ 文件类型支持:');
  console.log('   ✅ 纯文本文件 (.txt, .md, .json, .csv, .html, .xml, .log 等)');
  console.log('   ✅ 代码文件 (.js, .ts, .py, .java, .cpp, .c, .php, .rb 等)');
  console.log('   ✅ 配置文件 (.yaml, .yml, .toml, .ini, .conf 等)');
  
  if (process.env.RAG_API_URL) {
    console.log('   ✅ PDF/Word/Excel (通过外部 RAG API)');
    console.log(`   📍 RAG_API_URL: ${process.env.RAG_API_URL}`);
  } else {
    warnings.push('未配置 RAG_API_URL，PDF/Word/Excel 文件可能无法解析');
    console.log('   ⚠️  PDF/Word/Excel (需要配置 RAG_API_URL)');
    console.log('   💡 本地 parseTextNative 仅支持纯文本文件');
  }

  // 4. 验证配置参数
  console.log('\n4️⃣ 配置参数:');
  const chunkSize = parseInt(process.env.RAG_CHUNK_SIZE || '1500', 10);
  const chunkOverlap = parseInt(process.env.RAG_CHUNK_OVERLAP || '100', 10);
  const batchSize = parseInt(process.env.RAG_EMBEDDING_BATCH_SIZE || '50', 10);
  console.log(`   📊 分块大小: ${chunkSize} 字符`);
  console.log(`   📊 块重叠: ${chunkOverlap} 字符`);
  console.log(`   📊 批量大小: ${batchSize} 块/批`);
  if (batchSize === 0) {
    console.log('   ⚠️  批量处理已禁用（所有块一次性处理）');
  }

  // 总结
  console.log('\n' + '='.repeat(50));
  if (errors.length === 0 && warnings.length === 0) {
    console.log('✅ 所有验证通过！文件向量化服务已就绪。');
    process.exit(0);
  } else {
    if (errors.length > 0) {
      console.log('❌ 发现错误:');
      errors.forEach((err, i) => console.log(`   ${i + 1}. ${err}`));
    }
    if (warnings.length > 0) {
      console.log('\n⚠️  警告:');
      warnings.forEach((warn, i) => console.log(`   ${i + 1}. ${warn}`));
    }
    console.log('\n💡 请根据上述信息修复问题后重试。');
    process.exit(errors.length > 0 ? 1 : 0);
  }
}

// 运行验证
verifySetup().catch(error => {
  console.error('❌ 验证过程出错:', error);
  console.error(error.stack);
  process.exit(1);
});

