import React, { useState, useEffect } from 'react';
import { useToastContext } from '@because/client';
import { useForm, Controller, useFieldArray } from 'react-hook-form';
import { cn, defaultTextProps } from '~/utils';
import { ArrowLeft, Plug, Layers, Plus, X } from 'lucide-react';

interface EndpointConfig {
  name: string;
  apiKey: string;
  baseURL: string;
  models: {
    default: string[];
    fetch?: boolean;
  };
  titleConvo?: boolean;
  titleModel?: string;
  modelDisplayLabel?: string;
  iconURL?: string;
  dropParams?: string[];
  forceStringContent?: boolean;
}

interface EndpointConfigEditorProps {
  endpoint?: EndpointConfig;
  onSave: (endpoint: EndpointConfig) => Promise<void>;
  onCancel: () => void;
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (val: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked ? 'true' : 'false'}
      aria-label={label ?? (checked ? '已开启' : '已关闭')}
      title={label ?? (checked ? '已开启' : '已关闭')}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:ring-offset-transparent',
        checked ? 'bg-green-500' : 'bg-gray-600',
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

export default function EndpointConfigEditor({
  endpoint,
  onSave,
  onCancel,
}: EndpointConfigEditorProps) {
  const { showToast } = useToastContext();
  const isEditing = !!endpoint;
  const [editingModelIndex, setEditingModelIndex] = useState<number | null>(null);
  const [editingModelValue, setEditingModelValue] = useState('');

  const {
    control,
    handleSubmit,
    formState: { isSubmitting, isDirty, errors },
    reset,
    watch,
    setValue,
  } = useForm<EndpointConfig>({
    defaultValues: endpoint || {
      name: '',
      apiKey: '',
      baseURL: '',
      models: { default: [], fetch: false },
      titleConvo: true,
      modelDisplayLabel: '',
    },
  });

  const { fields: modelFields, append: appendModel, remove: removeModel } = useFieldArray({
    control,
    name: 'models.default',
  });

  useEffect(() => {
    if (endpoint) {
      reset({
        ...endpoint,
        titleConvo: endpoint.titleConvo ?? true,
        modelDisplayLabel: endpoint.modelDisplayLabel || endpoint.name,
      });
    }
  }, [endpoint, reset]);

  const onSubmit = async (data: EndpointConfig) => {
    try {
      await onSave({
        ...data,
        titleConvo: true,
        modelDisplayLabel: data.name,
      });
      showToast({
        message: isEditing ? '端点配置更新成功' : '端点配置创建成功',
        status: 'success',
      });
    } catch (error) {
      showToast({
        message: `保存失败: ${error instanceof Error ? error.message : '未知错误'}`,
        status: 'error',
      });
    }
  };

  const commitModelEdit = (index: number) => {
    if (editingModelValue.trim()) {
      const currentValues = watch('models.default');
      const updated = [...currentValues];
      updated[index] = editingModelValue.trim();
      setValue('models.default', updated, { shouldDirty: true });
    }
    setEditingModelIndex(null);
    setEditingModelValue('');
  };

  return (
    <div className="flex h-full flex-col">
      <form onSubmit={handleSubmit(onSubmit)} className="flex h-full flex-col">
        {/* 顶部导航栏 */}
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
            <Plug className="h-4 w-4 flex-shrink-0 text-green-400" />
            <h2 className="truncate text-base font-semibold text-text-primary">
              {isEditing ? `编辑 · ${endpoint.name}` : '添加端点配置'}
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

        <div className="flex-1 overflow-auto">
          <div className="space-y-4">
            {/* 必要信息 */}
            <div className="rounded-xl border border-border-light bg-surface-primary">
              <div className="flex items-center gap-2 border-b border-border-light px-5 py-3.5">
                <Plug className="h-4 w-4 text-green-400" />
                <span className="text-sm font-semibold text-text-primary">必要信息</span>
              </div>
              <div className="space-y-5 p-5">
                <div>
                  <label className="mb-1.5 text-sm font-medium text-text-primary">
                    端点名称 <span className="text-red-400">*</span>
                  </label>
                  <Controller
                    name="name"
                    control={control}
                    rules={{ required: '请输入端点名称' }}
                    render={({ field }) => (
                      <input
                        {...field}
                        disabled={isEditing}
                        className={cn(
                          defaultTextProps,
                          'w-full px-3 py-2 focus:ring-green-500/30',
                          isEditing && 'cursor-not-allowed opacity-60',
                          errors.name && 'border-red-400',
                        )}
                        placeholder="例如：deepseek"
                        autoFocus={!isEditing}
                      />
                    )}
                  />
                  {errors.name ? (
                    <p className="mt-1 text-xs text-red-400">{errors.name.message}</p>
                  ) : (
                    <p className="mt-1 text-xs text-text-secondary">
                      {isEditing ? '端点名称创建后不可修改' : '用于唯一标识此端点配置'}
                    </p>
                  )}
                </div>

                <div>
                  <label className="mb-1.5 text-sm font-medium text-text-primary">
                    API Key <span className="text-red-400">*</span>
                  </label>
                  <Controller
                    name="apiKey"
                    control={control}
                    rules={{ required: '请输入 API Key' }}
                    render={({ field }) => (
                      <input
                        {...field}
                        type="text"
                        className={cn(
                          defaultTextProps,
                          'w-full px-3 py-2 font-mono text-sm focus:ring-green-500/30',
                          errors.apiKey && 'border-red-400',
                        )}
                        placeholder="${DEEP_SEEK_API_KEY}"
                      />
                    )}
                  />
                  <p className="mt-1 text-xs text-text-secondary">
                    支持环境变量，如{' '}
                    <code className="rounded bg-surface-secondary px-1 py-0.5 text-[11px]">
                      ${'{'}DEEP_SEEK_API_KEY{'}'}
                    </code>
                  </p>
                </div>

                <div>
                  <label className="mb-1.5 text-sm font-medium text-text-primary">
                    Base URL <span className="text-red-400">*</span>
                  </label>
                  <Controller
                    name="baseURL"
                    control={control}
                    rules={{ required: '请输入 Base URL' }}
                    render={({ field }) => (
                      <div className="flex overflow-hidden rounded-md border border-gray-200 focus-within:border-gray-400 dark:border-gray-600 dark:focus-within:border-gray-500">
                        <span className="flex items-center border-r border-gray-200 bg-surface-secondary px-3 text-xs font-mono text-text-secondary dark:border-gray-600">
                          URL
                        </span>
                        <input
                          {...field}
                          className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-secondary dark:bg-transparent"
                          placeholder="https://api.deepseek.com/v1"
                        />
                      </div>
                    )}
                  />
                  <p className="mt-1 text-xs text-text-secondary">
                    API 基础地址，通常以{' '}
                    <code className="rounded bg-surface-secondary px-1 py-0.5 text-[11px]">/v1</code>{' '}
                    结尾
                  </p>
                </div>
              </div>
            </div>

            {/* 模型配置 */}
            <div className="rounded-xl border border-border-light bg-surface-primary">
              <div className="flex items-center justify-between border-b border-border-light px-5 py-3.5">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-green-400" />
                  <span className="text-sm font-semibold text-text-primary">模型配置</span>
                </div>
                <button
                  type="button"
                  onClick={() => appendModel('')}
                  className="flex items-center gap-1 rounded-lg border border-dashed border-green-500/30 px-2.5 py-1 text-xs font-medium text-green-400 transition-colors hover:border-green-500/50 hover:bg-green-500/10"
                >
                  <Plus className="h-3.5 w-3.5" />
                  添加模型
                </button>
              </div>

              <div className="divide-y divide-border-light">
                {/* 自动获取开关 */}
                <div className="flex items-center justify-between px-5 py-4">
                  <div>
                    <p className="text-sm font-medium text-text-primary">自动获取模型列表</p>
                    <p className="mt-0.5 text-xs text-text-secondary">
                      启用后将从 API 自动拉取可用模型
                    </p>
                  </div>
                  <Controller
                    name="models.fetch"
                    control={control}
                    render={({ field }) => (
                      <Toggle
                        checked={field.value || false}
                        onChange={field.onChange}
                        label="自动获取模型列表"
                      />
                    )}
                  />
                </div>

                {/* 模型列表 */}
                <div className="p-5">
                  {modelFields.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {modelFields.map((field, index) => {
                        const isEditingModel = editingModelIndex === index;
                        return (
                          <div
                            key={field.id}
                            className="group inline-flex items-center gap-1 rounded-lg border border-green-500/20 bg-green-500/10 px-2.5 py-1 text-xs font-medium text-text-primary"
                          >
                            {isEditingModel ? (
                              <input
                                type="text"
                                value={editingModelValue}
                                onChange={(e) => setEditingModelValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    commitModelEdit(index);
                                  } else if (e.key === 'Escape') {
                                    setEditingModelIndex(null);
                                    setEditingModelValue('');
                                  }
                                }}
                                onBlur={() => commitModelEdit(index)}
                                className="h-5 w-28 border-none bg-transparent p-0 text-xs font-medium text-text-primary outline-none"
                                autoFocus
                              />
                            ) : (
                              <>
                                <Controller
                                  name={`models.default.${index}`}
                                  control={control}
                                  render={({ field: modelField }) => (
                                    <span
                                      onClick={() => {
                                        setEditingModelIndex(index);
                                        setEditingModelValue(modelField.value || '');
                                      }}
                                      className="max-w-[180px] cursor-text truncate"
                                      title="点击编辑"
                                    >
                                      {modelField.value || '未命名模型'}
                                    </span>
                                  )}
                                />
                                <button
                                  type="button"
                                  onClick={() => removeModel(index)}
                                  className="ml-0.5 flex h-4 w-4 items-center justify-center rounded text-text-secondary opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                                  aria-label="删除模型"
                                  title="删除此模型"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-green-500/20 py-8 text-center">
                      <p className="text-sm text-text-secondary">暂无模型配置</p>
                      <p className="mt-1 text-xs text-text-tertiary">
                        点击右上角「添加模型」，或开启自动获取
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
