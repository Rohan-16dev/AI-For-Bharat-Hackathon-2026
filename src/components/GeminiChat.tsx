import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, Send, X, Minimize2, Maximize2, Sparkles, User, Bot, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getGeneralChatResponse, AIError, AIErrorType } from '../services/geminiService';
import { AIErrorAlert } from './AIErrorAlert';
import { cn } from '../lib/utils';
import ReactMarkdown from 'react-markdown';

interface Message {
  role: 'user' | 'model';
  text: string;
  isError?: boolean;
  errorObj?: AIError;
}

export const GeminiChat = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { role: 'model', text: 'Hello! I am your UBID Intelligence Assistant. How can I help you today?' }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUserMessage, setLastUserMessage] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [messages, isLoading]);

  const handleSend = async (retryText?: string) => {
    const userMessage = retryText || input.trim();
    if (!userMessage || isLoading) return;

    if (!retryText) {
      setInput('');
      setMessages(prev => [...prev, { role: 'user', text: userMessage }]);
      setLastUserMessage(userMessage);
    } else {
      // Remove last error message if retrying
      setMessages(prev => {
        const newMessages = [...prev];
        if (newMessages[newMessages.length - 1]?.isError) {
          newMessages.pop();
        }
        return newMessages;
      });
    }

    setIsLoading(true);

    try {
      // Abort previous request if any
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      const history = messages
        .filter(m => !m.isError)
        .map(m => ({
          role: m.role,
          parts: [{ text: m.text }]
        }));
      
      const response = await getGeneralChatResponse(userMessage, history);
      setMessages(prev => [...prev, { role: 'model', text: response || 'Sorry, I could not process that.' }]);
      setLastUserMessage(null); // Clear last user message on success
    } catch (error: any) {
      if (error.name === 'AbortError') return;
      
      console.error('Chat error:', error);
      const aiError = error as AIError;
      setMessages(prev => [...prev, { 
        role: 'model', 
        text: aiError.userMessage || "The assistant encountered a logic failure.", 
        isError: true,
        errorObj: aiError
      }]);
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const renderMessageContent = (m: Message) => {
    if (m.isError && m.errorObj) {
      return (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-red-700 font-bold">
            <AlertCircle className="w-4 h-4" />
            <span>AI Pipeline Anomaly</span>
          </div>
          <p className="text-xs leading-relaxed">{m.text}</p>
          <div className="bg-white/40 p-2 rounded border border-red-200/50">
            <p className="text-[10px] font-bold uppercase tracking-tight text-red-800 mb-1">Recommendation</p>
            <p className="text-[10px] text-red-700 italic">{m.errorObj.suggestion}</p>
          </div>
          {m.errorObj.retryable && lastUserMessage && (
            <button 
              onClick={() => handleSend(lastUserMessage)}
              className="mt-2 flex items-center gap-1.5 text-[10px] font-bold text-red-600 hover:text-red-800 transition-colors uppercase tracking-wider bg-white/80 px-2.5 py-1.5 rounded border border-red-100 shadow-sm"
            >
              <Send className="w-2.5 h-2.5 rotate-45" /> Attempt Retrieval
            </button>
          )}
          <details className="mt-2">
            <summary className="text-[8px] font-bold text-red-400 uppercase cursor-pointer hover:text-red-600">Technical Log</summary>
            <p className="mt-1 text-[8px] font-mono bg-red-900/10 p-1.5 rounded text-red-800/70 whitespace-pre-wrap">{m.errorObj.message}</p>
          </details>
        </div>
      );
    }
    if (m.role === 'model') {
      return (
        <div className="text-xs text-text-main leading-relaxed">
          <ReactMarkdown
            components={{
              p: ({node, ...props}) => <p className="mb-2 last:mb-0" {...props} />,
              ul: ({node, ...props}) => <ul className="list-disc pl-4 mb-2 space-y-1" {...props} />,
              ol: ({node, ...props}) => <ol className="list-decimal pl-4 mb-2 space-y-1" {...props} />,
              li: ({node, ...props}) => <li className="" {...props} />,
              h1: ({node, ...props}) => <h1 className="text-sm font-bold text-accent mb-2 mt-3 first:mt-0" {...props} />,
              h2: ({node, ...props}) => <h2 className="text-sm font-bold text-accent mb-2 mt-3 first:mt-0" {...props} />,
              h3: ({node, ...props}) => <h3 className="text-xs font-bold text-accent mb-1 mt-2 first:mt-0" {...props} />,
              strong: ({node, ...props}) => <strong className="font-bold text-gray-900" {...props} />,
              em: ({node, ...props}) => <em className="italic" {...props} />,
              code: ({node, inline, ...props}: any) => 
                inline ? <code className="bg-gray-100 px-1 py-0.5 rounded text-red-600 font-mono text-[10px]" {...props} /> 
                       : <pre className="bg-gray-100 p-2 rounded text-[10px] font-mono overflow-x-auto mb-2"><code {...props} /></pre>
            }}
          >
            {m.text.replace(/\*\*/g, '**').replace(/^\* /gm, '- ')}
          </ReactMarkdown>
        </div>
      );
    }
    return m.text;
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
                <button 
                  onClick={() => {
                    setMessages([{ role: 'model', text: 'Hello! I am your UBID Intelligence Assistant. How can I help you today?' }]);
                    setLastUserMessage(null);
                  }} 
                  className="p-1 hover:bg-white/10 rounded"
                  title="Clear Conversation"
                >
                  <motion.div whileTap={{ rotate: 180 }}>
                    <Minimize2 className="w-3.5 h-3.5 rotate-45" />
                  </motion.div>
                </button>
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
                        "max-w-[80%] p-2.5 rounded-lg text-xs leading-relaxed shadow-sm whitespace-pre-wrap relative group",
                        m.role === 'user' ? "bg-accent text-white rounded-tr-none" : 
                        m.isError ? "bg-red-50 text-red-700 border border-red-200 rounded-tl-none font-medium" :
                        "bg-white text-text-main border border-border rounded-tl-none"
                      )}>
                        {renderMessageContent(m)}
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
                        onClick={() => {
                          setInput(action);
                          handleSend(action);
                        }}
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
                      maxLength={500}
                      className="w-full pl-3 pr-16 py-2 text-xs bg-gray-50 border border-border rounded-lg focus:ring-1 focus:ring-accent outline-none transition-all"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                    />
                    <div className="absolute right-10 top-1/2 -translate-y-1/2 text-[8px] font-bold text-text-muted opacity-50">
                      {input.length}/500
                    </div>
                    <button
                      onClick={() => handleSend()}
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
