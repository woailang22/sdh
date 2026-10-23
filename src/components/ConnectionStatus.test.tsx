import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TopMenuBar } from './TopMenuBar';
import { RadioChat } from './RadioChat';
import { OnlinePlayersModal } from './OnlinePlayersModal';

const visibleText = (html: string) => html.replace(/<[^>]*>/g, '');

describe('actual gameplay connection status', () => {
  it('does not show old online counts or latency in the disconnected top bar', () => {
    const props = { onOpenModal: () => {}, activeModal: null, onlineCount: 9, ping: 82, isConnected: false };
    const html = renderToStaticMarkup(<TopMenuBar {...props} />);
    expect(visibleText(html)).toContain('等待连接'); expect(visibleText(html)).not.toContain('9人'); expect(visibleText(html)).not.toContain('82'); expect(visibleText(html)).not.toContain('ms)');
  });
  it.each([null, 7])('distinguishes connected unmeasured ping%s from an actual measurement', ping => {
    const props = { onOpenModal: () => {}, activeModal: null, onlineCount: 2, ping, isConnected: true };
    const html = renderToStaticMarkup(<TopMenuBar {...props} />);
    expect(html).toContain('2'); expect(html).toContain(ping === null ? '测量中' : '7');
    expect(html).not.toContain('等待连接'); if (ping === null) expect(html).not.toContain('0ms');
  });
  it('marks the radio unavailable and disables sending while disconnected', () => {
    const props = { messages: [], onSendMessage: () => {}, isConnected: false };
    const html = renderToStaticMarkup(<RadioChat {...props} />);
    expect(html).toContain('等待连接'); expect(html).not.toContain('信号强');
    expect(html.match(/disabled=""/g)).toHaveLength(2);
  });
  it('uses connected rather than an invented signal strength in the radio', () => {
    const props = { messages: [], onSendMessage: () => {}, isConnected: true };
    const html = renderToStaticMarkup(<RadioChat {...props} />);
    expect(html).toContain('已连接'); expect(html).not.toContain('信号强'); expect(html).not.toContain('disabled=""');
  });
  it.each([false, true])('does not show a zero or stale modal latency when ready=%s and no current measurement exists', isConnected => {
    const html = renderToStaticMarkup(<OnlinePlayersModal players={[]} selfId="" ping={isConnected ? null : 82} isConnected={isConnected} onClose={() => {}} />);
    expect(visibleText(html)).toContain(isConnected ? '测量中' : '等待连接'); expect(visibleText(html)).not.toContain('82'); expect(visibleText(html)).not.toContain('0ms');
  });
});
