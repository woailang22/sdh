const KEY = 'sdc-render-diagnostics';

export function recordRenderFailure(error: unknown, context: Record<string, unknown> = {}) {
  const record = { at: new Date().toISOString(), message: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined, ...context };
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || '[]');
    const previous = Array.isArray(stored) ? stored : [];
    localStorage.setItem(KEY, JSON.stringify([...previous.slice(-4), record]));
  } catch { /* Storage may be unavailable; diagnostics must never break recovery. */ }
  return record;
}

export function readRenderDiagnostics(): string {
  try { return localStorage.getItem(KEY) || '[]'; } catch { return '[]'; }
}

export async function copyRenderDiagnostics() {
  return copyDiagnosticText(readRenderDiagnostics());
}

export async function copyDiagnosticText(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}
