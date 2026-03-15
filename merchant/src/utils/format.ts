export function fmtDate(val: string | null | undefined): string {
  if (!val) return '—';
  const d = new Date(val);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString('zh-TW');
}

export function getField<T>(obj: Record<string, T>, camel: string, snake: string): T | null {
  return (obj[camel] ?? obj[snake] ?? null) as T | null;
}

export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
}
