import React, { useState, useRef, useEffect } from 'react';
import { Bot, Send, X, Sparkles, User, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useApp } from '../context/AppContext';
import { GoogleGenAI } from '@google/genai';

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
      // In production, you would proxy this request through your backend to hide the API key.
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error(
          language === 'tr'
            ? 'Gemini API anahtarı bulunamadı (.env.local)'
            : 'Gemini API key is missing (.env.local)',
        );
      }

      const ai = new GoogleGenAI({ apiKey });

      const promptContext = `
      System Instruction: ${systemInstruction}
      
      Current Data Context: 
      ${contextData}
      
      User's Question: ${userPrompt}
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: promptContext,
      });

      if (response.text) {
        setMessages((prev) => [...prev, { role: 'ai', text: response.text || '' }]);
      }
    } catch (error: any) {
      console.error('AI Error:', error);
      setMessages((prev) => [...prev, { role: 'ai', text: `Error: ${error.message}` }]);
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
          <div className="text-center text-slate-500 mt-10">
            <Bot className="w-12 h-12 mx-auto text-slate-300 mb-2" />
            <p className="text-sm">
              {language === 'tr'
                ? 'Bu bölge hakkında bana istediğinizi sorabilirsiniz. Veriler sizin için hazır.'
                : 'Ask me anything about this section. I have the context ready.'}
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
            placeholder={language === 'tr' ? 'Bir soru sorun...' : 'Ask a question...'}
            className="flex-1 bg-slate-100 border-none rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            disabled={isLoading}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
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
