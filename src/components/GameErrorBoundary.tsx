import React from 'react';
import { copyRenderDiagnostics, readRenderDiagnostics, recordRenderFailure } from '../game/renderDiagnostics';

export class GameErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean; copied: boolean }> {
  state = { failed: false, copied: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    recordRenderFailure(error, { source: 'interface', componentStack: info.componentStack });
    console.error('[game interface]', error);
  }
  private capture = (event: ErrorEvent) => {
    if (event.error) recordRenderFailure(event.error, { source: 'window', file: event.filename, line: event.lineno });
  };
  private rejection = (event: PromiseRejectionEvent) => recordRenderFailure(event.reason, { source: 'promise' });
  componentDidMount() {
    window.addEventListener('error', this.capture);
    window.addEventListener('unhandledrejection', this.rejection);
  }
  componentWillUnmount() {
    window.removeEventListener('error', this.capture);
    window.removeEventListener('unhandledrejection', this.rejection);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return <div role="alert" className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950 p-6 text-slate-100">
      <div className="max-w-lg space-y-4 rounded-xl border border-amber-700/50 bg-slate-900 p-6">
        <h1 className="text-lg font-bold">画面暂时无法显示</h1>
        <p className="text-sm text-slate-300">界面遇到了错误。重新载入会尝试恢复连接，错误信息已保存在当前浏览器。</p>
        <div className="flex gap-3">
          <button className="rounded bg-amber-600 px-4 py-2" onClick={() => window.location.reload()}>重新载入</button>
          <button className="rounded bg-slate-700 px-4 py-2" onClick={async () => this.setState({ copied: await copyRenderDiagnostics() })}>{this.state.copied ? '已复制' : '复制错误信息'}</button>
        </div>
        <details className="text-xs text-slate-400"><summary>查看错误信息</summary><pre className="max-h-48 overflow-auto whitespace-pre-wrap">{readRenderDiagnostics()}</pre></details>
      </div>
    </div>;
  }
}
