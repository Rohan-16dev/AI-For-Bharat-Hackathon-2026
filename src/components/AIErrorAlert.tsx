import React from 'react';
import { AlertCircle, RefreshCcw, ShieldAlert, WifiOff, Zap } from 'lucide-react';
import { motion } from 'motion/react';
import { AIError, AIErrorType } from '../services/geminiService';
import { cn } from '../lib/utils';

interface AIErrorAlertProps {
  error: AIError;
  onRetry?: () => void;
  className?: string;
}

export const AIErrorAlert: React.FC<AIErrorAlertProps> = ({ error, onRetry, className }) => {
  const getIcon = () => {
    switch (error.type) {
      case AIErrorType.RATE_LIMIT:
        return <Zap className="w-5 h-5 text-orange-500" />;
      case AIErrorType.QUOTA_EXCEEDED:
        return <Zap className="w-5 h-5 text-red-500" />;
      case AIErrorType.NETWORK_ERROR:
        return <WifiOff className="w-5 h-5 text-slate-500" />;
      case AIErrorType.SERVICE_UNAVAILABLE:
        return <ShieldAlert className="w-5 h-5 text-amber-500" />;
      default:
        return <AlertCircle className="w-5 h-5 text-red-500" />;
    }
  };

  const getBgColor = () => {
    switch (error.type) {
      case AIErrorType.RATE_LIMIT:
        return "bg-orange-50 border-orange-200";
      case AIErrorType.QUOTA_EXCEEDED:
        return "bg-red-50 border-red-200";
      case AIErrorType.NETWORK_ERROR:
        return "bg-slate-50 border-slate-200";
      case AIErrorType.SERVICE_UNAVAILABLE:
        return "bg-amber-50 border-amber-200";
      default:
        return "bg-red-50 border-red-200";
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn("p-4 rounded-lg border-2 shadow-sm", getBgColor(), className)}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5">
          {getIcon()}
        </div>
        <div className="flex-1">
          <h4 className="text-sm font-bold text-text-main mb-1">
            Intelligence Engine: {error.type.replace('_', ' ')}
          </h4>
          <p className="text-xs text-text-main font-medium mb-2 leading-relaxed">
            {error.userMessage}
          </p>
          <p className="text-[10px] text-text-muted italic bg-white/50 p-2 rounded border border-black/5 mb-3 leading-relaxed">
            {error.suggestion}
          </p>
          
          {error.retryable && onRetry && (
            <button
              onClick={onRetry}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-text-main text-white text-[10px] font-bold rounded hover:bg-black transition-all shadow-sm"
            >
              <RefreshCcw className="w-3 h-3" />
              RETRY PIPELINE
            </button>
          )}
        </div>
      </div>
      
      <div className="mt-3 pt-3 border-t border-black/5">
        <details className="cursor-pointer">
          <summary className="text-[9px] font-bold text-text-muted uppercase tracking-widest hover:text-text-main transition-colors">
            Technical Exception Details
          </summary>
          <p className="mt-2 text-[9px] font-mono text-text-muted bg-slate-900 text-slate-300 p-2 rounded overflow-x-auto whitespace-pre-wrap">
            {error.message}
          </p>
        </details>
      </div>
    </motion.div>
  );
};
