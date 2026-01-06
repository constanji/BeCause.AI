import React, { useMemo, useEffect, useState, useCallback } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Bot, GripVertical, Database, CheckCircle2 } from 'lucide-react';
import { useDrag, useDrop } from 'react-dnd';
import { EModelEndpoint, Constants, SystemRoles, QueryKeys, LocalStorageKeys } from '@because/data-provider';
import { useListAgentsQuery } from '~/data-provider';
import { useListDataSourcesQuery } from '~/data-provider/DataSources';
import { useLocalize, useAgentDefaultPermissionLevel, useNewConvo, useAuthContext } from '~/hooks';
import { useToastContext } from '@because/client';
import { clearMessagesCache } from '~/utils';
import { cn } from '~/utils';
import { getAgentAvatarUrl } from '~/utils/agents';
import type { Agent } from '@because/data-provider';
import type { DataSource } from '@because/data-provider';
import store from '~/store';
import useLocalStorage from '~/hooks/useLocalStorage';

interface AgentsListProps {
  toggleNav?: () => void;
}

const AGENT_ITEM_TYPE = 'AGENT_ITEM';

const AGENT_ORDER_KEY = 'agent_order';

// 从 localStorage 获取智能体排序
function getAgentOrder(): string[] {
  try {
    const stored = localStorage.getItem(AGENT_ORDER_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

// 保存智能体排序到 localStorage
function saveAgentOrder(order: string[]) {
  try {
    localStorage.setItem(AGENT_ORDER_KEY, JSON.stringify(order));
  } catch (error) {
    console.error('Failed to save agent order:', error);
  }
}

export default function AgentsList({ toggleNav }: AgentsListProps) {
  const localize = useLocalize();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const permissionLevel = useAgentDefaultPermissionLevel();
  const { newConversation } = useNewConvo();
  const { user } = useAuthContext();
  const { conversation } = store.useCreateConversationAtom(0);
  const isAdmin = user?.role === SystemRoles.ADMIN;
  const [agentOrder, setAgentOrder] = useState<string[]>(getAgentOrder());
  
  // 数据源列表 - 只显示已启用的数据源
  const { data: dataSourcesResponse } = useListDataSourcesQuery();
  const allDataSources = dataSourcesResponse?.data || [];
  const enabledDataSources = useMemo(
    () => allDataSources.filter((ds: DataSource) => ds.status === 'active'),
    [allDataSources],
  );
  
  // 选中的数据源ID（保存到localStorage）
  const [selectedDataSourceId, setSelectedDataSourceId] = useLocalStorage<string | null>(
    LocalStorageKeys.LAST_DATA_SOURCE_ID,
    null,
  );
  
  // 当前选中的数据源
  const currentDataSourceId = selectedDataSourceId;
  
  // 只获取公开的智能体（管理员选择展示的）
  const { data: agentsResponse } = useListAgentsQuery(
    { requiredPermission: permissionLevel },
    {
      select: (res) => ({
        ...res,
        // 只显示公开的智能体（isPublic: true）
        data: res.data.filter((agent) => agent.isPublic === true),
      }),
    },
  );

  const allAgents = useMemo(() => agentsResponse?.data ?? [], [agentsResponse]);

  // 初始化排序：如果智能体列表变化，更新排序
  useEffect(() => {
    if (allAgents.length > 0) {
      const currentOrder = getAgentOrder();
      const currentIds = allAgents.map((a) => a.id);
      
      // 如果排序中没有的智能体，添加到末尾
      const newOrder = [...currentOrder];
      currentIds.forEach((id) => {
        if (!newOrder.includes(id)) {
          newOrder.push(id);
        }
      });
      
      // 移除已不存在的智能体
      const filteredOrder = newOrder.filter((id) => currentIds.includes(id));
      
      if (JSON.stringify(filteredOrder) !== JSON.stringify(currentOrder)) {
        setAgentOrder(filteredOrder);
        saveAgentOrder(filteredOrder);
      }
    }
  }, [allAgents]);

  // 根据排序对智能体进行排序
  const agents = useMemo(() => {
    const order = agentOrder;
    const ordered: Agent[] = [];
    const unordered: Agent[] = [];

    // 先添加有序的智能体
    order.forEach((id) => {
      const agent = allAgents.find((a) => a.id === id);
      if (agent) {
        ordered.push(agent);
      }
    });

    // 再添加未排序的智能体
    allAgents.forEach((agent) => {
      if (!order.includes(agent.id)) {
        unordered.push(agent);
      }
    });

    return [...ordered, ...unordered];
  }, [allAgents, agentOrder]);

  const handleAgentClick = useCallback(
    (agent: Agent) => {
      // 清除当前对话的消息缓存，避免影响历史对话
      clearMessagesCache(queryClient, conversation?.conversationId);
      queryClient.invalidateQueries([QueryKeys.messages]);
      
      // 创建新对话并设置智能体，同时设置模型名称
      // 注意：这里只创建新对话，不会影响历史对话的状态
      newConversation({
        preset: {
          endpoint: EModelEndpoint.agents,
          agent_id: agent.id,
          model: agent.model || '', // 设置 agent 的 model
          conversationId: Constants.NEW_CONVO as string,
        },
        keepLatestMessage: false,
      });
      
      // 导航到新对话，使用 replace: false 确保不会影响浏览器历史
      navigate(`/c/new?agent_id=${agent.id}`, {
        replace: false,
        state: {
          agentId: agent.id,
          agentName: agent.name,
        },
      });
      
      if (toggleNav) {
        toggleNav();
      }
    },
    [navigate, toggleNav, newConversation, queryClient, conversation],
  );

  const moveAgent = useCallback((dragIndex: number, hoverIndex: number) => {
    setAgentOrder((prevOrder) => {
      const newOrder = [...prevOrder];
      const [removed] = newOrder.splice(dragIndex, 1);
      newOrder.splice(hoverIndex, 0, removed);
      saveAgentOrder(newOrder);
      return newOrder;
    });
  }, []);

  return (
    <>
      <div className="mb-4 border-t border-border-light pt-4">
        <div className="mb-2 px-2">
          <h2 className="text-sm font-semibold text-text-primary">智能体</h2>
        </div>
        <div className="rounded-lg border border-border-light bg-surface-secondary p-2">
          {agents.length === 0 ? (
            <div className="py-2 text-center text-xs text-text-tertiary">
              暂无可用智能体
            </div>
          ) : (
            <div className="space-y-1">
              {agents.map((agent, index) => {
                // 检查当前 URL 参数或 state 中的 agent_id
                const urlParams = new URLSearchParams(location.search);
                const urlAgentId = urlParams.get('agent_id');
                const isActive =
                  urlAgentId === agent.id ||
                  (location.pathname.includes(`/c/`) && location.state?.agentId === agent.id);

                return (
                  <AgentListItem
                    key={agent.id}
                    agent={agent}
                    index={index}
                    isActive={isActive}
                    onClick={() => handleAgentClick(agent)}
                    moveAgent={moveAgent}
                    canDrag={isAdmin}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
      
      {/* 数据源选择器 - 直接展示已启用的数据源 */}
      <div className="mb-4 border-t border-border-light pt-4">
        <div className="mb-2 px-2">
          <h2 className="text-sm font-semibold text-text-primary">业务列表</h2>
        </div>
        <div className="rounded-lg border border-border-light bg-surface-secondary p-2">
          {enabledDataSources.length === 0 ? (
            <div className="py-2 text-center text-xs text-text-tertiary">
              暂无已启用的数据源
            </div>
          ) : (
            <div className="space-y-1">
              {enabledDataSources.map((dataSource: DataSource) => {
                const isSelected = currentDataSourceId === dataSource._id;
                return (
                  <button
                    key={dataSource._id}
                    onClick={() => {
                      // 直接选择数据源（保存到localStorage）
                      setSelectedDataSourceId(dataSource._id);
                    }}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors',
                      isSelected
                        ? 'bg-surface-active text-text-primary'
                        : 'text-text-secondary hover:bg-surface-hover',
                    )}
                    aria-label={dataSource.name ? `选择数据源: ${dataSource.name}` : '选择数据源'}
                  >
                    <Database className="h-4 w-4 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{dataSource.name}</span>
                        {isSelected && (
                          <CheckCircle2 className="h-3 w-3 flex-shrink-0 text-green-600" />
                        )}
                      </div>
                      <div className="text-xs text-text-tertiary">
                        {dataSource.type === 'mysql' ? 'MySQL' : 'PostgreSQL'} · {dataSource.database}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

interface AgentListItemProps {
  agent: Agent;
  index: number;
  isActive: boolean;
  onClick: () => void;
  moveAgent: (dragIndex: number, hoverIndex: number) => void;
  canDrag: boolean;
}

function AgentListItem({ agent, index, isActive, onClick, moveAgent, canDrag }: AgentListItemProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const avatarUrl = getAgentAvatarUrl(agent);

  const [{ isDragging }, drag] = useDrag({
    type: AGENT_ITEM_TYPE,
    item: { id: agent.id, index },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
    canDrag: canDrag, // 只有管理员才能拖动
  });

  const [{ handlerId }, drop] = useDrop({
    accept: AGENT_ITEM_TYPE,
    collect(monitor) {
      return {
        handlerId: monitor.getHandlerId(),
      };
    },
    hover(item: { id: string; index: number }, monitor) {
      if (!ref.current || !canDrag) {
        return;
      }
      const dragIndex = item.index;
      const hoverIndex = index;

      if (dragIndex === hoverIndex) {
        return;
      }

      const hoverBoundingRect = ref.current?.getBoundingClientRect();
      const hoverMiddleY = (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2;
      const clientOffset = monitor.getClientOffset();

      if (!clientOffset) {
        return;
      }

      const hoverClientY = clientOffset.y - hoverBoundingRect.top;

      if (dragIndex < hoverIndex && hoverClientY < hoverMiddleY) {
        return;
      }

      if (dragIndex > hoverIndex && hoverClientY > hoverMiddleY) {
        return;
      }

      moveAgent(dragIndex, hoverIndex);
      item.index = hoverIndex;
    },
    canDrop: () => canDrag, // 只有管理员才能放置
  });

  // 无论 canDrag 是否为 true，都设置 ref，但只在 canDrag 为 true 时启用拖动功能
  // 这样可以避免 React 的 removeChild 错误
  if (canDrag) {
    drag(drop(ref));
  }

  return (
    <div
      ref={ref}
      data-handler-id={handlerId}
      style={{ opacity: isDragging ? 0.5 : 1 }}
      className={cn(
        'flex items-center gap-2 rounded-lg px-2 py-1 transition-colors',
        isActive && 'bg-surface-active',
      )}
    >
      {canDrag && (
        <div className="flex-shrink-0 cursor-grab active:cursor-grabbing">
          <GripVertical className="h-4 w-4 text-text-tertiary" />
        </div>
      )}
      <button
        onClick={onClick}
        className={cn(
          'flex flex-1 items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors',
          'hover:bg-surface-hover',
          isActive && 'bg-surface-active text-text-primary',
          !isActive && 'text-text-secondary',
        )}
        aria-label={agent.name}
      >
        <div className="flex-shrink-0">
          {avatarUrl ? (
            <img src={avatarUrl} alt={agent.name || '智能体'} className="h-5 w-5 rounded-full object-cover" />
          ) : (
            <Bot className="h-5 w-5 text-text-primary" />
          )}
        </div>
        <span className="flex-1 truncate text-sm font-medium">{agent.name}</span>
      </button>
    </div>
  );
}

