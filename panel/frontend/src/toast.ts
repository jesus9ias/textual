/** Shared toast queue, used across views for save/delete feedback. */
import { reactive } from 'vue';

export type ToastKind = 'success' | 'error';
export interface ToastItem {
  id: string;
  text: string;
  kind: ToastKind;
}

export const toasts = reactive<ToastItem[]>([]);

export function addToast(text: string, kind: ToastKind = 'success') {
  const id = `t${Date.now()}${Math.random()}`;
  toasts.push({ id, text, kind });
  setTimeout(() => removeToast(id), 3200);
}

export function removeToast(id: string) {
  const i = toasts.findIndex((t) => t.id === id);
  if (i !== -1) toasts.splice(i, 1);
}
