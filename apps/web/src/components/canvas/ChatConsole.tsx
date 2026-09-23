import { useState, useRef, useEffect } from 'react';
import { useArchitectureStore } from '../../store/architectureStore';

interface ChatConsoleProps {
  onSumbit: (prompt: string) => Promise<void>;
  isThinking: boolean;
}

export function ChatConsole({ onSumbit, isThinking }: ChatConsoleProps) {
  const [input, setInput] = useState('');
  const { chatHistory } = useArchitectureStore();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const endOfMessagesRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to latest message
  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  // Auto-resize textarea
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!input.trim() || isThinking) return;
      
      const currentPrompt = input.trim();
      setInput('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
      
      onSumbit(currentPrompt);
    }
  };

  return (
    <>
      {/* Chat History Sidebar (Right Side) */}
      {chatHistory.length > 0 && (
        <div className="absolute top-24 right-6 w-80 max-h-[calc(100vh-10rem)] overflow-y-auto pointer-events-auto rounded-xl bg-[#0A0A0A]/80 backdrop-blur-md border border-white/10 p-4 shadow-2xl flex flex-col gap-4 z-40 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] scrollbar-none">
          {chatHistory.map((msg) => (
            <div 
              key={msg.id} 
              className={`flex flex-col max-w-[90%] ${msg.role === 'user' ? 'self-end items-end' : 'self-start items-start'}`}
            >
              <span className="text-[10px] font-mono text-white/30 mb-1 px-1 tracking-widest uppercase">
                {msg.role === 'user' ? 'You' : 'Architect'}
              </span>
              <div 
                className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                  msg.role === 'user' 
                    ? 'bg-indigo-600/20 text-indigo-100 border border-indigo-500/30 rounded-br-sm' 
                    : 'bg-white/5 text-white/80 border border-white/10 rounded-bl-sm'
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}
          <div ref={endOfMessagesRef} />
        </div>
      )}

      {/* Floating Input Box (Centered Bottom) */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-full max-w-2xl z-50 pointer-events-auto group">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Describe your architecture..."
          disabled={isThinking}
          rows={1}
          className="w-full bg-[#111111]/90 backdrop-blur-xl border border-white/10 focus:border-indigo-500/50 rounded-2xl pl-6 pr-14 py-4 text-white placeholder:text-white/30 outline-none resize-none shadow-2xl transition-all disabled:opacity-50 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] scrollbar-none"
          style={{ fontFamily: '"Inter", sans-serif' }}
        />
        
        <button
          onClick={() => handleKeyDown({ key: 'Enter', shiftKey: false, preventDefault: () => {} } as any)}
          disabled={!input.trim() || isThinking}
          className="absolute right-3 bottom-3 p-2 bg-indigo-500 hover:bg-indigo-400 disabled:bg-white/5 text-white disabled:text-white/20 rounded-xl transition-colors"
        >
          {isThinking ? (
            <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          )}
        </button>
      </div>
    </>
  );
}