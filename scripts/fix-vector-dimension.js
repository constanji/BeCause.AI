#!/usr/bin/env node

/**
 * 修复 file_vectors 表的 embedding 列维度
 * 如果维度不匹配，会自动修复
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function fixDimension() {
  console.log('🔧 修复 file_vectors 表维度...\n');

  const expectedDim = parseInt(process.env.EMBEDDING_DIMENSION || '512', 10);
  console.log(`目标维度: ${expectedDim}\n`);

  try {
    const VectorDBService = require('../api/server/services/RAG/VectorDBService');
    const vectorDB = new VectorDBService();
    await vectorDB.initialize();
    const pool = vectorDB.getPool();

    // 检查当前维度
    console.log('1️⃣ 检查当前表结构...');
    const checkResult = await pool.query(`
      SELECT 
        pg_catalog.format_type(a.atttypid, a.atttypmod) as formatted_type
      FROM pg_catalog.pg_attribute a
      JOIN pg_catalog.pg_class c ON a.attrelid = c.oid
      JOIN pg_catalog.pg_namespace n ON c.relnamespace = n.oid
      WHERE n.nspname = 'public'
        AND c.relname = 'file_vectors'
        AND a.attname = 'embedding'
    `);

    if (checkResult.rows.length === 0) {
      console.log('   ❌ file_vectors 表或 embedding 列不存在');
      console.log('   💡 表会在首次使用时自动创建');
      await pool.end();
      process.exit(1);
    }

    const currentType = checkResult.rows[0].formatted_type;
    console.log(`   当前类型: ${currentType}`);

    const match = currentType.match(/vector\((\d+)\)/);
    const currentDim = match ? parseInt(match[1], 10) : null;

    if (!currentDim) {
      console.log('   ⚠️  无法确定当前维度，可能需要修复');
      console.log(`   🔧 尝试修复为 vector(${expectedDim})...`);
      
      // 删除索引（如果存在）
      try {
        await pool.query('DROP INDEX IF EXISTS idx_file_vectors_embedding_hnsw');
        console.log('   ✅ 已删除旧索引');
      } catch (err) {
        console.log(`   ℹ️  删除索引时出错（可能不存在）: ${err.message}`);
      }

      // 修改列类型
      await pool.query(`
        ALTER TABLE file_vectors 
        ALTER COLUMN embedding TYPE vector(${expectedDim})
      `);
      console.log(`   ✅ 已修复为 vector(${expectedDim})`);

      // 重新创建索引
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_file_vectors_embedding_hnsw 
        ON file_vectors 
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
      `);
      console.log('   ✅ 已重新创建索引');

    } else if (currentDim !== expectedDim) {
      console.log(`   ⚠️  维度不匹配: 当前 ${currentDim}，期望 ${expectedDim}`);
      console.log(`   🔧 修复维度...`);

      // 检查是否有数据
      const countResult = await pool.query('SELECT COUNT(*) as count FROM file_vectors');
      const count = parseInt(countResult.rows[0].count, 10);

      if (count > 0) {
        console.log(`   ⚠️  表中有 ${count} 条数据，修改维度会导致数据丢失`);
        console.log('   💡 建议先备份数据或清空表');
        const readline = require('readline');
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });

        const answer = await new Promise((resolve) => {
          rl.question('   是否继续？这将删除所有现有向量数据 (y/N): ', resolve);
        });
        rl.close();

        if (answer.toLowerCase() !== 'y') {
          console.log('   ❌ 已取消');
          await pool.end();
          process.exit(0);
        }

        // 清空表
        await pool.query('DELETE FROM file_vectors');
        console.log('   ✅ 已清空表数据');
      }

      // 删除索引
      try {
        await pool.query('DROP INDEX IF EXISTS idx_file_vectors_embedding_hnsw');
        console.log('   ✅ 已删除旧索引');
      } catch (err) {
        console.log(`   ℹ️  删除索引时出错: ${err.message}`);
      }

      // 修改列类型
      await pool.query(`
        ALTER TABLE file_vectors 
        ALTER COLUMN embedding TYPE vector(${expectedDim})
      `);
      console.log(`   ✅ 已修复为 vector(${expectedDim})`);

      // 重新创建索引
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_file_vectors_embedding_hnsw 
        ON file_vectors 
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
      `);
      console.log('   ✅ 已重新创建索引');

    } else {
      console.log(`   ✅ 维度已正确 (${currentDim})`);
    }

    // 验证修复结果
    console.log('\n2️⃣ 验证修复结果...');
    const verifyResult = await pool.query(`
      SELECT 
        pg_catalog.format_type(a.atttypid, a.atttypmod) as formatted_type
      FROM pg_catalog.pg_attribute a
      JOIN pg_catalog.pg_class c ON a.attrelid = c.oid
      JOIN pg_catalog.pg_namespace n ON c.relnamespace = n.oid
      WHERE n.nspname = 'public'
        AND c.relname = 'file_vectors'
        AND a.attname = 'embedding'
    `);

    const finalType = verifyResult.rows[0].formatted_type;
    const finalMatch = finalType.match(/vector\((\d+)\)/);
    const finalDim = finalMatch ? parseInt(finalMatch[1], 10) : null;

    if (finalDim === expectedDim) {
      console.log(`   ✅ 验证通过: ${finalType}`);
    } else {
      console.log(`   ❌ 验证失败: ${finalType}`);
      await pool.end();
      process.exit(1);
    }

    await pool.end();
    console.log('\n✅ 修复完成！');
    process.exit(0);

  } catch (error) {
    console.error('❌ 修复失败:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

fixDimension();

