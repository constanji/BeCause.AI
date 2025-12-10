import React, { useState, useEffect } from 'react';
import { Button, useToastContext, Switch } from '@aipyq/client';
import { useQueryClient } from '@tanstack/react-query';
import { QueryKeys } from '@aipyq/data-provider';
import { useGetStartupConfig } from '~/data-provider';
import { useLocalize, useAuthContext } from '~/hooks';
import type { TInterfaceConfig } from '@aipyq/data-provider';

interface FeaturesManagementProps {
  startupConfig?: any;
}

interface InterfaceConfig {
  customWelcome?: string;
  fileSearch?: boolean;
  endpointsMenu?: boolean;
  modelSelect?: boolean;
  parameters?: boolean;
  sidePanel?: boolean;
  presets?: boolean;
  prompts?: boolean;
  multiConvo?: boolean;
  agents?: boolean;
  temporaryChat?: boolean;
  bookmarks?: boolean;
  peoplePicker?: {
    users?: boolean;
    groups?: boolean;
    roles?: boolean;
  };
  marketplace?: {
    use?: boolean;
  };
  fileCitations?: boolean;
}

export default function FeaturesManagement({ startupConfig: propStartupConfig }: FeaturesManagementProps) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { token } = useAuthContext();
  const queryClient = useQueryClient();
  const { data: startupConfigFromQuery, refetch } = useGetStartupConfig();
  const startupConfig = propStartupConfig || startupConfigFromQuery;

  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [config, setConfig] = useState<InterfaceConfig>({});

  // 从 startupConfig 加载配置
  useEffect(() => {
    if (startupConfig?.interface) {
      setConfig(startupConfig.interface as InterfaceConfig);
      setIsLoading(false);
    } else {
      setIsLoading(false);
    }
  }, [startupConfig]);

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

      const response = await fetch(`${apiBase}/api/config/interface`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ interface: config }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || '保存失败');
      }

      showToast({
        message: '功能配置保存成功',
        status: 'success',
      });

      // 清除缓存并刷新配置
      queryClient.invalidateQueries([QueryKeys.startupConfig]);
      const result = await refetch();
      
      // 确保本地状态更新
      if (result.data?.interface) {
        setConfig(result.data.interface as InterfaceConfig);
      }
    } catch (error) {
      showToast({
        message: `保存失败: ${error instanceof Error ? error.message : '未知错误'}`,
        status: 'error',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // 更新配置值
  const updateConfig = (key: keyof InterfaceConfig, value: any) => {
    setConfig((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  // 更新嵌套配置值
  const updateNestedConfig = (parentKey: keyof InterfaceConfig, childKey: string, value: any) => {
    setConfig((prev) => {
      const currentParent = prev[parentKey];
      const parentValue = currentParent && typeof currentParent === 'object' 
        ? { ...currentParent } 
        : {};
      return {
        ...prev,
        [parentKey]: {
          ...parentValue,
          [childKey]: value,
        },
      };
    });
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
          <h2 className="text-lg font-semibold text-text-primary">启用功能管理</h2>
          <p className="mt-1 text-sm text-text-secondary">
            管理界面功能的启用和禁用，这些配置将保存到 Aipyq.yaml 文件中
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
          {/* 欢迎消息 */}
          <div className="rounded-lg border border-border-light bg-surface-secondary p-4">
            <label className="mb-2 block text-sm font-medium text-text-primary">
              自定义欢迎消息
            </label>
            <input
              type="text"
              value={config.customWelcome || ''}
              onChange={(e) => updateConfig('customWelcome', e.target.value)}
              placeholder="欢迎来到每日AI朋友圈！祝您体验愉快。"
              className="w-full rounded-md border border-border-light bg-surface-primary px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-primary focus:outline-none"
            />
          </div>

          {/* 基础功能开关 */}
          <div className="rounded-lg border border-border-light bg-surface-secondary p-4">
            <h3 className="mb-4 text-sm font-semibold text-text-primary">基础功能</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-text-primary">文件搜索</div>
                  <div className="text-xs text-text-secondary">启用文件搜索功能</div>
                </div>
                <Switch
                  id="fileSearch"
                  checked={config.fileSearch ?? true}
                  onCheckedChange={(checked) => updateConfig('fileSearch', checked)}
                  aria-label="文件搜索"
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-text-primary">端点菜单</div>
                  <div className="text-xs text-text-secondary">显示端点选择菜单</div>
                </div>
                <Switch
                  id="endpointsMenu"
                  checked={config.endpointsMenu ?? true}
                  onCheckedChange={(checked) => updateConfig('endpointsMenu', checked)}
                  aria-label="端点菜单"
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-text-primary">模型选择</div>
                  <div className="text-xs text-text-secondary">显示模型选择器</div>
                </div>
                <Switch
                  id="modelSelect"
                  checked={config.modelSelect ?? true}
                  onCheckedChange={(checked) => updateConfig('modelSelect', checked)}
                  aria-label="模型选择"
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-text-primary">参数设置</div>
                  <div className="text-xs text-text-secondary">显示参数配置选项</div>
                </div>
                <Switch
                  id="parameters"
                  checked={config.parameters ?? true}
                  onCheckedChange={(checked) => updateConfig('parameters', checked)}
                  aria-label="参数设置"
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-text-primary">右侧边栏</div>
                  <div className="text-xs text-text-secondary">显示右侧控制面板</div>
                </div>
                <Switch
                  id="sidePanel"
                  checked={config.sidePanel ?? true}
                  onCheckedChange={(checked) => updateConfig('sidePanel', checked)}
                  aria-label="右侧边栏"
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-text-primary">文件引用</div>
                  <div className="text-xs text-text-secondary">显示文件引用功能</div>
                </div>
                <Switch
                  id="fileCitations"
                  checked={config.fileCitations ?? true}
                  onCheckedChange={(checked) => updateConfig('fileCitations', checked)}
                  aria-label="文件引用"
                />
              </div>
            </div>
          </div>

          {/* 对话功能 */}
          <div className="rounded-lg border border-border-light bg-surface-secondary p-4">
            <h3 className="mb-4 text-sm font-semibold text-text-primary">对话功能</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-text-primary">预设</div>
                  <div className="text-xs text-text-secondary">启用预设功能</div>
                </div>
                <Switch
                  id="presets"
                  checked={config.presets ?? true}
                  onCheckedChange={(checked) => updateConfig('presets', checked)}
                  aria-label="预设"
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-text-primary">提示词</div>
                  <div className="text-xs text-text-secondary">启用提示词功能</div>
                </div>
                <Switch
                  id="prompts"
                  checked={config.prompts ?? true}
                  onCheckedChange={(checked) => updateConfig('prompts', checked)}
                  aria-label="提示词"
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-text-primary">多轮对话</div>
                  <div className="text-xs text-text-secondary">启用多轮对话功能</div>
                </div>
                <Switch
                  id="multiConvo"
                  checked={config.multiConvo ?? true}
                  onCheckedChange={(checked) => updateConfig('multiConvo', checked)}
                  aria-label="多轮对话"
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-text-primary">临时对话</div>
                  <div className="text-xs text-text-secondary">启用临时对话功能</div>
                </div>
                <Switch
                  id="temporaryChat"
                  checked={config.temporaryChat ?? true}
                  onCheckedChange={(checked) => updateConfig('temporaryChat', checked)}
                  aria-label="临时对话"
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-text-primary">书签</div>
                  <div className="text-xs text-text-secondary">启用书签功能</div>
                </div>
                <Switch
                  id="bookmarks"
                  checked={config.bookmarks ?? true}
                  onCheckedChange={(checked) => updateConfig('bookmarks', checked)}
                  aria-label="书签"
                />
              </div>
            </div>
          </div>

          {/* 智能体功能 */}
          <div className="rounded-lg border border-border-light bg-surface-secondary p-4">
            <h3 className="mb-4 text-sm font-semibold text-text-primary">智能体功能</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-text-primary">智能体</div>
                  <div className="text-xs text-text-secondary">启用智能体功能</div>
                </div>
                <Switch
                  id="agents"
                  checked={config.agents ?? true}
                  onCheckedChange={(checked) => updateConfig('agents', checked)}
                  aria-label="智能体"
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-text-primary">市场</div>
                  <div className="text-xs text-text-secondary">启用智能体市场</div>
                </div>
                <Switch
                  id="marketplace"
                  checked={config.marketplace?.use ?? false}
                  onCheckedChange={(checked) => updateNestedConfig('marketplace', 'use', checked)}
                  aria-label="市场"
                />
              </div>
            </div>
          </div>

          {/* 人员选择器 */}
          <div className="rounded-lg border border-border-light bg-surface-secondary p-4">
            <h3 className="mb-4 text-sm font-semibold text-text-primary">人员选择器</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-text-primary">用户</div>
                  <div className="text-xs text-text-secondary">在选择器中显示用户</div>
                </div>
                <Switch
                  id="peoplePickerUsers"
                  checked={config.peoplePicker?.users ?? true}
                  onCheckedChange={(checked) => updateNestedConfig('peoplePicker', 'users', checked)}
                  aria-label="用户"
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-text-primary">组</div>
                  <div className="text-xs text-text-secondary">在选择器中显示组</div>
                </div>
                <Switch
                  id="peoplePickerGroups"
                  checked={config.peoplePicker?.groups ?? true}
                  onCheckedChange={(checked) => updateNestedConfig('peoplePicker', 'groups', checked)}
                  aria-label="组"
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-text-primary">角色</div>
                  <div className="text-xs text-text-secondary">在选择器中显示角色</div>
                </div>
                <Switch
                  id="peoplePickerRoles"
                  checked={config.peoplePicker?.roles ?? true}
                  onCheckedChange={(checked) => updateNestedConfig('peoplePicker', 'roles', checked)}
                  aria-label="角色"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

