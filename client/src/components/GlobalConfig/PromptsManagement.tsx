import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Button, useToastContext, Dropdown } from '@because/client';
import { useQueryClient } from '@tanstack/react-query';
import { QueryKeys } from '@because/data-provider';
import { useGetStartupConfig } from '~/data-provider';
import { useListDataSourcesQuery } from '~/data-provider/DataSources';
import { useLocalize, useAuthContext } from '~/hooks';
import { Plus, Trash2, Server, Globe } from 'lucide-react';
import {
  BulbOutlined,
  InfoCircleOutlined,
  RocketOutlined,
  SmileOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import type { TStartupConfig } from '@because/data-provider';
import type { DataSource } from '@because/data-provider';
import { cn, defaultTextProps } from '~/utils';

interface PromptsManagementProps {
  startupConfig?: TStartupConfig;
}

interface PromptItem {
  key: string;
  icon: string;
  label: string;
  description: string;
  prompt: string;
}

interface PromptsConfig {
  title?: string;
  items: PromptItem[];
}

interface AgentPromptsConfig {
  global?: PromptsConfig;
  dataSources?: Record<string, PromptsConfig>;
}

const iconOptions = [
  { value: 'bulb', label: '灯泡', icon: <BulbOutlined /> },
  { value: 'info', label: '信息', icon: <InfoCircleOutlined /> },
  { value: 'rocket', label: '火箭', icon: <RocketOutlined /> },
  { value: 'smile', label: '笑脸', icon: <SmileOutlined /> },
  { value: 'warning', label: '警告', icon: <WarningOutlined /> },
];

// 预览组件：显示提示项的实际效果
function PromptItemPreview({ item, compact = false }: { item: PromptItem; compact?: boolean }) {
  const getIconComponent = useCallback((iconType: string) => {
    const iconProps = { className: compact ? 'text-sm' : 'text-base' };
    switch (iconType) {
      case 'bulb':
        return <BulbOutlined {...iconProps} style={{ color: '#FFD700' }} />;
      case 'info':
        return <InfoCircleOutlined {...iconProps} style={{ color: '#1890FF' }} />;
      case 'rocket':
        return <RocketOutlined {...iconProps} style={{ color: '#722ED1' }} />;
      case 'smile':
        return <SmileOutlined {...iconProps} style={{ color: '#52C41A' }} />;
      case 'warning':
        return <WarningOutlined {...iconProps} style={{ color: '#FF4D4F' }} />;
      default:
        return <BulbOutlined {...iconProps} style={{ color: '#FFD700' }} />;
    }
  }, [compact]);

  return (
    <div
      className={cn(
        'group relative flex cursor-default flex-col gap-2 rounded-xl',
        'border border-border-light bg-surface-tertiary text-start align-top',
        'shadow-sm transition-all duration-200',
        'hover:border-green-500/30 hover:bg-surface-hover hover:shadow-md',
        compact ? 'w-full px-3 pb-3 pt-2.5 text-sm' : 'w-52 px-3 pb-4 pt-3 text-[15px]',
      )}
    >
      <div className="flex items-center gap-2">
        <span className="flex-shrink-0">{getIconComponent(item.icon)}</span>
        <span className="line-clamp-2 overflow-hidden text-balance break-words text-sm font-semibold text-text-primary">
          {item.label || '未设置标签'}
        </span>
      </div>
      {item.description && (
        <p className="line-clamp-2 overflow-hidden text-balance break-all text-xs text-text-secondary">
          {item.description}
        </p>
      )}
    </div>
  );
}

function PromptItemCard({
  item,
  index,
  onUpdate,
  onDelete,
}: {
  item: PromptItem;
  index: number;
  onUpdate: (field: keyof PromptItem, value: string) => void;
  onDelete: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border-light bg-surface-primary">
      {/* 卡片头 */}
      <div className="flex items-center justify-between border-b border-border-light px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-green-500/15 text-xs font-semibold text-green-400">
            {index + 1}
          </span>
          <span className="text-sm font-semibold text-text-primary">
            {item.label || `提示项 ${index + 1}`}
          </span>
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-text-secondary transition-colors hover:bg-red-500/10 hover:text-red-400"
          aria-label={`删除提示项 ${index + 1}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
          删除
        </button>
      </div>

      <div className="grid grid-cols-1 gap-0 lg:grid-cols-5">
        {/* 左侧：配置表单 */}
        <div className="space-y-4 border-border-light p-4 lg:col-span-3 lg:border-r">
          {/* 图标类型 */}
          <div>
            <label className="mb-2 block text-sm font-medium text-text-primary">图标类型</label>
            <div className="flex flex-wrap gap-2">
              {iconOptions.map((option) => {
                const active = item.icon === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => onUpdate('icon', option.value)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-all',
                      active
                        ? 'border-green-500 bg-green-500/10 text-text-primary'
                        : 'border-border-light bg-surface-secondary text-text-secondary hover:border-green-500/30 hover:bg-surface-hover',
                    )}
                    aria-pressed={active}
                  >
                    <span className={cn(active && 'text-green-400')}>{option.icon}</span>
                    <span>{option.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 标签 */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-primary">标签</label>
            <input
              type="text"
              value={item.label}
              onChange={(e) => onUpdate('label', e.target.value)}
              placeholder="输入提示项标签"
              className={cn(defaultTextProps, 'w-full px-3 py-2 focus:ring-green-500/30')}
            />
          </div>

          {/* 描述 */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-primary">描述</label>
            <textarea
              value={item.description}
              onChange={(e) => onUpdate('description', e.target.value)}
              placeholder="输入提示项描述，显示在卡片下方"
              rows={2}
              className={cn(defaultTextProps, 'w-full resize-none px-3 py-2 focus:ring-green-500/30')}
            />
          </div>

          {/* 提示内容 */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-primary">提示内容</label>
            <p className="mb-1.5 text-xs text-text-secondary">
              点击后发送的提示内容（留空则使用标签）
            </p>
            <textarea
              value={item.prompt}
              onChange={(e) => onUpdate('prompt', e.target.value)}
              placeholder="输入点击后发送的完整提示内容"
              rows={3}
              className={cn(defaultTextProps, 'w-full resize-none px-3 py-2 focus:ring-green-500/30')}
            />
          </div>
        </div>

        {/* 右侧：实时预览 */}
        <div className="flex flex-col bg-surface-secondary/50 p-4 lg:col-span-2">
          <div className="mb-3">
            <p className="text-sm font-medium text-text-primary">预览效果</p>
            <p className="mt-0.5 text-xs text-text-secondary">
              实时预览在聊天界面中的显示效果
            </p>
          </div>
          <div className="flex flex-1 items-start justify-center rounded-lg border border-dashed border-green-500/20 bg-surface-tertiary/50 p-4">
            <PromptItemPreview item={item} compact />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PromptsManagement({ startupConfig: propStartupConfig }: PromptsManagementProps) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { token } = useAuthContext();
  const queryClient = useQueryClient();
  const { data: startupConfigFromQuery, refetch } = useGetStartupConfig();
  const { data: dataSourcesResponse } = useListDataSourcesQuery();
  const startupConfig = propStartupConfig || startupConfigFromQuery;

  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [dataSource, setDataSource] = useState<'global' | string>('global');
  const [config, setConfig] = useState<AgentPromptsConfig>({
    global: {
      title: '✨ 提示集',
      items: [],
    },
    dataSources: {},
  });

  // 获取数据源列表
  const dataSourcesList = useMemo(() => {
    if (!dataSourcesResponse?.data) {
      return [];
    }
    return dataSourcesResponse.data
      .filter((ds: DataSource) => ds.status === 'active')
      .map((ds: DataSource) => ({
        id: ds._id,
        name: ds.name || '未命名数据源',
        type: ds.type,
        database: ds.database,
      }));
  }, [dataSourcesResponse]);

  const dataSourceOptions = useMemo(
    () => [
      { value: 'global', label: '全局提示集' },
      ...dataSourcesList.map((ds) => ({
        value: ds.id,
        label: ds.name,
      })),
    ],
    [dataSourcesList],
  );

  const selectedDataSourceInfo =
    dataSource === 'global'
      ? null
      : dataSourcesList.find((ds) => ds.id === dataSource) ?? null;

  // 从 startupConfig 加载配置
  useEffect(() => {
    if (startupConfig?.agentPrompts) {
      const loadedConfig: AgentPromptsConfig = {
        global: startupConfig.agentPrompts.global || {
          title: '✨ 提示集',
          items: [],
        },
        dataSources: startupConfig.agentPrompts.dataSources || {},
      };
      setConfig(loadedConfig);
    }
    setIsLoading(false);
  }, [startupConfig]);

  // 获取当前数据源的配置
  const currentConfig = useMemo(() => {
    if (dataSource === 'global') {
      return config.global || { title: '✨ 提示集', items: [] };
    }
    return config.dataSources?.[dataSource] || { title: '✨ 提示集', items: [] };
  }, [config, dataSource]);

  // 更新当前配置
  const updateCurrentConfig = useCallback(
    (updater: (prev: PromptsConfig) => PromptsConfig) => {
      setConfig((prev) => {
        const newConfig = { ...prev };
        if (dataSource === 'global') {
          newConfig.global = updater(prev.global || { title: '✨ 提示集', items: [] });
        } else {
          newConfig.dataSources = { ...(prev.dataSources || {}) };
          newConfig.dataSources[dataSource] = updater(
            prev.dataSources?.[dataSource] || { title: '✨ 提示集', items: [] },
          );
        }
        return newConfig;
      });
    },
    [dataSource],
  );

  // 添加提示项
  const handleAddItem = useCallback(() => {
    updateCurrentConfig((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          key: `prompt-${Date.now()}`,
          icon: 'bulb',
          label: '',
          description: '',
          prompt: '',
        },
      ],
    }));
  }, [updateCurrentConfig]);

  // 删除提示项
  const handleDeleteItem = useCallback(
    (key: string) => {
      updateCurrentConfig((prev) => ({
        ...prev,
        items: prev.items.filter((item) => item.key !== key),
      }));
    },
    [updateCurrentConfig],
  );

  // 更新提示项
  const handleUpdateItem = useCallback(
    (key: string, field: keyof PromptItem, value: any) => {
      updateCurrentConfig((prev) => ({
        ...prev,
        items: prev.items.map((item) => (item.key === key ? { ...item, [field]: value } : item)),
      }));
    },
    [updateCurrentConfig],
  );

  // 更新标题
  const handleUpdateTitle = useCallback(
    (title: string) => {
      updateCurrentConfig((prev) => ({ ...prev, title }));
    },
    [updateCurrentConfig],
  );

  // 保存配置
  const handleSave = async () => {
    setIsSaving(true);
    try {
      const baseEl = document.querySelector('base');
      const baseHref = baseEl?.getAttribute('href') || '/';
      const apiBase = baseHref.endsWith('/') ? baseHref.slice(0, -1) : baseHref;

      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };

      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      // 调试：打印要保存的配置
      console.log('[PromptsManagement] Saving config:', JSON.stringify(config, null, 2));
      console.log('[PromptsManagement] Current config items:', currentConfig.items);

      const response = await fetch(`${apiBase}/api/config/agent-prompts`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ agentPrompts: config }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || '保存失败');
      }

      // 清除缓存并刷新配置
      queryClient.invalidateQueries([QueryKeys.startupConfig]);
      await refetch();
      showToast({ status: 'success', message: '提示集配置保存成功' });
    } catch (error: any) {
      console.error('保存提示集配置失败:', error);
      showToast({ status: 'error', message: error.message || '保存失败' });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center text-text-secondary">
        <p className="text-sm">加载中...</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">提示集管理</h2>
          <p className="mt-1 text-sm text-text-secondary">
            配置初始对话界面中显示的提示集
          </p>
        </div>
        <Button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="btn btn-primary relative flex items-center gap-2 rounded-lg px-3 py-2"
        >
          {isSaving ? '保存中...' : '保存配置'}
        </Button>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="space-y-6">
          {/* 数据源选择 */}
          <div className="rounded-xl border border-border-light bg-surface-primary">
            <div className="border-b border-border-light px-4 py-3.5">
              <div className="flex items-center gap-2">
                {dataSource === 'global' ? (
                  <Globe className="h-4 w-4 text-green-400" />
                ) : (
                  <Server className="h-4 w-4 text-green-400" />
                )}
                <span className="text-sm font-semibold text-text-primary">数据源</span>
              </div>
              <p className="mt-1 text-xs text-text-secondary">
                选择要配置的提示集数据源，全局提示集将应用于所有智能体
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 px-4 py-3.5">
              <div className="min-w-0 flex-1 max-w-md">
                <Dropdown
                  value={dataSource}
                  onChange={setDataSource}
                  options={dataSourceOptions}
                  className="w-full rounded-lg border-border-light bg-surface-secondary hover:border-green-500/40 focus:ring-green-500/30"
                  sizeClasses="w-[var(--popover-anchor-width,100%)] min-w-[240px]"
                  ariaLabel="选择提示集数据源"
                />
              </div>
              {dataSource === 'global' ? (
                <span className="rounded-md border border-green-500/20 bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-400">
                  全局
                </span>
              ) : selectedDataSourceInfo ? (
                <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
                  <span className="rounded-md border border-green-500/20 bg-green-500/10 px-2 py-0.5 text-xs font-medium uppercase text-green-400">
                    {selectedDataSourceInfo.type}
                  </span>
                  <span className="rounded-md bg-surface-secondary px-2 py-0.5 text-xs text-text-secondary">
                    {selectedDataSourceInfo.database}
                  </span>
                </div>
              ) : null}
            </div>
          </div>

          {/* 整体预览 */}
          {currentConfig.items.length > 0 && (
            <div className="rounded-xl border border-border-light bg-surface-primary">
              <div className="border-b border-border-light px-4 py-3.5">
                <h3 className="text-sm font-semibold text-text-primary">整体预览</h3>
                <p className="mt-0.5 text-xs text-text-secondary">
                  预览所有提示项在聊天界面中的显示效果
                </p>
              </div>
              <div className="flex min-h-[150px] flex-wrap items-start justify-center gap-3 p-4">
                {currentConfig.items.map((item) => (
                  <PromptItemPreview key={item.key} item={item} />
                ))}
              </div>
            </div>
          )}

          {/* 提示项列表 */}
          <div className="rounded-xl border border-border-light bg-surface-primary">
            <div className="flex items-center justify-between border-b border-border-light px-4 py-3.5">
              <div>
                <h3 className="text-sm font-semibold text-text-primary">提示项</h3>
                <p className="mt-0.5 text-xs text-text-secondary">
                  配置提示集的各个提示项，用户点击后将自动发送对应的提示内容
                </p>
              </div>
              <button
                type="button"
                onClick={handleAddItem}
                className="flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-green-500 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-green-600"
              >
                <Plus className="h-4 w-4" />
                添加提示项
              </button>
            </div>

            <div className="p-4">
              {currentConfig.items.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border-light bg-surface-secondary py-10 text-center">
                  <p className="text-sm text-text-secondary">暂无提示项</p>
                  <p className="mt-1 text-xs text-text-tertiary">点击右上角「添加提示项」开始配置</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {currentConfig.items.map((item, index) => (
                    <PromptItemCard
                      key={item.key}
                      item={item}
                      index={index}
                      onUpdate={(field, value) => handleUpdateItem(item.key, field, value)}
                      onDelete={() => {
                        if (window.confirm('确定要删除这个提示项吗？')) {
                          handleDeleteItem(item.key);
                        }
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

