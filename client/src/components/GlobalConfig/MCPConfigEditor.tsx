import React, { useState, useEffect } from 'react';
import { Button, useToastContext } from '@because/client';
import { useForm, Controller } from 'react-hook-form';
import { cn, defaultTextProps } from '~/utils';
import { ArrowLeft, Server, Globe, Settings2, Zap, Terminal, Radio } from 'lucide-react';

interface MCPServerConfig {
  serverName: string;
  config: {
    type?: string;
    url?: string;
    chatMenu?: boolean;
    startup?: boolean;
    customUserVars?: Record<string, any>;
    [key: string]: any;
  };
}

interface MCPConfigEditorProps {
  server?: MCPServerConfig;
  onSave: (server: MCPServerConfig) => Promise<void>;
  onCancel: () => void;
}

const CONNECTION_TYPES = [
  {
    value: 'streamable-http',
    label: 'Streamable HTTP',
    icon: Globe,
    description: '通过 HTTP 流式传输',
  },
  {
    value: 'sse',
    label: 'SSE',
    icon: Radio,
    description: '服务器发送事件',
  },
  {
    value: 'stdio',
    label: 'stdio',
    icon: Terminal,
    description: '标准输入/输出',
  },
];

function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (val: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked ? 'true' : 'false'}
      aria-label={label ?? (checked ? '已开启' : '已关闭')}
      title={label ?? (checked ? '已开启' : '已关闭')}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:ring-offset-transparent',
        checked ? 'bg-green-500' : 'bg-gray-600',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <span
        className={cn(
          'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
          checked ? 'translate-x-4' : 'translate-x-0',
        )}
      />
    </button>
  );
}

export default function MCPConfigEditor({ server, onSave, onCancel }: MCPConfigEditorProps) {
  const { showToast } = useToastContext();
  const isEditing = !!server;

  const {
    control,
    handleSubmit,
    formState: { isSubmitting, isDirty, errors },
    reset,
    watch,
  } = useForm<MCPServerConfig>({
    defaultValues: server || {
      serverName: '',
      config: {
        type: 'streamable-http',
        url: '',
        chatMenu: false,
        startup: false,
        customUserVars: {},
      },
    },
  });

  useEffect(() => {
    if (server) reset(server);
  }, [server, reset]);

  const onSubmit = async (data: MCPServerConfig) => {
    try {
      await onSave({
        ...data,
        config: { ...data.config, chatMenu: data.config.chatMenu ?? false },
      });
      showToast({
        message: isEditing ? 'MCP服务器配置更新成功' : 'MCP服务器配置创建成功',
        status: 'success',
      });
    } catch (error) {
      showToast({
        message: `保存失败: ${error instanceof Error ? error.message : '未知错误'}`,
        status: 'error',
      });
    }
  };

  const currentType = watch('config.type') || 'streamable-http';
  const needsUrl = currentType !== 'stdio';

  return (
    <div className="flex h-full flex-col">
      <form onSubmit={handleSubmit(onSubmit)} className="flex h-full flex-col">
        {/* ── 顶部导航栏 ── */}
        <div className="mb-5 flex items-center gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-border-light text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
            aria-label="返回"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Server className="h-4 w-4 flex-shrink-0 text-green-400" />
            <h2 className="truncate text-base font-semibold text-text-primary">
              {isEditing ? `编辑 · ${server.serverName}` : '添加 MCP 服务器'}
            </h2>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border border-border-light px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={(!isDirty && isEditing) || isSubmitting}
              className="rounded-lg bg-green-500 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? '保存中…' : '保存'}
            </button>
          </div>
        </div>

        {/* ── 表单内容 ── */}
        <div className="flex-1 overflow-auto">
          <div className="space-y-4">
            {/* 服务器信息 */}
            <div className="rounded-xl border border-border-light bg-surface-primary">
              <div className="flex items-center gap-2 border-b border-border-light px-5 py-3.5">
                <Server className="h-4 w-4 text-green-400" />
                <span className="text-sm font-semibold text-text-primary">服务器信息</span>
              </div>
              <div className="space-y-5 p-5">
                {/* 服务器名称 */}
                <div>
                  <label className="mb-1.5 flex items-center gap-1 text-sm font-medium text-text-primary">
                    服务器名称
                    <span className="text-red-400">*</span>
                  </label>
                  <Controller
                    name="serverName"
                    control={control}
                    rules={{ required: '请输入服务器名称' }}
                    render={({ field }) => (
                      <input
                        {...field}
                        disabled={isEditing}
                        className={cn(
                          defaultTextProps,
                          'w-full px-3 py-2',
                          isEditing && 'cursor-not-allowed opacity-60',
                          errors.serverName && 'border-red-400',
                        )}
                        placeholder="例如：my-mcp-server"
                        autoFocus={!isEditing}
                      />
                    )}
                  />
                  {errors.serverName ? (
                    <p className="mt-1 text-xs text-red-400">{errors.serverName.message}</p>
                  ) : (
                    <p className="mt-1 text-xs text-text-secondary">
                      {isEditing ? '服务器名称创建后不可修改' : '用于唯一标识此 MCP 服务器'}
                    </p>
                  )}
                </div>

                {/* 连接类型 */}
                <div>
                  <label className="mb-1.5 text-sm font-medium text-text-primary">
                    连接类型 <span className="text-red-400">*</span>
                  </label>
                  <Controller
                    name="config.type"
                    control={control}
                    rules={{ required: true }}
                    render={({ field }) => (
                      <div className="grid grid-cols-3 gap-2">
                        {CONNECTION_TYPES.map(({ value, label, icon: Icon, description }) => {
                          const active = field.value === value;
                          return (
                            <button
                              key={value}
                              type="button"
                              onClick={() => field.onChange(value)}
                              className={cn(
                                'flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-all',
                                active
                                  ? 'border-green-500 bg-green-500/10 text-text-primary'
                                  : 'border-border-light bg-surface-secondary text-text-secondary hover:border-border-medium hover:bg-surface-hover',
                              )}
                            >
                              <div className="flex w-full items-center justify-between">
                                <Icon
                                  className={cn('h-4 w-4', active ? 'text-green-400' : 'text-text-tertiary')}
                                />
                                {active && (
                                  <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
                                )}
                              </div>
                              <span className={cn('text-sm font-medium', active ? 'text-text-primary' : '')}>
                                {label}
                              </span>
                              <span className="text-xs text-text-secondary">{description}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  />
                </div>

                {/* URL */}
                {needsUrl && (
                  <div>
                    <label className="mb-1.5 text-sm font-medium text-text-primary">
                      服务器地址 <span className="text-red-400">*</span>
                    </label>
                    <Controller
                      name="config.url"
                      control={control}
                      rules={{ required: needsUrl ? '请输入服务器地址' : false }}
                      render={({ field }) => (
                        <div className="flex overflow-hidden rounded-md border border-gray-200 focus-within:border-gray-400 dark:border-gray-600 dark:focus-within:border-gray-500">
                          <span className="flex items-center border-r border-gray-200 bg-surface-secondary px-3 text-xs font-mono text-text-secondary dark:border-gray-600">
                            URL
                          </span>
                          <input
                            {...field}
                            className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-secondary dark:bg-transparent"
                            placeholder="https://mcp.example.com/mcp"
                          />
                        </div>
                      )}
                    />
                    <p className="mt-1 text-xs text-text-secondary">MCP 服务器的完整连接地址</p>
                  </div>
                )}
              </div>
            </div>

            {/* 可选配置 */}
            <div className="rounded-xl border border-border-light bg-surface-primary">
              <div className="flex items-center gap-2 border-b border-border-light px-5 py-3.5">
                <Settings2 className="h-4 w-4 text-text-secondary" />
                <span className="text-sm font-semibold text-text-primary">可选配置</span>
              </div>
              <div className="divide-y divide-border-light">
                {/* 聊天菜单 */}
                <div className="flex items-center justify-between px-5 py-4">
                  <div>
                    <p className="text-sm font-medium text-text-primary">在聊天菜单中显示</p>
                    <p className="mt-0.5 text-xs text-text-secondary">
                      允许用户在对话中直接选择此服务器
                    </p>
                  </div>
                  <Controller
                    name="config.chatMenu"
                    control={control}
                    render={({ field }) => (
                      <Toggle
                        checked={field.value ?? false}
                        onChange={field.onChange}
                      />
                    )}
                  />
                </div>
                {/* 启动时连接 */}
                <div className="flex items-center justify-between px-5 py-4">
                  <div>
                    <p className="text-sm font-medium text-text-primary">启动时自动连接</p>
                    <p className="mt-0.5 text-xs text-text-secondary">
                      系统启动时自动建立与此服务器的连接
                    </p>
                  </div>
                  <Controller
                    name="config.startup"
                    control={control}
                    render={({ field }) => (
                      <Toggle
                        checked={field.value ?? false}
                        onChange={field.onChange}
                      />
                    )}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
