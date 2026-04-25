import { AnimatePresence, motion } from 'framer-motion';
import { useDialogStore } from '../../hooks/useDialog';
import './Dialog.css';

const ICONS: Record<string, string> = {
  success: '✅',
  error: '❌',
  warning: '⚠️',
  confirm: '❓',
  info: 'ℹ️',
};

export function Dialog() {
  const { config, hide } = useDialogStore();

  const handleButton = (onClick?: () => void) => {
    hide();
    onClick?.();
  };

  const buttons = config?.buttons ?? [{ label: '確定' }];
  const isSingle = buttons.length === 1;

  return (
    <AnimatePresence>
      {config && (
        <motion.div
          className="dialog-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <motion.div
            className="dialog-box"
            initial={{ scale: 0.82, opacity: 0, y: 16 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.88, opacity: 0, y: 8 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
          >
            <div className={`dialog-icon-wrap dialog-icon-wrap--${config.type}`}>
              {ICONS[config.type]}
            </div>

            <h2 className="dialog-title">{config.title}</h2>

            {config.message && (
              <p className="dialog-message">{config.message}</p>
            )}

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
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
