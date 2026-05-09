import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Brain, Sparkles, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getHighThinkingAnalysis, AIError } from '../services/geminiService';
import { AIErrorAlert } from './AIErrorAlert';
import { cn } from '../lib/utils';

interface ThinkingAssistantProps {
  data: any;
  title?: string;
}

export const ThinkingAssistant = React.memo(({ data, title = "AI Deep Analysis" }: ThinkingAssistantProps) => {
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<AIError | null>(null);

  const handleAnalyze = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Focus the AI on patterns in the provided data
      const result = await getHighThinkingAnalysis(data);
      setAnalysis(result || "Analysis engine returned no signals.");
    } catch (err: any) {
      console.error('Analysis error:', err);
      setError(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-sidebar/5 border border-accent/20 rounded-lg overflow-hidden">
      <div className="p-3 bg-sidebar/10 flex items-center justify-between border-b border-accent/10">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-accent" />
          <span className="text-xs font-bold text-sidebar uppercase tracking-wider">{title}</span>
        </div>
        {!analysis && !isLoading && (
          <button
            onClick={handleAnalyze}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-accent text-white text-[10px] font-bold rounded hover:bg-accent/90 transition-all shadow-sm"
          >
            <Sparkles className="w-3 h-3" />
            RUN THINKING ENGINE
          </button>
        )}
      </div>

      <div className="p-4">
        <AnimatePresence mode="wait">
          {isLoading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4 py-2"
            >
              <div className="flex items-center gap-3 mb-4">
                <Loader2 className="w-5 h-5 text-accent animate-spin" />
                <span className="text-xs font-medium text-text-main animate-pulse">AI is thinking deeply...</span>
              </div>
              <div className="space-y-2">
                <div className="h-3 bg-gray-100 rounded-full w-full animate-pulse" />
                <div className="h-3 bg-gray-100 rounded-full w-[90%] animate-pulse" />
                <div className="h-3 bg-gray-100 rounded-full w-[95%] animate-pulse" />
                <div className="h-3 bg-gray-100 rounded-full w-[40%] animate-pulse" />
              </div>
              <div className="pt-4 space-y-2">
                <div className="h-3 bg-gray-100 rounded-full w-[80%] animate-pulse" />
                <div className="h-3 bg-gray-100 rounded-full w-[85%] animate-pulse" />
              </div>
            </motion.div>
          ) : error ? (
            <motion.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <AIErrorAlert 
                error={error} 
                onRetry={handleAnalyze} 
              />
            </motion.div>
          ) : analysis ? (
            <motion.div
              key="analysis"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="prose prose-sm max-w-none"
            >
              <div className="text-xs text-text-main leading-relaxed bg-white p-4 rounded border border-border">
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
                  {analysis.replace(/^\* /gm, '- ')}
                </ReactMarkdown>
              </div>
              <button
                onClick={() => setAnalysis(null)}
                className="mt-3 text-[10px] text-accent font-bold hover:underline"
              >
                Clear Analysis
              </button>
            </motion.div>
          ) : (
            <div className="text-center py-4">
              <p className="text-[11px] text-text-muted italic">
                Click the button above to trigger a high-thinking AI analysis of this business entity.
              </p>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
});
