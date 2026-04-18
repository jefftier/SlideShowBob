import React, { useEffect } from 'react';
import './Toast.css';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ToastProps {
  toast: Toast;
  onClose: (id: string) => void;
}

const ToastComponent: React.FC<ToastProps> = ({ toast, onClose }) => {
  useEffect(() => {
    const duration = toast.duration || 3000;
    const timer = setTimeout(() => {
      onClose(toast.id);
    }, duration);

    return () => clearTimeout(timer);
  }, [toast.id, toast.duration, onClose]);

  const getIcon = () => {
    switch (toast.type) {
      case 'success':
        return '✓';
      case 'error':
        return '×';
      case 'warning':
        return '⚠';
      case 'info':
        return 'ℹ';
      default:
        return '';
    }
  };

  const handleAction = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (toast.action) {
      toast.action.onClick();
      onClose(toast.id);
    }
  };

  return (
    <div className={`toast toast-${toast.type}`} onClick={() => onClose(toast.id)}>
      <span className="toast-icon">{getIcon()}</span>
      <span className="toast-message">{toast.message}</span>
      {toast.action && (
        <button className="toast-action" onClick={handleAction} aria-label={toast.action.label}>
          {toast.action.label}
        </button>
      )}
      <button className="toast-close" onClick={(e) => { e.stopPropagation(); onClose(toast.id); }} title="Close" aria-label="Close notification">
        ×
      </button>
    </div>
  );
};

export default ToastComponent;

