import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { safeJsonStringify, copyToClipboard } from '../../lib/utils';

interface PayloadViewerProps {
  title?: string;
  data: unknown;
  maxHeight?: string;
}

export const PayloadViewer: React.FC<PayloadViewerProps> = ({
  title,
  data,
  maxHeight = 'max-h-72',
}) => {
  const [copied, setCopied] = useState(false);

  const formatted = typeof data === 'string' ? data : safeJsonStringify(data);

  const handleCopy = async () => {
    const success = await copyToClipboard(formatted);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-900 overflow-hidden text-slate-100 text-xs font-mono">
      <div className="flex items-center justify-between px-3 py-2 bg-slate-950/60 border-b border-slate-800">
        <span className="text-[11px] text-slate-400 font-medium">{title || 'Payload'}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-white transition"
          title="Copy payload"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <div className={`p-3 overflow-auto ${maxHeight}`}>
        {data === undefined || data === null ? (
          <span className="text-slate-500 italic">null</span>
        ) : (
          <pre className="whitespace-pre-wrap break-all leading-relaxed">{formatted}</pre>
        )}
      </div>
    </div>
  );
};
