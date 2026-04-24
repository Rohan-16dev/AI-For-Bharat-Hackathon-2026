import { useState, useCallback } from 'react';
import { AppNotification } from '../types';

export const useNotifications = () => {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  const addNotification = useCallback((
    title: string, 
    message: string, 
    type: AppNotification['type'] = 'info', 
    entityId?: string
  ) => {
    const newNotification: AppNotification = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(),
      title,
      message,
      type,
      read: false,
      entityId
    };
    setNotifications(prev => [newNotification, ...prev].slice(0, 50));
    return newNotification.id;
  }, []);

  const markAsRead = useCallback((id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  return {
    notifications,
    addNotification,
    markAsRead,
    clearAll
  };
};
