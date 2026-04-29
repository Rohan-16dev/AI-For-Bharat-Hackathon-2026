import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  CheckCircle2, 
  AlertCircle, 
  Info, 
  AlertTriangle,
  ShieldAlert,
  Gavel
} from 'lucide-react';
import { AppNotification } from '../types';
import { cn } from '../lib/utils';
import { formatDistanceToNow } from 'date-fns';

interface NotificationManagerProps {
  notifications: AppNotification[];
  onMarkRead: (id: string) => void;
  onClear: () => void;
}

export const NotificationManager = ({ notifications, onMarkRead, onClear }: NotificationManagerProps) => {
  const activeNotifications = notifications.filter(n => !n.read).slice(0, 5);

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 w-80 pointer-events-none">
      <AnimatePresence>
        {activeNotifications.map((n) => (
          <motion.div
            key={n.id}
            initial={{ opacity: 0, x: 50, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, x: 20 }}
            className={cn(
              "p-3 rounded-lg border shadow-lg pointer-events-auto flex gap-3 relative overflow-hidden",
              n.type === 'success' ? "bg-white border-green-200 text-green-900" :
              n.type === 'error' ? "bg-white border-red-200 text-red-900" :
              n.type === 'warning' ? "bg-white border-orange-200 text-orange-900" :
              n.type === 'security' ? "bg-slate-900 border-red-500 text-white" :
              n.type === 'governance' ? "bg-white border-accent/30 text-sidebar" :
              "bg-white border-blue-200 text-blue-900"
            )}
          >
            {/* Color strip on the left */}
            <div className={cn(
              "absolute left-0 top-0 bottom-0 w-1",
              n.type === 'success' ? "bg-green-500" :
              n.type === 'error' ? "bg-red-500" :
              n.type === 'warning' ? "bg-orange-500" :
              n.type === 'security' ? "bg-red-600" :
              n.type === 'governance' ? "bg-accent" :
              "bg-blue-500"
            )} />

            <div className="mt-0.5">
              {n.type === 'success' && <CheckCircle2 className="w-4 h-4 text-green-500" />}
              {n.type === 'error' && <AlertCircle className="w-4 h-4 text-red-500" />}
              {n.type === 'warning' && <AlertTriangle className="w-4 h-4 text-orange-500" />}
              {n.type === 'security' && <ShieldAlert className="w-4 h-4 text-red-400" />}
              {n.type === 'governance' && <Gavel className="w-4 h-4 text-accent" />}
              {n.type === 'info' && <Info className="w-4 h-4 text-blue-500" />}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-0.5">
                <h4 className="text-[10px] font-bold uppercase tracking-wider truncate">{n.title}</h4>
                <button 
                  onClick={() => onMarkRead(n.id)}
                  className="text-text-muted hover:text-text-main transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
              <p className="text-[11px] leading-tight opacity-90">{n.message}</p>
              <div className="mt-1.5 text-[8px] opacity-50 uppercase font-bold tracking-tighter">
                {formatDistanceToNow(new Date(n.timestamp))} ago
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};
