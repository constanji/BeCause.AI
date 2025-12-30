import React, { useState } from 'react';
import { Database, MessageSquare, BookOpen, FileText, Plus, Trash2, Eye, Upload, X, ChevronRight, ChevronDown, Folder, FolderOpen } from 'lucide-react';
import * as yaml from 'js-yaml';
import { Button, useToastContext } from '@because/client';
import {
  useListKnowledgeQuery,
  useAddKnowledgeMutation,
  useDeleteKnowledgeMutation,
} from '~/data-provider';
import { dataService } from '@because/data-provider';
import { cn } from '~/utils';

// 类型定义
type KnowledgeEntry = {
  _id: string;
  user: string;
  type: 'semantic_model' | 'qa_pair' | 'synonym' | 'business_knowledge' | 'file';
  title: string;
  content: string;
  embedding?: number[];
  parent_id?: string; // 父级知识条目ID
  metadata?: Record<string, any>;
  children?: KnowledgeEntry[]; // 子项（用于层级展示）
  createdAt?: string;
  updatedAt?: string;
};

type AddKnowledgeRequest = {
  type: string;
  data: Record<string, any>;
};

type KnowledgeType = 'semantic_model' | 'qa_pair' | 'synonym' | 'business_knowledge';

interface TabConfig {
  id: KnowledgeType;
  label: string;
  icon: React.ReactNode;
}

const tabs: TabConfig[] = [
  { id: 'semantic_model', label: '语义模型', icon: <Database className="h-4 w-4" /> },
  { id: 'qa_pair', label: 'QA对', icon: <MessageSquare className="h-4 w-4" /> },
  { id: 'synonym', label: '同义词', icon: <BookOpen className="h-4 w-4" /> },
  { id: 'business_knowledge', label: '业务知识', icon: <FileText className="h-4 w-4" /> },
];

export default function KnowledgeBaseManagement() {
  const { showToast } = useToastContext();
  const [activeTab, setActiveTab] = useState<KnowledgeType>('semantic_model');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState<KnowledgeEntry | null>(null);

  // 语义模型需要包含子项以支持层级展示，但默认只显示父级
  const { data: knowledgeData, refetch } = useListKnowledgeQuery({
    type: activeTab,
    includeChildren: activeTab === 'semantic_model', // 语义模型需要包含子项数据，但前端只显示父级
    limit: 100,
  });

  const knowledgeEntries = knowledgeData?.data || [];

  const addMutation = useAddKnowledgeMutation({
    onSuccess: () => {
      showToast({
        message: '添加成功',
        status: 'success',
      });
      setShowAddModal(false);
      refetch();
    },
    onError: (error: Error) => {
      showToast({
        message: `添加失败: ${error.message}`,
        status: 'error',
      });
    },
  });

  const deleteMutation = useDeleteKnowledgeMutation({
    onSuccess: () => {
      showToast({
        message: '删除成功',
        status: 'success',
      });
      refetch();
    },
    onError: (error: Error) => {
      showToast({
        message: `删除失败: ${error.message}`,
        status: 'error',
      });
    },
  });

  const handleDelete = (id: string) => {
    if (confirm('确定要删除这条知识吗？此操作无法撤销。')) {
      deleteMutation.mutate(id);
    }
  };

  const activeTabConfig = tabs.find((tab) => tab.id === activeTab);

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-text-primary">知识库管理</h3>
          <p className="mt-1 text-sm text-text-secondary">
            管理向量数据库中的语义模型、QA对、同义词和业务知识
          </p>
        </div>
        <Button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="btn btn-primary relative flex items-center gap-2 rounded-lg px-3 py-2"
        >
          <Plus className="h-4 w-4" />
          添加{activeTabConfig?.label}
        </Button>
      </div>

      {/* 标签页 */}
      <div className="mb-4 flex gap-2 border-b border-border-light">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors',
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary',
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-auto">
        {knowledgeEntries.length === 0 ? (
          <div className="flex h-64 items-center justify-center text-text-secondary">
            <div className="text-center">
              <p className="text-sm">暂无{activeTabConfig?.label}</p>
              <p className="mt-2 text-xs text-text-tertiary">
                点击右上角"添加{activeTabConfig?.label}"按钮开始添加
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {knowledgeEntries.map((entry) => (
              <KnowledgeEntryCard
                key={entry._id}
                entry={entry}
                onView={(entry) => setShowViewModal(entry)}
                onDelete={() => handleDelete(entry._id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* 添加模态框 */}
      {showAddModal && (
        <AddKnowledgeModal
          type={activeTab}
          onClose={() => setShowAddModal(false)}
          onAdd={(payload) => addMutation.mutate(payload)}
          isLoading={addMutation.isLoading}
        />
      )}

      {/* 查看模态框 */}
      {showViewModal && (
        <ViewKnowledgeModal entry={showViewModal} onClose={() => setShowViewModal(null)} />
      )}
    </div>
  );
}

interface KnowledgeEntryCardProps {
  entry: KnowledgeEntry;
  onView: (entry: KnowledgeEntry) => void;
  onDelete: () => void;
}

function KnowledgeEntryCard({ entry, onView, onDelete }: KnowledgeEntryCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasChildren = entry.children && entry.children.length > 0;
  const isDatabaseLevel = entry.metadata?.is_database_level === true;

  return (
    <div className="rounded-lg border border-border-light bg-surface-secondary transition-colors hover:bg-surface-hover">
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              {hasChildren && (
                <button
                  type="button"
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="rounded p-1 text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                  title={isExpanded ? '折叠' : '展开'}
                  aria-label={isExpanded ? '折叠' : '展开'}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </button>
              )}
              {isDatabaseLevel ? (
                isExpanded ? (
                  <FolderOpen className="h-4 w-4 text-primary" />
                ) : (
                  <Folder className="h-4 w-4 text-primary" />
                )
              ) : (
                <Database className="h-4 w-4 text-text-secondary" />
              )}
              <h4 className="font-medium text-text-primary">{entry.title}</h4>
              {hasChildren && (
                <span className="text-xs text-text-tertiary">
                  ({entry.children.length} 个表)
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-text-secondary line-clamp-2">
              {entry.content.length > 100 ? `${entry.content.substring(0, 100)}...` : entry.content}
            </p>
            {entry.metadata && Object.keys(entry.metadata).length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {Object.entries(entry.metadata)
                  .filter(([key]) => key !== 'is_database_level')
                  .slice(0, 3)
                  .map(([key, value]) => (
                    <span
                      key={key}
                      className="rounded bg-surface-primary px-2 py-1 text-xs text-text-secondary"
                    >
                      {key}: {String(value)}
                    </span>
                  ))}
              </div>
            )}
            {entry.createdAt && (
              <p className="mt-2 text-xs text-text-tertiary">
                创建时间: {new Date(entry.createdAt).toLocaleString('zh-CN')}
              </p>
            )}
          </div>
          <div className="ml-4 flex gap-2">
            <button
              type="button"
              onClick={() => onView(entry)}
              className="rounded p-2 text-text-secondary hover:bg-surface-hover hover:text-text-primary"
              title="查看详情"
              aria-label="查看详情"
            >
              <Eye className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="rounded p-2 text-text-secondary hover:bg-surface-hover hover:text-red-500"
              title="删除"
              aria-label="删除"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
      
      {/* 子项展示（可展开/折叠） */}
      {hasChildren && isExpanded && (
        <div className="border-t border-border-light bg-surface-primary pl-8 pr-4 py-2">
          <div className="space-y-2">
            {entry.children.map((child) => (
              <div
                key={child._id}
                className="flex items-center justify-between rounded border border-border-light bg-surface-secondary p-3"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Database className="h-3 w-3 text-text-tertiary" />
                    <span className="text-sm font-medium text-text-primary">
                      {child.metadata?.table_name || child.title}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-text-secondary line-clamp-1">
                    {child.content.length > 80 ? `${child.content.substring(0, 80)}...` : child.content}
                  </p>
                </div>
                <div className="ml-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => onView(child)}
                    className="rounded p-1 text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                    title="查看详情"
                    aria-label="查看详情"
                  >
                    <Eye className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface AddKnowledgeModalProps {
  type: KnowledgeType;
  onClose: () => void;
  onAdd: (payload: AddKnowledgeRequest) => void;
  isLoading: boolean;
}

function AddKnowledgeModal({ type, onClose, onAdd, isLoading }: AddKnowledgeModalProps) {
  const { showToast } = useToastContext();
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [fileContent, setFileContent] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const fileLowerName = file.name.toLowerCase();
    setFileName(fileLowerName);

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setFileContent(content);
      
      // 尝试解析 JSON 或 YAML
      try {
        if (fileLowerName.endsWith('.json')) {
          const json = JSON.parse(content);
          setFormData(json);
        } else if (fileLowerName.endsWith('.yaml') || fileLowerName.endsWith('.yml')) {
          // 支持 YAML 解析
          const yamlData = yaml.load(content) as Record<string, any>;
          setFormData(yamlData);
        }
      } catch (error) {
        showToast({
          message: '文件解析失败，请检查文件格式',
          status: 'error',
        });
      }
    };
    reader.readAsText(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (type === 'semantic_model') {
      // 语义模型：从文件或表单获取数据
      if (fileContent) {
        try {
          // 支持 JSON 和 YAML 文件解析
          let semanticData: Record<string, any>;
          
          if (fileName.endsWith('.yaml') || fileName.endsWith('.yml')) {
            // YAML 解析，确保数据结构与 JSON 一致
            semanticData = yaml.load(fileContent) as Record<string, any>;
            
            // 验证和规范化数据结构，确保与 JSON 格式一致
            if (!semanticData || typeof semanticData !== 'object') {
              throw new Error('YAML 文件格式错误：根元素必须是对象');
            }
            
            // 确保 semantic_models 是数组（如果存在）
            if (semanticData.semantic_models && !Array.isArray(semanticData.semantic_models)) {
              throw new Error('YAML 文件格式错误：semantic_models 必须是数组');
            }
          } else {
            semanticData = JSON.parse(fileContent);
          }
          
          // 检查是否为数据库级别的语义模型文件
          // 如果有 semantic_models 数组，无论是否有 database 字段，都应该创建父子结构
          if (semanticData.semantic_models && Array.isArray(semanticData.semantic_models) && semanticData.semantic_models.length > 0) {
            // 确定数据库名称：优先使用文件中的 database 字段，否则使用文件名（去除扩展名）
            const databaseName = semanticData.database || fileName.replace(/\.(yaml|yml|json)$/i, '') || 'unknown_database';
            
            // 数据库级别的批量导入：创建父级（数据库）和子级（表）
            // 一份文件对应一个数据库（父级），里面的表作为子级
            onAdd({
              type: 'semantic_model',
              data: {
                isDatabaseLevel: true,
                databaseName: databaseName,
                semanticModels: semanticData.semantic_models,
                databaseContent: JSON.stringify(semanticData), // 整个文件内容作为数据库级别的内容
                metadata: semanticData.metadata || {},
              },
            });
            showToast({
              message: `成功添加数据库语义模型: ${databaseName} (包含 ${semanticData.semantic_models.length} 个表)`,
              status: 'success',
            });
            onClose();
            return;
          } else {
            // 单个语义模型
            onAdd({
              type: 'semantic_model',
              data: {
                semanticModelId: semanticData.name || semanticData.model,
                databaseName: semanticData.database || '',
                tableName: semanticData.name || semanticData.model,
                content: JSON.stringify(semanticData),
              },
            });
          }
        } catch (error) {
          showToast({
            message: '文件解析失败，请检查文件格式（支持 JSON 和 YAML）',
            status: 'error',
          });
          return;
        }
      } else {
        if (!formData.semanticModelId || !formData.databaseName || !formData.tableName) {
          showToast({
            message: '请填写所有必填字段',
            status: 'error',
          });
          return;
        }
        onAdd({
          type: 'semantic_model',
          data: {
            semanticModelId: formData.semanticModelId || '',
            databaseName: formData.databaseName || '',
            tableName: formData.tableName || '',
            content: formData.content || JSON.stringify({}),
          },
        });
      }
    } else if (type === 'qa_pair') {
      if (!formData.question || !formData.answer) {
        showToast({
          message: '请填写问题和答案',
          status: 'error',
        });
        return;
      }
      onAdd({
        type: 'qa_pair',
        data: {
          question: formData.question || '',
          answer: formData.answer || '',
        },
      });
    } else if (type === 'synonym') {
      if (!formData.noun || !formData.synonyms) {
        showToast({
          message: '请填写名词和同义词',
          status: 'error',
        });
        return;
      }
      onAdd({
        type: 'synonym',
        data: {
          noun: formData.noun || '',
          synonyms: Array.isArray(formData.synonyms)
            ? formData.synonyms
            : formData.synonyms?.split(',').map((s: string) => s.trim()) || [],
        },
      });
    } else if (type === 'business_knowledge') {
      if (!formData.title || !formData.content) {
        showToast({
          message: '请填写标题和内容',
          status: 'error',
        });
        return;
      }
      onAdd({
        type: 'business_knowledge',
        data: {
          title: formData.title || '',
          content: formData.content || '',
          category: formData.category || '',
          tags: Array.isArray(formData.tags)
            ? formData.tags
            : formData.tags?.split(',').map((s: string) => s.trim()) || [],
        },
      });
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-2xl rounded-lg bg-surface-primary p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-text-primary">
            添加{tabs.find((t) => t.id === type)?.label}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-text-secondary hover:bg-surface-hover hover:text-text-primary"
            aria-label="关闭"
            title="关闭"
          >
            <X className="h-5 w-5" />
            <span className="sr-only">关闭</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {type === 'semantic_model' && (
            <>
              <div>
                <label className="block text-sm font-medium text-text-primary">
                  上传文件 (JSON/YAML)
                </label>
                <input
                  type="file"
                  accept=".json,.yaml,.yml"
                  onChange={handleFileUpload}
                  className="mt-1 block w-full rounded border border-border-light bg-surface-secondary px-3 py-2 text-sm text-text-primary"
                  aria-label="上传语义模型文件"
                />
                <p className="mt-1 text-xs text-text-tertiary">
                  支持 JSON 或 YAML 格式的语义模型文件
                </p>
              </div>
              <div className="text-sm text-text-secondary">或手动输入：</div>
              <div>
                <label className="block text-sm font-medium text-text-primary">语义模型ID *</label>
                <input
                  type="text"
                  value={formData.semanticModelId || ''}
                  onChange={(e) => setFormData({ ...formData, semanticModelId: e.target.value })}
                  className="mt-1 block w-full rounded border border-border-light bg-surface-secondary px-3 py-2 text-sm text-text-primary"
                  required={!fileContent}
                  placeholder="输入语义模型ID"
                  aria-label="语义模型ID"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary">数据库名 *</label>
                <input
                  type="text"
                  value={formData.databaseName || ''}
                  onChange={(e) => setFormData({ ...formData, databaseName: e.target.value })}
                  className="mt-1 block w-full rounded border border-border-light bg-surface-secondary px-3 py-2 text-sm text-text-primary"
                  required={!fileContent}
                  placeholder="输入数据库名"
                  aria-label="数据库名"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary">表名 *</label>
                <input
                  type="text"
                  value={formData.tableName || ''}
                  onChange={(e) => setFormData({ ...formData, tableName: e.target.value })}
                  className="mt-1 block w-full rounded border border-border-light bg-surface-secondary px-3 py-2 text-sm text-text-primary"
                  required={!fileContent}
                  placeholder="输入表名"
                  aria-label="表名"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary">内容 (JSON)</label>
                <textarea
                  value={formData.content || ''}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  rows={6}
                  className="mt-1 block w-full rounded border border-border-light bg-surface-secondary px-3 py-2 text-sm text-text-primary font-mono"
                  placeholder='{"name": "table_name", "columns": [...]}'
                />
              </div>
            </>
          )}

          {type === 'qa_pair' && (
            <>
              <div>
                <label className="block text-sm font-medium text-text-primary">问题 *</label>
                <input
                  type="text"
                  value={formData.question || ''}
                  onChange={(e) => setFormData({ ...formData, question: e.target.value })}
                  className="mt-1 block w-full rounded border border-border-light bg-surface-secondary px-3 py-2 text-sm text-text-primary"
                  required
                  placeholder="输入问题"
                  aria-label="问题"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary">答案 *</label>
                <textarea
                  value={formData.answer || ''}
                  onChange={(e) => setFormData({ ...formData, answer: e.target.value })}
                  rows={4}
                  className="mt-1 block w-full rounded border border-border-light bg-surface-secondary px-3 py-2 text-sm text-text-primary"
                  required
                  placeholder="输入答案"
                  aria-label="答案"
                />
              </div>
            </>
          )}

          {type === 'synonym' && (
            <>
              <div>
                <label className="block text-sm font-medium text-text-primary">名词 *</label>
                <input
                  type="text"
                  value={formData.noun || ''}
                  onChange={(e) => setFormData({ ...formData, noun: e.target.value })}
                  className="mt-1 block w-full rounded border border-border-light bg-surface-secondary px-3 py-2 text-sm text-text-primary"
                  required
                  placeholder="输入名词"
                  aria-label="名词"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary">同义词 *</label>
                <input
                  type="text"
                  value={formData.synonyms || ''}
                  onChange={(e) => setFormData({ ...formData, synonyms: e.target.value })}
                  className="mt-1 block w-full rounded border border-border-light bg-surface-secondary px-3 py-2 text-sm text-text-primary"
                  placeholder="用逗号分隔，例如：订购, 下单, 购买"
                  required
                />
                <p className="mt-1 text-xs text-text-tertiary">多个同义词用逗号分隔</p>
              </div>
            </>
          )}

          {type === 'business_knowledge' && (
            <>
              <div>
                <label className="block text-sm font-medium text-text-primary">标题 *</label>
                <input
                  type="text"
                  value={formData.title || ''}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="mt-1 block w-full rounded border border-border-light bg-surface-secondary px-3 py-2 text-sm text-text-primary"
                  required
                  placeholder="输入标题"
                  aria-label="标题"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary">内容 *</label>
                <textarea
                  value={formData.content || ''}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  rows={6}
                  className="mt-1 block w-full rounded border border-border-light bg-surface-secondary px-3 py-2 text-sm text-text-primary"
                  required
                  placeholder="输入内容"
                  aria-label="内容"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary">分类</label>
                <input
                  type="text"
                  value={formData.category || ''}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="mt-1 block w-full rounded border border-border-light bg-surface-secondary px-3 py-2 text-sm text-text-primary"
                  placeholder="例如：流程说明、业务规则等"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary">标签</label>
                <input
                  type="text"
                  value={formData.tags || ''}
                  onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                  className="mt-1 block w-full rounded border border-border-light bg-surface-secondary px-3 py-2 text-sm text-text-primary"
                  placeholder="用逗号分隔，例如：订单, 流程, 业务"
                />
                <p className="mt-1 text-xs text-text-tertiary">多个标签用逗号分隔</p>
              </div>
            </>
          )}

          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              onClick={onClose}
              className="btn btn-secondary rounded-lg px-4 py-2"
            >
              取消
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="btn btn-primary rounded-lg px-4 py-2"
            >
              {isLoading ? '添加中...' : '添加'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface ViewKnowledgeModalProps {
  entry: KnowledgeEntry;
  onClose: () => void;
}

function ViewKnowledgeModal({ entry, onClose }: ViewKnowledgeModalProps) {
  const formatMetadata = (metadata: Record<string, any>): string => {
    try {
      return JSON.stringify(metadata, null, 2);
    } catch {
      return String(metadata);
    }
  };

  const formatContent = (content: string): string => {
    try {
      const parsed = JSON.parse(content);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return content;
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-4xl max-h-[90vh] rounded-lg bg-surface-primary p-6 shadow-lg overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-text-primary">查看详情</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-text-secondary hover:bg-surface-hover hover:text-text-primary"
            aria-label="关闭"
            title="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">类型</label>
            <div className="rounded border border-border-light bg-surface-secondary px-3 py-2 text-sm text-text-primary">
              {tabs.find((t) => t.id === entry.type)?.label || entry.type}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">标题</label>
            <div className="rounded border border-border-light bg-surface-secondary px-3 py-2 text-sm text-text-primary">
              {entry.title}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">内容</label>
            <div className="rounded border border-border-light bg-surface-secondary px-3 py-2 text-sm text-text-primary font-mono whitespace-pre-wrap max-h-64 overflow-auto">
              {entry.type === 'semantic_model' ? formatContent(entry.content) : entry.content}
            </div>
          </div>

          {entry.metadata && Object.keys(entry.metadata).length > 0 && (
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">元数据</label>
              <div className="rounded border border-border-light bg-surface-secondary px-3 py-2 text-sm text-text-primary font-mono whitespace-pre-wrap max-h-64 overflow-auto">
                {formatMetadata(entry.metadata)}
              </div>
            </div>
          )}

          {entry.createdAt && (
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">创建时间</label>
              <div className="rounded border border-border-light bg-surface-secondary px-3 py-2 text-sm text-text-primary">
                {new Date(entry.createdAt).toLocaleString('zh-CN')}
              </div>
            </div>
          )}

          {entry.updatedAt && (
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">更新时间</label>
              <div className="rounded border border-border-light bg-surface-secondary px-3 py-2 text-sm text-text-primary">
                {new Date(entry.updatedAt).toLocaleString('zh-CN')}
              </div>
            </div>
          )}

          <div className="flex justify-end pt-4">
            <Button
              type="button"
              onClick={onClose}
              className="btn btn-secondary rounded-lg px-4 py-2"
            >
              关闭
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}