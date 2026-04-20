import React, { Component, ErrorInfo, ReactNode, useState } from 'react';
import { AlertTriangle, ShieldCheck, HeartPulse, RefreshCw, Send, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getHealerPatch } from '../services/geminiService';
import { cn } from '../lib/utils';
import ReactMarkdown from 'react-markdown';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  healerResponse: string | null;
  isHealing: boolean;
}

export class SelfHealingBridge extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      healerResponse: null,
      isHealing: false
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    console.error("System Failure Detected:", error, errorInfo);
  }

  handleHeal = async () => {
    const { error, errorInfo } = this.state;
    if (!error) return;

    this.setState({ isHealing: true });
    try {
      const patch = await getHealerPatch(
        error.stack || error.message,
        errorInfo?.componentStack || "Unknown Component Context"
      );
      this.setState({ healerResponse: patch });
    } catch (err) {
      this.setState({ healerResponse: "Healer Engine Offline. Manual intervention required." });
    } finally {
      this.setState({ isHealing: false });
    }
  };

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      healerResponse: null,
      isHealing: false
    });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-bg flex flex-col items-center justify-center p-6 space-y-6">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-full max-w-2xl bg-white border border-red-200 rounded-xl shadow-2xl overflow-hidden"
          >
            <div className="bg-red-50 p-6 flex items-center gap-4 border-b border-red-100">
              <div className="p-3 bg-red-100 rounded-full">
                <AlertTriangle className="w-8 h-8 text-red-600" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-red-900">Critical Runtime Exception</h1>
                <p className="text-sm text-red-700">The UBID Intelligence System has encountered a data-parity or logic error.</p>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-gray-900 rounded-lg p-4 font-mono text-[11px] text-red-400 overflow-x-auto max-h-[150px] border border-black shadow-inner">
                {this.state.error?.toString()}
              </div>

              <AnimatePresence>
                {this.state.healerResponse ? (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3"
                  >
                    <div className="flex items-center gap-2 text-blue-800 font-bold text-xs uppercase tracking-wider">
                      <ShieldCheck className="w-4 h-4" />
                      AI Healer Patch Suggestion
                    </div>
                    <div className="prose prose-sm max-w-none text-blue-900 text-xs">
                      <ReactMarkdown>{this.state.healerResponse}</ReactMarkdown>
                    </div>
                    <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-blue-100">
                      <button 
                        onClick={this.handleReset}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 shadow-sm flex items-center gap-2"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Apply Stabilization & Reset
                      </button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div className="flex flex-col items-center py-6 space-y-4">
                    <p className="text-xs text-text-muted italic text-center max-w-md">
                      The automated healing engine can analyze this stack trace and suggest an immediate logic fix or defensive wrapper.
                    </p>
                    <button 
                      onClick={this.handleHeal}
                      disabled={this.state.isHealing}
                      className="px-6 py-3 bg-accent text-white rounded-xl text-sm font-bold shadow-lg hover:shadow-accent/40 active:scale-95 transition-all flex items-center gap-3 disabled:opacity-50"
                    >
                      {this.state.isHealing ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          DEPLOYING REPAIR AI...
                        </>
                      ) : (
                        <>
                          <HeartPulse className="w-5 h-5" />
                          TRIGGER AUTO-REPAIR
                        </>
                      )}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>

          <button onClick={this.handleReset} className="text-sm font-bold text-text-muted hover:text-accent transition-colors flex items-center gap-2">
            <RefreshCw className="w-4 h-4" /> Skip Healer & Force Reboot
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
