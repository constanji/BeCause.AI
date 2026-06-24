import { createContext, useContext, useRef, useCallback, useEffect, ReactNode } from 'react';
import { useSetAtom } from 'jotai';
import type { TShowToast } from '~/common';
import { NotificationSeverity } from '~/common';
import { toastState, type ToastState } from '~/store';

type ToastContextType = {
  showToast: ({ message, severity, showIcon, duration }: TShowToast) => void;
};

export const ToastContext = createContext<ToastContextType>({
  showToast: () => ({}),
});

export function useToastContext() {
  return useContext(ToastContext);
}

// 使用 useSetAtom 而非 useAtom：只订阅写端，不订阅读端。
// 这样 toast open/close 时 toastState 变化不会触发 ToastProvider re-render，
// 从而不会更新 context value，所有 useToastContext() 的消费者（如 MCPManagement）
// 不会因为 toast 出现或消失而 re-render。
export default function ToastProvider({ children }: { children: ReactNode }) {
  const setToast = useSetAtom(toastState);
  const showTimerRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (showTimerRef.current !== null) clearTimeout(showTimerRef.current);
      if (hideTimerRef.current !== null) clearTimeout(hideTimerRef.current);
    };
  }, []);

  const showToast = useCallback(
    ({
      message,
      severity = NotificationSeverity.SUCCESS,
      showIcon = true,
      duration = 3000,
      status,
    }: TShowToast) => {
      if (showTimerRef.current !== null) clearTimeout(showTimerRef.current);
      if (hideTimerRef.current !== null) clearTimeout(hideTimerRef.current);

      showTimerRef.current = window.setTimeout(() => {
        setToast({
          open: true,
          message,
          severity: (status as NotificationSeverity) ?? severity,
          showIcon,
        });
        hideTimerRef.current = window.setTimeout(() => {
          setToast((prevToast: ToastState) => ({ ...prevToast, open: false }));
        }, duration);
      }, 100);
    },
    [setToast],
  );

  return <ToastContext.Provider value={{ showToast }}>{children}</ToastContext.Provider>;
}
