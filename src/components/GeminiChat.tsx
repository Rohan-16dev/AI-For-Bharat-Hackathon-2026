import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, Send, X, Minimize2, Maximize2, Sparkles, User, Bot, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getGeneralChatResponse } from '../services/geminiService';
import { cn } from '../lib/utils';

interface Message {
  role: 'user' | 'model';
  text: string;
}

export const GeminiChat = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { role: 'model', text: 'Hello! I am your UBID Intelligence Assistant. How can I help you today?' }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [messages, isLoading]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMessage }]);
    setIsLoading(true);

    try {
      const history = messages.map(m => ({
        role: m.role,
        parts: [{ text: m.text }]
      }));
      
      const response = await getGeneralChatResponse(userMessage, history);
      setMessages(prev => [...prev, { role: 'model', text: response || 'Sorry, I could not process that.' }]);
    } catch (error: any) {
      console.error('Chat error:', error);
      const errorMessage = error.message?.includes('Engine unavailable') 
        ? "AI Engine is currently unresponsive. Please verify manual registry integrity or check network status."
        : "The assistant encountered a logic failure. This signal has been logged for system healing.";
      
      setMessages(prev => [...prev, { role: 'model', text: errorMessage }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            onClick={() => setIsOpen(true)}
            className="w-12 h-12 bg-accent text-white rounded-full shadow-lg flex items-center justify-center hover:bg-accent/90 transition-colors"
          >
            <MessageSquare className="w-6 h-6" />
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ y: 100, opacity: 0, scale: 0.9 }}
            animate={{ 
              y: 0, 
              opacity: 1, 
              scale: 1,
              height: isMinimized ? '48px' : '500px',
              width: '350px'
            }}
            exit={{ y: 100, opacity: 0, scale: 0.9 }}
            className="bg-card border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="p-3 bg-sidebar text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-accent" />
                <span className="text-xs font-bold uppercase tracking-wider">UBID Assistant</span>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => setIsMinimized(!isMinimized)} className="p-1 hover:bg-white/10 rounded">
                  {isMinimized ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
                </button>
                <button onClick={() => setIsOpen(false)} className="p-1 hover:bg-white/10 rounded">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {!isMinimized && (
              <>
                {/* Messages */}
                <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#F8FAFC]">
                  {messages.map((m, i) => (
                    <div key={i} className={cn("flex gap-2", m.role === 'user' ? "flex-row-reverse" : "flex-row")}>
                      <div className={cn(
                        "w-7 h-7 rounded-full flex items-center justify-center shrink-0",
                        m.role === 'user' ? "bg-accent text-white" : "bg-sidebar text-white"
                      )}>
                        {m.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                      </div>
                      <div className={cn(
                        "max-w-[80%] p-2.5 rounded-lg text-xs leading-relaxed shadow-sm whitespace-pre-wrap",
                        m.role === 'user' ? "bg-accent text-white rounded-tr-none" : "bg-white text-text-main border border-border rounded-tl-none"
                      )}>
                        {m.text}
                      </div>
                    </div>
                  ))}
                  {isLoading && (
                    <div className="flex gap-2">
                      <div className="w-7 h-7 rounded-full bg-sidebar text-white flex items-center justify-center">
                        <Bot className="w-4 h-4" />
                      </div>
                      <div className="bg-white border border-border p-2.5 rounded-lg rounded-tl-none shadow-sm">
                        <div className="flex gap-1">
                          <div className="w-1 h-1 bg-text-muted rounded-full animate-bounce" />
                          <div className="w-1 h-1 bg-text-muted rounded-full animate-bounce [animation-delay:0.2s]" />
                          <div className="w-1 h-1 bg-text-muted rounded-full animate-bounce [animation-delay:0.4s]" />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Input */}
                <div className="p-3 border-t border-border bg-white">
                  <div className="flex gap-1.5 mb-2 overflow-x-auto pb-1 scrollbar-hide">
                    {['Analyze UBID', 'Check Compliance', 'Peenya Status'].map(action => (
                      <button
                        key={action}
                        onClick={() => setInput(action)}
                        className="whitespace-nowrap px-2 py-1 bg-gray-100 text-[9px] font-bold text-text-muted rounded hover:bg-accent hover:text-white transition-colors uppercase tracking-tighter"
                      >
                        {action}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5 mb-2 px-1 py-0.5 bg-yellow-50 border border-yellow-100 rounded">
                    <AlertCircle className="w-2.5 h-2.5 text-yellow-600" />
                    <span className="text-[8px] text-yellow-700 font-bold uppercase tracking-tighter">Privacy: Only scrambled/synthetic data allowed in LLM calls.</span>
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Ask anything..."
                      className="w-full pl-3 pr-10 py-2 text-xs bg-gray-50 border border-border rounded-lg focus:ring-1 focus:ring-accent outline-none transition-all"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                    />
                    <button
                      onClick={handleSend}
                      disabled={!input.trim() || isLoading}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 text-accent hover:bg-accent/10 rounded-md disabled:opacity-50 transition-colors"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
