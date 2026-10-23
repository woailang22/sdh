import { afterEach, expect, it, vi } from 'vitest';
import { copyDiagnosticText, copyRenderDiagnostics } from './renderDiagnostics';

afterEach(() => vi.unstubAllGlobals());
it('copies the exact selected report and keeps existing error-copy behavior', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  vi.stubGlobal('localStorage', { getItem: () => '[{"message":"error"}]' });
  expect(await copyDiagnosticText('{"samples":[]}')).toBe(true);
  expect(writeText).toHaveBeenLastCalledWith('{"samples":[]}');
  expect(await copyRenderDiagnostics()).toBe(true);
  expect(writeText).toHaveBeenLastCalledWith('[{"message":"error"}]');
});
it('returns failure without throwing when clipboard is missing or denied', async () => {
  vi.stubGlobal('navigator', {}); expect(await copyDiagnosticText('report')).toBe(false);
  vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
  expect(await copyDiagnosticText('report')).toBe(false);
});
