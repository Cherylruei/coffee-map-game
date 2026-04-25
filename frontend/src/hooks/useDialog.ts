import { create } from 'zustand';

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

interface DialogStore {
  config: DialogConfig | null;
  show: (config: DialogConfig) => void;
  hide: () => void;
}

export const useDialogStore = create<DialogStore>((set) => ({
  config: null,
  show: (config) => set({ config }),
  hide: () => set({ config: null }),
}));

export function useDialog() {
  return useDialogStore((s) => s.show);
}
