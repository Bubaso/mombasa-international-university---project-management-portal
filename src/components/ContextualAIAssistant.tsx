import React, { useState, useRef, useEffect } from 'react';
import { Bot, Send, X, Sparkles, User, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useApp } from '../context/AppContext';

/**
 * Where the server-side proxy lives. The Gemini key used to be read straight
 * from the bundle, which publishes it to every visitor; it now sits as a
 * secret on the function this points at (supabase/functions/ai-assistant).
 */
const AI_PROXY_URL = import.meta.env.VITE_AI_PROXY_URL ?? '';
const isAssistantConfigured = AI_PROXY_URL.length > 0;

interface ContextualAIAssistantProps {
  contextData: string;
  systemInstruction: string;
  title?: string;
  buttonLabel?: string;
  inline?: boolean;
}

export const ContextualAIAssistant: React.FC<ContextualAIAssistantProps> = ({
  contextData,
  systemInstruction,
  title = 'AI Assistant',
  buttonLabel = 'Ask AI',
  inline = false,
}) => {
  const { language } = useApp();
  const [isOpen, setIsOpen] = useState(inline);
  const [messages, setMessages] = useState<{ role: 'user' | 'ai'; text: string }[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const endOfMessagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userPrompt = input.trim();
    setMessages((prev) => [...prev, { role: 'user', text: userPrompt }]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch(AI_PROXY_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ systemInstruction, contextData, question: userPrompt }),
      });

      const payload: { text?: string; error?: string } = await response
        .json()
        .catch(() => ({}) as { text?: string; error?: string });

      if (!response.ok || !payload.text) {
        throw new Error(
          payload.error ??
            (language === 'tr' ? 'Asistan yanit veremedi.' : 'The assistant could not answer.'),
        );
      }

      const answer = payload.text;
      setMessages((prev) => [...prev, { role: 'ai', text: answer }]);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.error('AI request failed', error);
      setMessages((prev) => [
        ...prev,
        { role: 'ai', text: language === 'tr' ? `Hata: ${detail}` : `Error: ${detail}` },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const ChatUI = (
    <div
      className={`flex flex-col ${inline ? 'h-[400px]' : 'h-[500px]'} bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden`}
    >
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-700 to-blue-900 px-4 py-3 flex items-center justify-between text-white">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-blue-200" />
          <h3 className="font-semibold">{title}</h3>
        </div>
        {!inline && (
          <button
            onClick={() => setIsOpen(false)}
            className="text-white/80 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
        {messages.length === 0 && (
          <div className="text-center text-slate-500 mt-10 px-4">
            <Bot className="w-12 h-12 mx-auto text-slate-300 mb-2" />
            <p className="text-sm leading-relaxed">
              {isAssistantConfigured
                ? language === 'tr'
                  ? 'Bu bölümdeki veriler hakkında soru sorabilirsiniz.'
                  : 'Ask a question about the data on this screen.'
                : language === 'tr'
                  ? 'Asistan kurulmadı. Çalışması için sunucu tarafındaki ai-assistant fonksiyonunun dağıtılması ve VITE_AI_PROXY_URL değerinin ayarlanması gerekiyor.'
                  : 'The assistant is not set up. It needs the server-side ai-assistant function deployed and VITE_AI_PROXY_URL configured.'}
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-slate-200 text-slate-600' : 'bg-blue-100 text-blue-600'}`}
            >
              {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
            </div>
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-white border border-slate-200 text-slate-700 rounded-tl-none shadow-sm prose prose-sm'}`}
            >
              {msg.role === 'ai' ? <ReactMarkdown>{msg.text}</ReactMarkdown> : <p>{msg.text}</p>}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-none px-4 py-3 shadow-sm">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-slate-300 rounded-full animate-bounce"></div>
                <div
                  className="w-2 h-2 bg-slate-300 rounded-full animate-bounce"
                  style={{ animationDelay: '0.1s' }}
                ></div>
                <div
                  className="w-2 h-2 bg-slate-300 rounded-full animate-bounce"
                  style={{ animationDelay: '0.2s' }}
                ></div>
              </div>
            </div>
          </div>
        )}
        <div ref={endOfMessagesRef} />
      </div>

      {/* Input Area */}
      <div className="p-3 border-t border-slate-200 bg-white">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder={
              isAssistantConfigured
                ? language === 'tr'
                  ? 'Bir soru sorun...'
                  : 'Ask a question...'
                : language === 'tr'
                  ? 'Asistan kurulmadı'
                  : 'Assistant not set up'
            }
            className="flex-1 bg-slate-100 border-none rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isLoading || !isAssistantConfigured}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading || !isAssistantConfigured}
            className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center disabled:opacity-50 hover:bg-blue-700 transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );

  if (inline) {
    return ChatUI;
  }

  return (
    <>
      {/* Floating Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-full shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 transition-all hover:-translate-y-0.5"
        >
          <Sparkles className="w-4 h-4" />
          <span className="font-medium text-sm">{buttonLabel}</span>
        </button>
      )}

      {/* Popover */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 w-96 z-50 animate-in slide-in-from-bottom-5 fade-in duration-200">
          {ChatUI}
        </div>
      )}
    </>
  );
};
