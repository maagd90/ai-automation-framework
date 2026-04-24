import { useEffect, useRef } from 'react';
import { TerminalIcon } from 'lucide-react';

interface LogsViewerProps {
  logs: string[];
}

export default function LogsViewer({ logs }: LogsViewerProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-950 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-800 border-b border-gray-700">
        <TerminalIcon className="w-4 h-4 text-gray-400" />
        <span className="text-xs font-medium text-gray-300">Logs Console</span>
        <span className="ml-auto text-xs text-gray-500">{logs.length} lines</span>
      </div>
      <div className="h-64 overflow-y-auto p-3 font-mono text-xs space-y-0.5">
        {logs.length === 0 ? (
          <p className="text-gray-500 italic">Waiting for logs…</p>
        ) : (
          logs.map((line, i) => (
            <div key={i} className="text-green-400 leading-relaxed whitespace-pre-wrap break-all">
              {line}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
