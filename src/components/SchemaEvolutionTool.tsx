import React, { useState } from 'react';
import { Database, Zap, FileJson, AlertCircle, CheckCircle2, Loader2, Sparkles, Wand2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { analyzeDataAnomaly } from '../services/geminiService';
import ReactMarkdown from 'react-markdown';
import { cn } from '../lib/utils';

export const SchemaEvolutionTool = () => {
  const [input, setInput] = useState('');
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async () => {
    if (!input) return;
    setIsAnalyzing(true);
    setError(null);
    try {
      // Try to parse to ensure it's JSON
      const parsed = JSON.parse(input);
      const result = await analyzeDataAnomaly(parsed);
      setAnalysis(result);
    } catch (err) {
      setError("Invalid JSON format. Please provide a valid data structure for analysis.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-border overflow-hidden shadow-sm">
      <div className="p-4 bg-bg/50 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-accent" />
          <h3 className="text-sm font-bold text-text-main">Data Resilience & Schema Evolution</h3>
        </div>
        <div className="px-2 py-0.5 bg-accent/10 rounded flex items-center gap-1.5">
          <Zap className="w-3 h-3 text-accent" />
          <span className="text-[10px] font-bold text-accent uppercase tracking-tighter">AI Alignment Active</span>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <p className="text-xs text-text-muted leading-relaxed">
          The business environment is dynamic. New departments or data providers often introduce non-standard schemas. 
          Use this tool to map drifting data structures to the UBID registry automatically.
        </p>

        <div className="space-y-2">
          <label className="text-[10px] font-bold text-text-muted uppercase">Paste Raw Unknown JSON Signal</label>
          <textarea 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder='{ "vendor_uid": "9982", "biz_name": "Agro Corp", "pwr_stat": "High" ... }'
            className="w-full h-32 p-3 bg-gray-900 text-green-400 font-mono text-[11px] rounded-lg border border-black outline-none focus:ring-1 focus:ring-accent"
          />
        </div>

        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            {error && <span className="text-[10px] text-red-500 font-bold flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {error}</span>}
          </div>
          <button 
            onClick={handleAnalyze}
            disabled={!input || isAnalyzing}
            className="px-4 py-2 bg-accent text-white rounded-lg text-xs font-bold shadow-md hover:bg-accent/90 disabled:opacity-50 transition-all flex items-center gap-2"
          >
            {isAnalyzing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Wand2 className="w-4 h-4" />
            )}
            Analyze Compatibility
          </button>
        </div>

        <AnimatePresence>
          {analysis && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              className="mt-6 border-t border-border pt-6 space-y-4"
            >
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-3.5 h-3.5 text-accent" />
                <h4 className="text-[10px] font-bold text-text-main uppercase tracking-wider">AI Schema-Warper Mapping</h4>
              </div>
              <div className="bg-bg/50 p-4 rounded-lg border border-border prose prose-sm max-w-none text-xs text-text-main">
                <ReactMarkdown>{analysis}</ReactMarkdown>
              </div>
              <div className="flex justify-end">
                <button className="px-3 py-1.5 border border-accent/20 text-accent rounded text-[10px] font-bold uppercase hover:bg-accent/5 transition-colors">
                  Generate Logic Adapter
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
