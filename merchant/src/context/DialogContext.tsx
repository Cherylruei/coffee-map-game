import React, { createContext, useCallback, useContext, useState } from 'react';
import ReactDOM from 'react-dom';
import '../components/UI/Dialog.css';

export interface DialogButton {
  label: string;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
}

export interface DialogConfig {
  type: 'success' | 'error' | 'warning' | 'info' | 'confirm';
  title: string;
  message?: string;
  buttons?: DialogButton[];
}

interface DialogContextValue {
  show: (config: DialogConfig) => void;
}

const DialogContext = createContext<DialogContextValue>({ show: () => {} });

const ICONS: Record<string, string> = {
  success: '✅',
  error: '❌',
  warning: '⚠️',
  confirm: '❓',
  info: 'ℹ️',
};

function MerchantDialog({ config, hide }: { config: DialogConfig; hide: () => void }) {
  const buttons = config.buttons ?? [{ label: '確定' }];
  const isSingle = buttons.length === 1;

  const handleButton = (onClick?: () => void) => {
    hide();
    onClick?.();
  };

  return ReactDOM.createPortal(
    <div className="dialog-overlay">
      <div className="dialog-box" onClick={(e) => e.stopPropagation()}>
        <div className={`dialog-icon-wrap dialog-icon-wrap--${config.type}`}>
          {ICONS[config.type]}
        </div>
        <h2 className="dialog-title">{config.title}</h2>
        {config.message && <p className="dialog-message">{config.message}</p>}
        <div className={`dialog-actions${isSingle ? ' dialog-actions--single' : ''}`}>
          {buttons.map((btn, i) => (
            <button
              key={i}
              className={`dialog-btn dialog-btn--${btn.variant ?? (i === buttons.length - 1 ? 'primary' : 'secondary')}`}
              onClick={() => handleButton(btn.onClick)}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<DialogConfig | null>(null);

  const show = useCallback((cfg: DialogConfig) => setConfig(cfg), []);
  const hide = useCallback(() => setConfig(null), []);

  return (
    <DialogContext.Provider value={{ show }}>
      {children}
      {config && <MerchantDialog config={config} hide={hide} />}
    </DialogContext.Provider>
  );
}

export function useDialog() {
  return useContext(DialogContext).show;
}
