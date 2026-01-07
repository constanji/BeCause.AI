import React, { useState, useEffect } from 'react';
import { Button, useToastContext, Spinner } from '@because/client';
import { useLocalize, useAuthContext } from '~/hooks';
import { ArrowLeft, Database, RefreshCw, Download, FileText } from 'lucide-react';
import { cn } from '~/utils';
import { dataService } from '@because/data-provider';
import type { DataSource } from '@because/data-provider';

interface SemanticModelConfigProps {
  dataSourceId: string;
  onBack: () => void;
}

interface DatabaseSchema {
  success: boolean;
  database: string;
  schema: Record<string, {
    columns: Array<{
      column_name: string;
      data_type: string;
      is_nullable: boolean | string;
      column_key: string;
      column_comment: string;
      column_default: any;
    }>;
    indexes: Array<{
      index_name: string;
      column_name: string;
      non_unique: number;
    }>;
  }>;
}

export default function SemanticModelConfig({ dataSourceId, onBack }: SemanticModelConfigProps) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [dataSource, setDataSource] = useState<DataSource | null>(null);
  const [schema, setSchema] = useState<DatabaseSchema | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingSchema, setLoadingSchema] = useState(false);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [generatedYAML, setGeneratedYAML] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    loadDataSource();
  }, [dataSourceId]);

  const loadDataSource = async () => {
    try {
      setLoading(true);
      const response = await dataService.getDataSourceById({ id: dataSourceId });
      setDataSource(response.data);
      // 数据源加载成功后，自动加载数据库结构
      if (response.data) {
        loadSchema();
      }
    } catch (error) {
      showToast({
        message: `加载数据源失败: ${error instanceof Error ? error.message : '未知错误'}`,
        status: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  const loadSchema = async () => {
    try {
      setLoadingSchema(true);
      const response = await dataService.getDataSourceSchema({ id: dataSourceId });
      if (response.success && response.data) {
        setSchema(response.data);
      } else {
        showToast({
          message: response.error || '获取数据库结构失败',
          status: 'error',
        });
      }
    } catch (error) {
      showToast({
        message: `获取数据库结构失败: ${error instanceof Error ? error.message : '未知错误'}`,
        status: 'error',
      });
    } finally {
      setLoadingSchema(false);
    }
  };

  const handleGenerateSemanticModel = async () => {
    try {
      setGenerating(true);
      const response = await dataService.generateSemanticModel({ 
        id: dataSourceId,
        userInput: {}
      });
      
      if (response.success && response.data) {
        setGeneratedYAML(response.data.yaml);
        showToast({
          message: `语义模型生成成功，共包含 ${response.data.tableCount} 张表`,
          status: 'success',
        });
      } else {
        showToast({
          message: response.error || '生成语义模型失败',
          status: 'error',
        });
      }
    } catch (error) {
      showToast({
        message: `生成语义模型失败: ${error instanceof Error ? error.message : '未知错误'}`,
        status: 'error',
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleDownloadYAML = () => {
    if (!generatedYAML) {
      showToast({
        message: '请先生成语义模型',
        status: 'warning',
      });
      return;
    }

    const blob = new Blob([generatedYAML], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `semantic_model_${dataSource?.database || 'unknown'}_${new Date().toISOString().split('T')[0]}.yaml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast({
      message: 'YAML文件已下载',
      status: 'success',
    });
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="text-text-primary" />
      </div>
    );
  }

  if (!dataSource) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <p className="text-text-secondary mb-4">数据源不存在</p>
          <Button onClick={onBack} className="btn btn-primary">
            返回
          </Button>
        </div>
      </div>
    );
  }

  const tables = schema ? Object.keys(schema.schema) : [];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            onClick={onBack}
            variant="ghost"
            className="btn btn-neutral border-token-border-light relative flex items-center gap-2 rounded-lg px-3 py-2"
          >
            <ArrowLeft className="h-4 w-4" />
            返回
          </Button>
          <div>
            <h2 className="text-xl font-semibold text-text-primary">数据源结构</h2>
            <p className="mt-1 text-sm text-text-secondary">
              {dataSource.name} ({dataSource.type.toUpperCase()})
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={loadSchema}
            disabled={loadingSchema}
            className="btn btn-secondary relative flex items-center gap-2 rounded-lg px-3 py-2"
          >
            {loadingSchema ? (
              <Spinner className="h-4 w-4" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            刷新结构
          </Button>
          <Button
            onClick={handleGenerateSemanticModel}
            disabled={!schema || tables.length === 0 || generating}
            className="btn btn-primary relative flex items-center gap-2 rounded-lg px-3 py-2"
          >
            {generating ? (
              <Spinner className="h-4 w-4" />
            ) : (
              <Database className="h-4 w-4" />
            )}
            {generating ? '生成中...' : '生成语义模型'}
          </Button>
          {generatedYAML && (
            <Button
              onClick={handleDownloadYAML}
              className="btn btn-secondary relative flex items-center gap-2 rounded-lg px-3 py-2"
            >
              <Download className="h-4 w-4" />
              下载YAML
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {!schema ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <p className="text-text-secondary mb-4">
                {loadingSchema ? '正在加载数据库结构...' : '尚未加载数据库结构'}
              </p>
              {!loadingSchema && (
                <Button
                  onClick={loadSchema}
                  disabled={loadingSchema}
                  className="btn btn-primary relative flex items-center gap-2 rounded-lg px-3 py-2"
                >
                  <Database className="h-4 w-4" />
                  加载数据库结构
                </Button>
              )}
              {loadingSchema && (
                <div className="flex items-center justify-center gap-2">
                  <Spinner className="h-4 w-4" />
                  <span className="text-text-secondary">加载中...</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {generatedYAML && (
              <div className="rounded-lg border border-border-light bg-surface-primary p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-text-primary">生成的语义模型YAML</h3>
                  <Button
                    onClick={handleDownloadYAML}
                    className="btn btn-secondary relative flex items-center gap-2 rounded-lg px-3 py-2"
                  >
                    <Download className="h-4 w-4" />
                    下载
                  </Button>
                </div>
                <div className="bg-surface-secondary rounded p-4 max-h-96 overflow-auto">
                  <pre className="text-sm text-text-primary whitespace-pre-wrap font-mono">
                    {generatedYAML}
                  </pre>
                </div>
              </div>
            )}
            <div className="rounded-lg border border-border-light bg-surface-primary p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-text-primary">数据库表结构</h3>
                <div className="text-sm text-text-secondary">
                  共 {tables.length} 张表
                </div>
              </div>
              <div className="space-y-2">
                {tables.map((tableName) => {
                  const tableInfo = schema.schema[tableName];
                  const isSelected = selectedTable === tableName;
                  return (
                    <div
                      key={tableName}
                      className={cn(
                        'rounded-lg border p-4 cursor-pointer transition-colors',
                        isSelected
                          ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                          : 'border-border-light bg-surface-secondary hover:bg-surface-hover',
                      )}
                      onClick={() => setSelectedTable(isSelected ? null : tableName)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium text-text-primary">{tableName}</h4>
                        <div className="text-xs text-text-secondary">
                          {tableInfo.columns.length} 列
                        </div>
                      </div>
                      {isSelected && (
                        <div className="mt-3 space-y-2">
                          <div className="text-sm font-medium text-text-secondary mb-2">列信息:</div>
                          <div className="grid grid-cols-2 gap-2">
                            {tableInfo.columns.map((col) => (
                              <div
                                key={col.column_name}
                                className="text-xs p-2 rounded bg-surface-secondary border border-border-light"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-text-primary">
                                    {col.column_name}
                                  </span>
                                  <span className="text-text-secondary">({col.data_type})</span>
                                  {col.column_key === 'PRI' && (
                                    <span className="px-1 py-0.5 text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 rounded">
                                      主键
                                    </span>
                                  )}
                                  {col.column_key === 'UNI' && (
                                    <span className="px-1 py-0.5 text-xs bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 rounded">
                                      唯一
                                    </span>
                                  )}
                                </div>
                                {col.column_comment && (
                                  <div className="text-text-secondary mt-1">
                                    {col.column_comment}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

