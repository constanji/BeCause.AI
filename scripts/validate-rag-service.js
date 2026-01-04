const axios = require('axios');
const fs = require('fs').promises;

const BASE_URL = process.env.API_URL || 'http://localhost:1145';
const TOKEN = process.env.JWT_TOKEN || 'your_jwt_token';

class RAGValidator {
  constructor() {
    this.baseUrl = BASE_URL;
    this.token = TOKEN;
    this.results = [];
  }

  async query(query, options = {}) {
    try {
      const startTime = Date.now();
      const response = await axios.post(
        `${this.baseUrl}/api/rag/query`,
        { query, options },
        {
          headers: {
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      const duration = Date.now() - startTime;
      
      return {
        success: true,
        data: response.data,
        duration,
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data || error.message,
        duration: null,
      };
    }
  }

  async testCase(name, query, options = {}, expectedMinResults = 1) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`测试用例: ${name}`);
    console.log(`查询: "${query}"`);
    console.log('='.repeat(60));

    const result = await this.query(query, options);
    
    if (!result.success) {
      console.error('❌ 查询失败:', result.error);
      this.results.push({ name, success: false, error: result.error });
      return result;
    }

    const { data, duration } = result;
    const scores = data.results.map(r => r.score);
    
    console.log(`✅ 查询成功`);
    console.log(`响应时间: ${duration}ms`);
    console.log(`返回结果数: ${data.total}`);
    console.log(`检索结果数（重排前）: ${data.metadata.retrievalCount}`);
    console.log(`是否重排: ${data.metadata.reranked ? '是' : '否'}`);
    
    if (scores.length > 0) {
      console.log(`\n相似度分数:`);
      console.log(`  最高: ${Math.max(...scores).toFixed(4)}`);
      console.log(`  最低: ${Math.min(...scores).toFixed(4)}`);
      console.log(`  平均: ${(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(4)}`);
    }

    console.log(`\n前3个结果:`);
    data.results.slice(0, 3).forEach((r, i) => {
      console.log(`  ${i + 1}. [${r.type}] ${r.title.substring(0, 50)}... (score: ${r.score.toFixed(4)})`);
    });

    const passed = data.total >= expectedMinResults;
    this.results.push({
      name,
      success: passed,
      total: data.total,
      duration,
      avgScore: scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0,
    });

    console.log(passed ? '✅ 测试通过' : '❌ 测试失败（结果数不足）');
    
    return result;
  }

  async runAllTests() {
    console.log('🚀 开始RAG服务验证测试\n');

    // 测试用例1：基础查询
    await this.testCase(
      '基础查询测试',
      '如何查询订单数据？',
      { topK: 10, useReranking: true }
    );

    // 测试用例2：QA对检索
    await this.testCase(
      'QA对检索测试',
      '订单查询方法',
      { types: ['qa_pair'], topK: 5 }
    );

    // 测试用例3：语义模型检索
    await this.testCase(
      '语义模型检索测试',
      '订单表结构',
      { types: ['semantic_model'], topK: 5 }
    );

    // 测试用例4：同义词检索
    await this.testCase(
      '同义词检索测试',
      '订单',
      { types: ['synonym'], topK: 5 }
    );

    // 测试用例5：业务知识检索
    await this.testCase(
      '业务知识检索测试',
      '销售流程',
      { types: ['business_knowledge'], topK: 5 }
    );

    // 测试用例6：混合检索
    await this.testCase(
      '混合检索测试',
      '订单相关',
      {
        types: ['semantic_model', 'qa_pair', 'business_knowledge'],
        topK: 10,
        useReranking: true,
      }
    );

    // 测试用例7：增强重排
    await this.testCase(
      '增强重排测试',
      '订单查询',
      {
        topK: 10,
        useReranking: true,
        enhancedReranking: true,
      }
    );

    // 测试用例8：数据源隔离
    await this.testCase(
      '数据源隔离测试',
      '订单数据',
      {
        entityId: 'entity_001',
        topK: 5,
      }
    );

    // 输出总结
    this.printSummary();
  }

  printSummary() {
    console.log(`\n${'='.repeat(60)}`);
    console.log('测试总结');
    console.log('='.repeat(60));

    const total = this.results.length;
    const passed = this.results.filter(r => r.success).length;
    const failed = total - passed;

    console.log(`总测试数: ${total}`);
    console.log(`通过: ${passed} ✅`);
    console.log(`失败: ${failed} ${failed > 0 ? '❌' : ''}`);

    if (this.results.length > 0) {
      const durations = this.results.filter(r => r.duration);
      const scores = this.results.filter(r => r.avgScore > 0);
      
      if (durations.length > 0) {
        const avgDuration = durations.reduce((sum, r) => sum + r.duration, 0) / durations.length;
        console.log(`\n平均响应时间: ${avgDuration.toFixed(2)}ms`);
      }
      
      if (scores.length > 0) {
        const avgScore = scores.reduce((sum, r) => sum + r.avgScore, 0) / scores.length;
        console.log(`平均相似度分数: ${avgScore.toFixed(4)}`);
      }
    }

    console.log(`\n详细结果:`);
    this.results.forEach(r => {
      const icon = r.success ? '✅' : '❌';
      console.log(`  ${icon} ${r.name}: ${r.success ? '通过' : '失败'} ${r.duration ? `(${r.duration}ms)` : ''}`);
    });
  }

  async saveReport(filepath = 'rag-validation-report.json') {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        total: this.results.length,
        passed: this.results.filter(r => r.success).length,
        failed: this.results.filter(r => !r.success).length,
      },
      results: this.results,
    };

    await fs.writeFile(filepath, JSON.stringify(report, null, 2));
    console.log(`\n报告已保存到: ${filepath}`);
  }
}

// 运行验证
async function main() {
  const validator = new RAGValidator();
  
  try {
    await validator.runAllTests();
    await validator.saveReport('rag-validation-report.json');
  } catch (error) {
    console.error('验证过程出错:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = RAGValidator;

