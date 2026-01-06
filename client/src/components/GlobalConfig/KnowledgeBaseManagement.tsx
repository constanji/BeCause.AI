import React, { useState, useRef } from 'react';
import { Database, MessageSquare, BookOpen, FileText, Plus, Trash2, Eye, Upload, X, ChevronRight, ChevronDown, Folder, FolderOpen, Server, Pencil, Sparkles, Bot } from 'lucide-react';
import * as yaml from 'js-yaml';
import { Button, useToastContext, Spinner } from '@because/client';
import {
  useListKnowledgeQuery,
  useAddKnowledgeMutation,
  useDeleteKnowledgeMutation,
} from '~/data-provider';
import { useUpdateKnowledgeMutation } from '~/data-provider/KnowledgeBase';
import { useListDataSourcesQuery } from '~/data-provider/DataSources';
import { useUploadFileMutation } from '~/data-provider/Files';
import { useListAgentsQuery } from '~/data-provider';
import { EToolResources, EModelEndpoint, Constants, QueryKeys } from '@because/data-provider';
import type { DataSource, Agent } from '@because/data-provider';
import { dataService } from '@because/data-provider';
import { cn } from '~/utils';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useNewConvo } from '~/hooks';
import { clearMessagesCache } from '~/utils';
import store from '~/store';

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
  const [showEditModal, setShowEditModal] = useState<KnowledgeEntry | null>(null);
  const [showViewModal, setShowViewModal] = useState<KnowledgeEntry | null>(null);
  const [selectedDataSourceId, setSelectedDataSourceId] = useState<string | null>(null);

  // 获取数据源列表
  const { data: dataSourcesResponse } = useListDataSourcesQuery();
  const dataSources = dataSourcesResponse?.data || [];
  const selectedDataSource = selectedDataSourceId 
    ? dataSources.find((ds: DataSource) => ds._id === selectedDataSourceId)
    : null;

  // 语义模型需要包含子项以支持层级展示，但默认只显示父级
  // 根据选中的数据源过滤知识库（使用 entityId）
  const { data: knowledgeData, refetch } = useListKnowledgeQuery({
    type: activeTab,
    entityId: selectedDataSourceId || undefined, // 使用数据源 ID 作为 entityId
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

  const updateMutation = useUpdateKnowledgeMutation({
    onSuccess: () => {
      showToast({
        message: '更新成功',
        status: 'success',
      });
      setShowEditModal(null);
      refetch();
    },
    onError: (error: Error) => {
      showToast({
        message: `更新失败: ${error.message}`,
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
      <div className="mb-4">
        <div>
          <h3 className="text-lg font-semibold text-text-primary">知识库管理</h3>
          <p className="mt-1 text-sm text-text-secondary">
            管理向量数据库中的语义模型、QA对、同义词和业务知识
          </p>
        </div>
      </div>

      {/* 数据源选择器 */}
      <div className="mb-4 rounded-lg border border-border-light bg-surface-secondary p-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-text-secondary" />
            <label className="text-sm font-medium text-text-primary">选择数据源：</label>
          </div>
          <select
            value={selectedDataSourceId || ''}
            onChange={(e) => setSelectedDataSourceId(e.target.value || null)}
            className="flex-1 rounded border border-border-light bg-surface-primary px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
            aria-label="选择数据源"
            title="选择数据源"
          >
            <option value="">-- 请选择数据源 --</option>
            {dataSources.map((ds: DataSource) => (
              <option key={ds._id} value={ds._id}>
                {ds.name} ({ds.type} - {ds.database})
              </option>
            ))}
          </select>
          {selectedDataSource && (
            <div className="flex items-center gap-2 text-xs text-text-secondary">
              <span className="rounded bg-surface-primary px-2 py-1">
                {selectedDataSource.type}
              </span>
              <span className="rounded bg-surface-primary px-2 py-1">
                {selectedDataSource.host}:{selectedDataSource.port}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 标签页和添加按钮 */}
      <div className="mb-4 flex items-end justify-between border-b border-border-light pb-4">
        <div className="flex gap-2">
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
        <Button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="btn btn-primary relative flex items-center gap-2 rounded-lg px-3 py-2"
          disabled={!selectedDataSourceId}
          title={!selectedDataSourceId ? '请先选择数据源' : ''}
        >
          <Plus className="h-4 w-4" />
          添加{activeTabConfig?.label}
        </Button>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-auto">
        {!selectedDataSourceId ? (
          <div className="flex h-64 items-center justify-center text-text-secondary">
            <div className="text-center">
              <Server className="mx-auto h-12 w-12 text-text-tertiary mb-4" />
              <p className="text-sm">请先选择数据源</p>
              <p className="mt-2 text-xs text-text-tertiary">
                在上方选择数据源后，可以管理该数据源绑定的知识库
              </p>
            </div>
          </div>
        ) : knowledgeEntries.length === 0 ? (
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
                onEdit={(entry) => setShowEditModal(entry)}
                onDelete={() => handleDelete(entry._id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* 添加模态框 */}
      {showAddModal && selectedDataSourceId && (
        <AddKnowledgeModal
          type={activeTab}
          dataSourceId={selectedDataSourceId}
          onClose={() => setShowAddModal(false)}
          onAdd={(payload) => addMutation.mutate(payload)}
          isLoading={addMutation.isLoading}
        />
      )}

      {/* 编辑模态框 */}
      {showEditModal && selectedDataSourceId && (
        <EditKnowledgeModal
          entry={showEditModal}
          dataSourceId={selectedDataSourceId}
          onClose={() => setShowEditModal(null)}
          onUpdate={(payload) => updateMutation.mutate({ id: showEditModal._id, payload })}
          isLoading={updateMutation.isLoading}
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
  onEdit: (entry: KnowledgeEntry) => void;
  onDelete: () => void;
}

function KnowledgeEntryCard({ entry, onView, onEdit, onDelete }: KnowledgeEntryCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasChildren = entry.children && entry.children.length > 0;
  const isDatabaseLevel = entry.metadata?.is_database_level === true;

  // 根据知识类型获取对应的图标
  const getEntryIcon = () => {
    if (isDatabaseLevel) {
      return isExpanded ? (
        <FolderOpen className="h-4 w-4 text-primary" />
      ) : (
        <Folder className="h-4 w-4 text-primary" />
      );
    }
    
    // 根据类型返回对应的图标
    const tabConfig = tabs.find((tab) => tab.id === entry.type);
    if (tabConfig) {
      return React.cloneElement(tabConfig.icon as React.ReactElement, {
        className: 'h-4 w-4 text-text-secondary',
      });
    }
    
    // 默认图标
    return <Database className="h-4 w-4 text-text-secondary" />;
  };

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
              {getEntryIcon()}
              <h4 className="font-medium text-text-primary">{entry.title}</h4>
              {hasChildren && entry.children && (
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
            {/* 只对 QA对、同义词、业务知识显示编辑按钮 */}
            {(entry.type === 'qa_pair' || entry.type === 'synonym' || entry.type === 'business_knowledge') && (
              <button
                type="button"
                onClick={() => onEdit(entry)}
                className="rounded p-2 text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                title="编辑"
                aria-label="编辑"
              >
                <Pencil className="h-4 w-4" />
              </button>
            )}
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
      {hasChildren && isExpanded && entry.children && (
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
  dataSourceId: string;
  onClose: () => void;
  onAdd: (payload: AddKnowledgeRequest) => void;
  isLoading: boolean;
}

function AddKnowledgeModal({ type, dataSourceId, onClose, onAdd, isLoading }: AddKnowledgeModalProps) {
  const { showToast } = useToastContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { newConversation } = useNewConvo();
  const { conversation } = store.useCreateConversationAtom(0);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [fileContent, setFileContent] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedFileId, setUploadedFileId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // 语义模型导入方式选择状态
  const [semanticModelImportMode, setSemanticModelImportMode] = useState<'file' | 'database' | 'agent' | null>(
    type === 'semantic_model' ? null : null
  );
  const [generating, setGenerating] = useState(false);
  const [generatedSemanticModel, setGeneratedSemanticModel] = useState<any>(null);
  // Schema类型选择：'light' | 'meta'
  const [schemaType, setSchemaType] = useState<'light' | 'meta'>('meta');
  
  // 获取数据源列表（用于数据库生成方式）
  const { data: dataSourcesResponse } = useListDataSourcesQuery();
  const dataSources = dataSourcesResponse?.data || [];
  
  // 获取Agent列表（用于Agent生成方式）
  const { data: agentsResponse } = useListAgentsQuery();
  const agents = agentsResponse?.data || [];
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [agentRequirement, setAgentRequirement] = useState<string>('');
  
  // 处理Agent调用生成语义模型
  const handleStartAgentGeneration = () => {
    if (!selectedAgentId) {
      showToast({
        message: '请选择Agent',
        status: 'error',
      });
      return;
    }

    const selectedAgent = agents.find((agent: Agent) => agent.id === selectedAgentId);
    if (!selectedAgent) {
      showToast({
        message: '选择的Agent不存在',
        status: 'error',
      });
      return;
    }

    // 清除当前对话的消息缓存
    clearMessagesCache(queryClient, conversation?.conversationId);
    queryClient.invalidateQueries([QueryKeys.messages]);

    // 创建新对话并设置智能体
    newConversation({
      preset: {
        endpoint: EModelEndpoint.agents,
        agent_id: selectedAgentId,
        model: selectedAgent.model || '',
        conversationId: Constants.NEW_CONVO as string,
      },
      keepLatestMessage: false,
    });

    // 构建初始消息
    const requirementText = agentRequirement.trim()
      ? `\n\n需求描述：\n${agentRequirement}`
      : '';
    const initialMessage = `请使用 semantic_model_generator 工具生成语义模型。${requirementText}`;

    // 导航到新对话，并在URL中传递初始消息
    navigate(`/c/new?agent_id=${selectedAgentId}&message=${encodeURIComponent(initialMessage)}`, {
      replace: false,
      state: {
        agentId: selectedAgentId,
        agentName: selectedAgent.name,
        initialMessage: initialMessage,
      },
    });

    showToast({
      message: '正在打开新对话，您可以在对话中使用Agent生成语义模型',
      status: 'success',
    });

    // 关闭当前模态框
    onClose();
  };
  
  // 文件上传 mutation（用于业务知识文档上传）
  const uploadFileMutation = useUploadFileMutation({
    onSuccess: (data) => {
      setUploadedFileId(data.file_id);
      showToast({
        message: '文件上传成功，正在向量化处理...',
        status: 'success',
      });
    },
    onError: (error: any) => {
      showToast({
        message: `文件上传失败: ${error.message || '未知错误'}`,
        status: 'error',
      });
    },
  });

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

  // 处理数据库生成语义模型
  const handleGenerateFromDatabase = async (selectedDataSourceIdForGen: string) => {
    try {
      setGenerating(true);
      
      // 确保 schemaType 有值
      const effectiveSchemaType = schemaType || 'meta';
      console.log('[前端] 准备发送请求');
      console.log('[前端] selectedDataSourceIdForGen:', selectedDataSourceIdForGen);
      console.log('[前端] schemaType状态值:', schemaType);
      console.log('[前端] effectiveSchemaType:', effectiveSchemaType);
      console.log('[前端] schemaType类型:', typeof schemaType);
      
      const requestPayload = {
        id: selectedDataSourceIdForGen,
        userInput: {},
        schemaType: effectiveSchemaType, // 明确传递Schema类型
      };
      console.log('[前端] 完整payload:', JSON.stringify(requestPayload, null, 2));
      
      const response = await dataService.generateSemanticModel({
        id: selectedDataSourceIdForGen,
        userInput: {},
        schemaType: effectiveSchemaType, // 明确传递
      } as any); // 临时类型断言，等待TypeScript重新编译
      
      console.log('[前端] 请求发送完成，响应:', response);

      if (response.success && response.data) {
        // 解析YAML内容
        const yamlData = yaml.load(response.data.yaml) as any;
        setGeneratedSemanticModel({
          yaml: response.data.yaml,
          database: response.data.database,
          tableCount: response.data.tableCount,
          semanticModels: yamlData.semantic_models || [],
          schemaType, // 保存Schema类型
        });
        // 初始化formData，设置默认标题（如果还没有设置）
        if (!formData.title) {
          setFormData({
            ...formData,
            title: response.data.database || '',
          });
        }
        showToast({
          message: `语义模型生成成功（${schemaType === 'light' ? 'Light Schema' : 'MSchema'}），共包含 ${response.data.tableCount} 张表`,
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

  // 处理从数据库生成的语义模型添加到知识库
  const handleAddGeneratedSemanticModel = (title?: string, modelType?: string) => {
    if (!generatedSemanticModel) return;

    const databaseName = generatedSemanticModel.database || dataSourceId;
    const yamlData = yaml.load(generatedSemanticModel.yaml) as any;
    
    // 使用传入的title和modelType，如果为空则使用默认值
    const finalTitle = (title && title.trim()) || generatedSemanticModel.database || '语义模型';
    const finalModelType = (modelType && modelType.trim()) || undefined;

    onAdd({
      type: 'semantic_model',
      data: {
        isDatabaseLevel: true,
        databaseName: databaseName,
        semanticModels: yamlData.semantic_models || [],
        databaseContent: JSON.stringify(yamlData),
        metadata: {
          entity_id: dataSourceId,
          title: finalTitle,
          model_type: finalModelType,
        },
      },
    });
    showToast({
      message: `成功添加数据库语义模型: ${databaseName} (包含 ${generatedSemanticModel.tableCount} 个表)`,
      status: 'success',
    });
    onClose();
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
                metadata: {
                  ...semanticData.metadata,
                  entity_id: dataSourceId, // 关联数据源
                  title: formData.title,
                  model_type: formData.model_type,
                },
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
                entityId: dataSourceId, // 关联数据源
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
            entityId: dataSourceId, // 关联数据源
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
          entityId: dataSourceId, // 关联数据源
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
          entityId: dataSourceId, // 关联数据源
        },
      });
    } else if (type === 'business_knowledge') {
      // 如果上传了文件，使用文件信息；否则需要手动输入内容
      if (uploadedFileId) {
        // 使用上传的文件作为业务知识
        onAdd({
          type: 'business_knowledge',
          data: {
            title: formData.title || uploadedFile?.name || '文档',
            content: formData.content || `文档: ${uploadedFile?.name || '已上传文档'}`,
            category: formData.category || '',
            tags: Array.isArray(formData.tags)
              ? formData.tags
              : formData.tags?.split(',').map((s: string) => s.trim()) || [],
            entityId: dataSourceId, // 关联数据源
            fileId: uploadedFileId, // 关联上传的文件
            filename: uploadedFile?.name || '',
          },
        });
      } else {
        // 手动输入模式
        if (!formData.title || !formData.content) {
          showToast({
            message: '请填写标题和内容，或上传文档',
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
            entityId: dataSourceId, // 关联数据源
          },
        });
      }
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

        {type === 'semantic_model' && semanticModelImportMode === null ? (
          // 选择导入方式
          <div className="space-y-4">
            <div className="text-sm text-text-secondary mb-4">
              请选择添加语义模型的方式：
            </div>
            <div className="grid grid-cols-1 gap-4">
              <button
                type="button"
                onClick={() => setSemanticModelImportMode('file')}
                className="flex items-start gap-4 rounded-lg border-2 border-border-light bg-surface-secondary p-4 hover:border-primary hover:bg-surface-hover transition-colors text-left"
              >
                <FileText className="h-6 w-6 text-primary mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <div className="font-medium text-text-primary mb-1">从文件导入</div>
                  <div className="text-sm text-text-secondary">
                    上传 JSON/YAML 格式的语义模型文件，可以修改标题和语义模型类型
                  </div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setSemanticModelImportMode('database')}
                className="flex items-start gap-4 rounded-lg border-2 border-border-light bg-surface-secondary p-4 hover:border-primary hover:bg-surface-hover transition-colors text-left"
              >
                <Database className="h-6 w-6 text-primary mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <div className="font-medium text-text-primary mb-1">连接数据库一键生成</div>
                  <div className="text-sm text-text-secondary">
                    自动连接数据库并生成语义模型，支持 MySQL 和 PostgreSQL
                  </div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setSemanticModelImportMode('agent')}
                className="flex items-start gap-4 rounded-lg border-2 border-border-light bg-surface-secondary p-4 hover:border-primary hover:bg-surface-hover transition-colors text-left"
              >
                <Bot className="h-6 w-6 text-primary mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <div className="font-medium text-text-primary mb-1">Agent调用生成语义模型</div>
                  <div className="text-sm text-text-secondary">
                    使用AI Agent基于模板系统生成高质量的语义模型，支持自定义需求描述
                  </div>
                </div>
              </button>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                onClick={onClose}
                className="btn btn-secondary rounded-lg px-4 py-2"
              >
                取消
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {type === 'semantic_model' && semanticModelImportMode === 'file' && (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-base font-medium text-text-primary">从文件导入</h4>
                  <button
                    type="button"
                    onClick={() => {
                      setSemanticModelImportMode(null);
                      setFileContent('');
                      setFileName('');
                      setFormData({});
                    }}
                    className="text-sm text-text-secondary hover:text-text-primary"
                  >
                    返回
                  </button>
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-2">
                    上传文件 (JSON/YAML) *
                  </label>
                  <input
                    type="file"
                    accept=".json,.yaml,.yml"
                    onChange={handleFileUpload}
                    className="block w-full rounded border border-border-light bg-surface-secondary px-3 py-2 text-sm text-text-primary"
                    aria-label="上传语义模型文件"
                  />
                  <p className="mt-1 text-xs text-text-tertiary">
                    支持 JSON 或 YAML 格式的语义模型文件
                  </p>
                </div>
                {fileContent && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-text-primary mb-2">
                        标题
                      </label>
                      <input
                        type="text"
                        value={formData.title || ''}
                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                        className="block w-full rounded border border-border-light bg-surface-secondary px-3 py-2 text-sm text-text-primary"
                        placeholder="输入标题（可选）"
                        aria-label="标题"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-text-primary mb-2">
                        语义模型类型
                      </label>
                      <input
                        type="text"
                        value={formData.model_type || ''}
                        onChange={(e) => setFormData({ ...formData, model_type: e.target.value })}
                        className="block w-full rounded border border-border-light bg-surface-secondary px-3 py-2 text-sm text-text-primary"
                        placeholder="例如：分析语义模型、业务语义模型等（可选）"
                        aria-label="语义模型类型"
                      />
                    </div>
                  </>
                )}
              </>
            )}

            {type === 'semantic_model' && semanticModelImportMode === 'database' && (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-base font-medium text-text-primary">连接数据库一键生成</h4>
                  <button
                    type="button"
                    onClick={() => {
                      setSemanticModelImportMode(null);
                      setGeneratedSemanticModel(null);
                    }}
                    className="text-sm text-text-secondary hover:text-text-primary"
                  >
                    返回
                  </button>
                </div>
                {!generatedSemanticModel ? (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-text-primary mb-2">
                        选择数据源 *
                      </label>
                      <select
                        value={dataSourceId}
                        className="block w-full rounded border border-border-light bg-surface-secondary px-3 py-2 text-sm text-text-primary"
                        disabled
                        title="数据源选择"
                        aria-label="数据源选择"
                      >
                        {dataSources.map((ds: DataSource) => (
                          <option key={ds._id} value={ds._id}>
                            {ds.name} ({ds.type.toUpperCase()} - {ds.database})
                          </option>
                        ))}
                      </select>
                      <p className="mt-1 text-xs text-text-tertiary">
                        将使用当前选中的数据源生成语义模型
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-text-primary mb-2">
                        Schema类型 *
                      </label>
                      <div className="space-y-2">
                        <label className="flex items-start gap-3 rounded-lg border border-border-light bg-surface-secondary p-3 cursor-pointer hover:bg-surface-hover transition-colors">
                          <input
                            type="radio"
                            name="schemaType"
                            value="light"
                            checked={schemaType === 'light'}
                            onChange={(e) => setSchemaType(e.target.value as 'light' | 'meta')}
                            className="mt-0.5"
                          />
                          <div className="flex-1">
                            <div className="font-medium text-text-primary mb-1">Light Schema（推荐用于Agent/LLM）</div>
                            <div className="text-xs text-text-secondary">
                              轻量、稳定、抗幻觉。只包含name、role、description和aggregation枚举，不包含SQL表达式和数据类型细节。适合给LLM/Agent理解使用。
                            </div>
                          </div>
                        </label>
                        <label className="flex items-start gap-3 rounded-lg border border-border-light bg-surface-secondary p-3 cursor-pointer hover:bg-surface-hover transition-colors">
                          <input
                            type="radio"
                            name="schemaType"
                            value="meta"
                            checked={schemaType === 'meta'}
                            onChange={(e) => setSchemaType(e.target.value as 'light' | 'meta')}
                            className="mt-0.5"
                          />
                          <div className="flex-1">
                            <div className="font-medium text-text-primary mb-1">MSchema（完整可执行）</div>
                            <div className="text-xs text-text-secondary">
                              完整、可执行、包含SQL表达式、数据类型和join关系。适合系统/执行引擎使用，可直接生成SQL。
                            </div>
                          </div>
                        </label>
                      </div>
                    </div>
                    <Button
                      type="button"
                      onClick={() => handleGenerateFromDatabase(dataSourceId)}
                      disabled={generating || !dataSourceId}
                      className="btn btn-primary w-full"
                    >
                      {generating ? (
                        <>
                          <Spinner className="h-4 w-4 mr-2" />
                          生成中...
                        </>
                      ) : (
                        <>
                          <Database className="h-4 w-4 mr-2" />
                          生成语义模型
                        </>
                      )}
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="rounded-lg border border-border-light bg-surface-secondary p-4 mb-4">
                      <div className="text-sm text-text-primary mb-2">
                        <strong>生成成功！</strong> 数据库：{generatedSemanticModel.database}，包含 {generatedSemanticModel.tableCount} 张表
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-text-primary mb-2">
                        标题 *
                      </label>
                      <input
                        type="text"
                        value={formData.title !== undefined ? formData.title : (generatedSemanticModel.database || '')}
                        onChange={(e) => {
                          setFormData({ ...formData, title: e.target.value });
                        }}
                        className="block w-full rounded border border-border-light bg-surface-secondary px-3 py-2 text-sm text-text-primary"
                        placeholder="输入标题"
                        aria-label="标题"
                      />
                      <p className="mt-1 text-xs text-text-tertiary">
                        当前Schema类型：{generatedSemanticModel.schemaType === 'light' ? 'Light Schema（轻量，适合LLM/Agent）' : 'MSchema（完整可执行，适合系统引擎）'}
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-text-primary mb-2">
                        语义模型类型
                      </label>
                      <input
                        type="text"
                        value={formData.model_type !== undefined ? formData.model_type : ''}
                        onChange={(e) => setFormData({ ...formData, model_type: e.target.value })}
                        className="block w-full rounded border border-border-light bg-surface-secondary px-3 py-2 text-sm text-text-primary"
                        placeholder="例如：分析语义模型、业务语义模型等（可选）"
                        aria-label="语义模型类型"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        onClick={() => handleAddGeneratedSemanticModel(formData.title, formData.model_type)}
                        disabled={isLoading}
                        className="btn btn-primary flex-1"
                      >
                        {isLoading ? (
                          <>
                            <Spinner className="h-4 w-4 mr-2" />
                            添加中...
                          </>
                        ) : (
                          <>
                            <Plus className="h-4 w-4 mr-2" />
                            添加到知识库
                          </>
                        )}
                      </Button>
                      <Button
                        type="button"
                        onClick={() => {
                          setGeneratedSemanticModel(null);
                          setFormData({});
                        }}
                        className="btn btn-secondary"
                      >
                        重新生成
                      </Button>
                    </div>
                  </>
                )}
              </>
            )}

            {type === 'semantic_model' && semanticModelImportMode === 'agent' && (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-base font-medium text-text-primary">Agent调用生成语义模型</h4>
                  <button
                    type="button"
                    onClick={() => {
                      setSemanticModelImportMode(null);
                      setSelectedAgentId('');
                      setAgentRequirement('');
                    }}
                    className="text-sm text-text-secondary hover:text-text-primary"
                  >
                    返回
                  </button>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-2">
                      选择Agent *
                    </label>
                    <select
                      value={selectedAgentId}
                      onChange={(e) => setSelectedAgentId(e.target.value)}
                      className="block w-full rounded border border-border-light bg-surface-secondary px-3 py-2 text-sm text-text-primary"
                      title="选择Agent"
                      aria-label="选择Agent"
                    >
                      <option value="">请选择Agent</option>
                      {agents
                        .filter((agent: Agent) => agent.tools?.includes('semantic_model_generator'))
                        .map((agent: Agent) => (
                          <option key={agent.id} value={agent.id}>
                            {agent.name || agent.id}
                          </option>
                        ))}
                    </select>
                    <p className="mt-1 text-xs text-text-tertiary">
                      只有配置了 semantic_model_generator 工具的Agent才会显示
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-2">
                      需求描述（可选）
                    </label>
                    <textarea
                      value={agentRequirement}
                      onChange={(e) => setAgentRequirement(e.target.value)}
                      className="block w-full rounded border border-border-light bg-surface-secondary px-3 py-2 text-sm text-text-primary"
                      rows={4}
                      placeholder="描述你的语义模型需求，例如：&#10;- 领域：电商&#10;- 主要实体：用户、订单、商品&#10;- 分析需求：用户行为分析、销售统计等"
                      aria-label="需求描述"
                    />
                    <p className="mt-1 text-xs text-text-tertiary">
                      描述语义模型的领域、实体和分析需求，Agent将基于模板系统生成高质量的语义模型
                    </p>
                  </div>

                  <div className="rounded-lg border border-border-light bg-surface-secondary p-4 mb-4">
                    <div className="text-sm text-text-primary mb-2">
                      <strong>使用说明：</strong>
                    </div>
                    <ul className="text-xs text-text-secondary space-y-1 list-disc list-inside">
                      <li>Agent调用生成语义模型需要在对话环境中进行</li>
                      <li>点击"开始生成"将打开新对话，Agent将使用语义模型模板系统生成规范的语义模型文档</li>
                      <li>生成完成后，可以将结果复制并手动添加到知识库</li>
                    </ul>
                  </div>

                  <Button
                    type="button"
                    onClick={handleStartAgentGeneration}
                    disabled={!selectedAgentId}
                    className="btn btn-primary w-full"
                  >
                    <Bot className="h-4 w-4 mr-2" />
                    开始生成
                  </Button>
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
                <label className="block text-sm font-medium text-text-primary">
                  上传文档（可选）
                </label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept=".pdf,.doc,.docx,.txt,.md"
                    aria-label="上传文档"
                    title="上传文档"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setUploadedFile(file);
                        // 自动设置标题为文件名（如果标题为空）
                        if (!formData.title) {
                          setFormData({ ...formData, title: file.name.replace(/\.[^/.]+$/, '') });
                        }
                        // 上传文件并向量化
                        const uploadFormData = new FormData();
                        uploadFormData.append('file', file);
                        uploadFormData.append('endpoint', EModelEndpoint.agents);
                        uploadFormData.append('endpointType', EModelEndpoint.agents);
                        uploadFormData.append('tool_resource', EToolResources.file_search);
                        uploadFormData.append('entity_id', dataSourceId);
                        uploadFileMutation.mutate(uploadFormData);
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 rounded border border-border-light bg-surface-secondary px-3 py-2 text-sm text-text-primary hover:bg-surface-hover"
                  >
                    <Upload className="h-4 w-4" />
                    {uploadedFile ? uploadedFile.name : '选择文档'}
                  </button>
                  {uploadedFile && (
                    <span className="text-xs text-text-secondary">
                      {uploadFileMutation.isLoading ? '上传中...' : uploadedFileId ? '✅ 已上传，可直接提交' : ''}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-text-tertiary">
                  支持 PDF、Word、TXT、Markdown 等格式，文件将自动向量化
                  {uploadedFileId && (
                    <span className="block mt-1 text-green-600 dark:text-green-400">
                      ✓ 文件已上传，可直接点击"添加"按钮提交
                    </span>
                  )}
                </p>
              </div>
              {!uploadedFileId && (
                <div className="text-sm text-text-secondary">或手动输入：</div>
              )}
              {!uploadedFileId && (
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
                </>
              )}
              {uploadedFileId && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-text-primary">标题（可选）</label>
                    <input
                      type="text"
                      value={formData.title || ''}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      className="mt-1 block w-full rounded border border-border-light bg-surface-secondary px-3 py-2 text-sm text-text-primary"
                      placeholder={`默认: ${uploadedFile?.name || '文档'}`}
                      aria-label="标题"
                    />
                    <p className="mt-1 text-xs text-text-tertiary">
                      留空将使用文件名作为标题
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-primary">内容（可选）</label>
                    <textarea
                      value={formData.content || ''}
                      onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                      rows={6}
                      className="mt-1 block w-full rounded border border-border-light bg-surface-secondary px-3 py-2 text-sm text-text-primary"
                      placeholder="文档已上传，内容可选填写"
                      aria-label="内容"
                    />
                    <p className="mt-1 text-xs text-text-tertiary">
                      文档内容已从上传的文件中提取，此处可填写补充说明
                    </p>
                  </div>
                </>
              )}
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

          {type !== 'semantic_model' || (semanticModelImportMode === 'file' && fileContent) || (semanticModelImportMode !== 'database' && semanticModelImportMode !== null) ? (
            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                onClick={onClose}
                className="btn btn-secondary rounded-lg px-4 py-2"
              >
                取消
              </Button>
              {(type !== 'semantic_model' || semanticModelImportMode === 'file') && (
                <Button
                  type="submit"
                  disabled={isLoading}
                  className="btn btn-primary rounded-lg px-4 py-2"
                >
                  {isLoading ? '添加中...' : '添加'}
                </Button>
              )}
            </div>
          ) : null}
          </form>
        )}
      </div>
    </div>
  );
}

interface ViewKnowledgeModalProps {
  entry: KnowledgeEntry;
  onClose: () => void;
}

function ViewKnowledgeModal({ entry, onClose }: ViewKnowledgeModalProps) {
  const [isContentExpanded, setIsContentExpanded] = useState(false);
  const [isMetadataExpanded, setIsMetadataExpanded] = useState(false);
  const [isSemanticDescriptionExpanded, setIsSemanticDescriptionExpanded] = useState(false);
  const isSemanticModel = entry.type === 'semantic_model';

  const formatMetadata = (metadata: Record<string, any>): string => {
    try {
      // 对于语义模型，排除 semantic_description（因为它有独立的展示区域）
      const metadataToDisplay = { ...metadata };
      if (isSemanticModel && metadataToDisplay.semantic_description) {
        delete metadataToDisplay.semantic_description;
      }
      return JSON.stringify(metadataToDisplay, null, 2);
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

          {/* 语义模型说明（仅对数据库级别的语义模型显示） */}
          {isSemanticModel && entry.metadata?.is_database_level && entry.metadata?.semantic_description && (
            <div>
              <button
                type="button"
                onClick={() => setIsSemanticDescriptionExpanded(!isSemanticDescriptionExpanded)}
                className="mb-2 flex w-full items-center justify-between rounded-lg border border-border-light bg-surface-secondary px-4 py-3 transition-colors hover:bg-surface-hover"
                aria-label={isSemanticDescriptionExpanded ? '收起语义模型说明' : '展开语义模型说明'}
              >
                <div className="flex items-center gap-2">
                  {isSemanticDescriptionExpanded ? (
                    <ChevronDown className="h-4 w-4 text-text-secondary" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-text-secondary" />
                  )}
                  <span className="text-sm font-medium text-text-primary">语义模型说明</span>
                </div>
                <span className="text-xs text-text-tertiary">
                  {isSemanticDescriptionExpanded ? '点击收起' : '点击展开'}
                </span>
              </button>
              {isSemanticDescriptionExpanded && (
                <div className="rounded-lg border border-border-light bg-surface-secondary px-4 py-3">
                  <div className="max-h-96 overflow-auto text-sm text-text-primary whitespace-pre-wrap leading-relaxed">
                    <div className="text-text-primary">
                      {entry.metadata.semantic_description.split('\n').map((line, index) => {
                        // 检测 emoji 开头的行（表标题）
                        if (/^[1-9]️⃣/.test(line.trim())) {
                          return (
                            <div key={index} className="font-semibold text-base mt-4 mb-2 text-text-primary">
                              {line}
                            </div>
                          );
                        }
                        // 检测 "核心语义："、"可直接识别" 等标题
                        if (line.trim().endsWith('：') || line.trim().endsWith(':')) {
                          return (
                            <div key={index} className="font-medium mt-3 mb-1 text-text-primary">
                              {line}
                            </div>
                          );
                        }
                        // 检测列表项
                        if (line.trim().startsWith('-')) {
                          return (
                            <div key={index} className="ml-4 text-text-secondary">
                              {line}
                            </div>
                          );
                        }
                        // 检测分隔线
                        if (line.trim() === '---') {
                          return <hr key={index} className="my-4 border-border-light" />;
                        }
                        // 普通文本
                        if (line.trim()) {
                          return (
                            <div key={index} className="mb-1 text-text-secondary">
                              {line}
                            </div>
                          );
                        }
                        // 空行
                        return <br key={index} />;
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div>
            {isSemanticModel ? (
              <>
                <button
                  type="button"
                  onClick={() => setIsContentExpanded(!isContentExpanded)}
                  className="mb-2 flex w-full items-center justify-between rounded-lg border border-border-light bg-surface-secondary px-4 py-3 transition-colors hover:bg-surface-hover"
                  aria-label={isContentExpanded ? '收起内容' : '展开内容'}
                >
                  <div className="flex items-center gap-2">
                    {isContentExpanded ? (
                      <ChevronDown className="h-4 w-4 text-text-secondary" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-text-secondary" />
                    )}
                    <span className="text-sm font-medium text-text-primary">内容</span>
                  </div>
                  <span className="text-xs text-text-tertiary">
                    {isContentExpanded ? '点击收起' : '点击展开'}
                  </span>
                </button>
                {isContentExpanded && (
                  <div className="rounded-lg border border-border-light bg-surface-secondary px-4 py-3">
                    <div className="max-h-96 overflow-auto text-sm text-text-primary font-mono whitespace-pre-wrap">
                      {formatContent(entry.content)}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <label className="block text-sm font-medium text-text-primary mb-1">内容</label>
                <div className="rounded-lg border border-border-light bg-surface-secondary px-4 py-3">
                  <div className="max-h-64 overflow-auto text-sm text-text-primary font-mono whitespace-pre-wrap">
                    {entry.content}
                  </div>
                </div>
              </>
            )}
          </div>

          {entry.metadata && Object.keys(entry.metadata).length > 0 && (
            <div>
              {isSemanticModel ? (
                <>
                  <button
                    type="button"
                    onClick={() => setIsMetadataExpanded(!isMetadataExpanded)}
                    className="mb-2 flex w-full items-center justify-between rounded-lg border border-border-light bg-surface-secondary px-4 py-3 transition-colors hover:bg-surface-hover"
                    aria-label={isMetadataExpanded ? '收起元数据' : '展开元数据'}
                  >
                    <div className="flex items-center gap-2">
                      {isMetadataExpanded ? (
                        <ChevronDown className="h-4 w-4 text-text-secondary" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-text-secondary" />
                      )}
                      <span className="text-sm font-medium text-text-primary">元数据</span>
                    </div>
                    <span className="text-xs text-text-tertiary">
                      {isMetadataExpanded ? '点击收起' : '点击展开'}
                    </span>
                  </button>
                  {isMetadataExpanded && (
                    <div className="rounded-lg border border-border-light bg-surface-secondary px-4 py-3">
                      <div className="max-h-96 overflow-auto text-sm text-text-primary font-mono whitespace-pre-wrap">
                        {formatMetadata(entry.metadata)}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <label className="block text-sm font-medium text-text-primary mb-1">元数据</label>
                  <div className="rounded-lg border border-border-light bg-surface-secondary px-4 py-3">
                    <div className="max-h-64 overflow-auto text-sm text-text-primary font-mono whitespace-pre-wrap">
                      {formatMetadata(entry.metadata)}
                    </div>
                  </div>
                </>
              )}
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

interface EditKnowledgeModalProps {
  entry: KnowledgeEntry;
  dataSourceId: string;
  onClose: () => void;
  onUpdate: (payload: { type: 'qa_pair' | 'synonym' | 'business_knowledge'; data: Record<string, any> }) => void;
  isLoading: boolean;
}

function EditKnowledgeModal({ entry, dataSourceId, onClose, onUpdate, isLoading }: EditKnowledgeModalProps) {
  const { showToast } = useToastContext();
  const [formData, setFormData] = useState<Record<string, any>>({});

  // 初始化表单数据
  React.useEffect(() => {
    if (entry.type === 'qa_pair') {
      setFormData({
        question: entry.metadata?.question || '',
        answer: entry.metadata?.answer || '',
      });
    } else if (entry.type === 'synonym') {
      setFormData({
        noun: entry.metadata?.noun || '',
        synonyms: Array.isArray(entry.metadata?.synonyms)
          ? entry.metadata.synonyms.join(', ')
          : entry.metadata?.synonyms || '',
      });
    } else if (entry.type === 'business_knowledge') {
      setFormData({
        title: entry.title || '',
        content: entry.content || '',
        category: entry.metadata?.category || '',
        tags: Array.isArray(entry.metadata?.tags)
          ? entry.metadata.tags.join(', ')
          : entry.metadata?.tags || '',
      });
    }
  }, [entry]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (entry.type === 'qa_pair') {
      if (!formData.question || !formData.answer) {
        showToast({
          message: '请填写问题和答案',
          status: 'error',
        });
        return;
      }
      onUpdate({
        type: 'qa_pair',
        data: {
          question: formData.question || '',
          answer: formData.answer || '',
        },
      });
    } else if (entry.type === 'synonym') {
      if (!formData.noun || !formData.synonyms) {
        showToast({
          message: '请填写名词和同义词',
          status: 'error',
        });
        return;
      }
      onUpdate({
        type: 'synonym',
        data: {
          noun: formData.noun || '',
          synonyms: Array.isArray(formData.synonyms)
            ? formData.synonyms
            : formData.synonyms?.split(',').map((s: string) => s.trim()) || [],
        },
      });
    } else if (entry.type === 'business_knowledge') {
      if (!formData.title || !formData.content) {
        showToast({
          message: '请填写标题和内容',
          status: 'error',
        });
        return;
      }
      onUpdate({
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
            编辑{tabs.find((t) => t.id === entry.type)?.label}
          </h3>
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

        <form onSubmit={handleSubmit} className="space-y-4">
          {entry.type === 'qa_pair' && (
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

          {entry.type === 'synonym' && (
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
                  aria-label="同义词"
                />
                <p className="mt-1 text-xs text-text-tertiary">多个同义词用逗号分隔</p>
              </div>
            </>
          )}

          {entry.type === 'business_knowledge' && (
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
                  placeholder="输入分类"
                  aria-label="分类"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary">标签</label>
                <input
                  type="text"
                  value={formData.tags || ''}
                  onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                  className="mt-1 block w-full rounded border border-border-light bg-surface-secondary px-3 py-2 text-sm text-text-primary"
                  placeholder="用逗号分隔，例如：重要, 常用, 基础"
                  aria-label="标签"
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
              {isLoading ? '更新中...' : '更新'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}