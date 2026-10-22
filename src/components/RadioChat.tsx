import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage } from '../types/game';
import { MessageSquare, Send, Radio } from 'lucide-react';
import { soundManager } from '../audio/soundManager';

interface RadioChatProps {
  messages: ChatMessage[];
  onSendMessage: (text: string, channel: 'team' | 'world') => void;
}

export const RadioChat: React.FC<RadioChatProps> = ({ messages, onSendMessage }) => {
  const [activeChannel, setActiveChannel] = useState<'team' | 'world'>('team');
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(inputText.trim(), activeChannel);
    setInputText('');
    soundManager.playClick();
  };

  return (
    <div className="flex flex-col w-72 h-36 rounded-lg bg-slate-950/80 backdrop-blur-md border border-cyan-500/30 overflow-hidden select-none shadow-lg">
      {/* Channels Tab */}
      <div className="flex items-center gap-1 px-2 py-1 bg-slate-900/90 border-b border-slate-800/80 text-[11px]">
        <button
          onClick={() => { setActiveChannel('team'); soundManager.playClick(); }}
          className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
            activeChannel === 'team'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          组队
        </button>
        <button
          onClick={() => { setActiveChannel('world'); soundManager.playClick(); }}
          className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
            activeChannel === 'world'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          世界
        </button>
        <span className="ml-auto text-[9px] font-mono text-emerald-400 flex items-center gap-1">
          <Radio className="w-2.5 h-2.5" /> 信号强
        </span>
      </div>

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto px-2 py-1.5 space-y-1 text-[11px] font-mono scrollbar-thin scrollbar-thumb-slate-800">
        {messages.map((m) => (
          <div key={m.id} className="leading-tight break-all">
            <span className={`${m.isSelf ? 'text-amber-400 font-bold' : 'text-cyan-400'}`}>
              [{m.sender}]:
            </span>{' '}
            <span className={m.isSelf ? 'text-amber-100' : 'text-slate-300'}>{m.text}</span>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Box */}
      <form onSubmit={handleSend} className="flex items-center gap-1 px-1.5 py-1 bg-slate-900/90 border-t border-slate-800">
        <MessageSquare className="w-3.5 h-3.5 text-cyan-400 shrink-0 ml-1" />
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder={activeChannel === 'team' ? '组队频道发言...' : '世界无线电广播...'}
          className="flex-1 bg-transparent text-[11px] text-slate-100 placeholder-slate-500 focus:outline-none px-1"
        />
        <button
          type="submit"
          className="p-1 rounded bg-cyan-600/30 hover:bg-cyan-600/50 text-cyan-300 transition-colors"
        >
          <Send className="w-3 h-3" />
        </button>
      </form>
    </div>
  );
};
