import React, { useState, useEffect } from 'react';
import { WorkflowNode, NodeType, HttpMethod, TransformOperation } from '../../features/workflows/workflow.types';
import { Trash2, X, Sliders, Info, ShieldCheck } from 'lucide-react';
import { safeJsonParse, safeJsonStringify } from '../../lib/utils';

interface NodeConfigPanelProps {
  node: WorkflowNode | null;
  onUpdateNode: (nodeId: string, updates: Partial<WorkflowNode>) => void;
  onDeleteNode: (nodeId: string) => void;
  onClose: () => void;
}

export const NodeConfigPanel: React.FC<NodeConfigPanelProps> = ({
  node,
  onUpdateNode,
  onDeleteNode,
  onClose,
}) => {
  if (!node) return null;

  const [label, setLabel] = useState(node.label);
  const [config, setConfig] = useState<Record<string, any>>(node.config || {});
  const [jsonError, setJsonError] = useState<string | null>(null);

  useEffect(() => {
    setLabel(node.label);
    setConfig(node.config || {});
    setJsonError(null);
  }, [node.id, node.label, node.config]);

  const updateConfigField = (field: string, value: any) => {
    const updated = { ...config, [field]: value };
    setConfig(updated);
    onUpdateNode(node.id, { config: updated });
  };

  const handleLabelChange = (newLabel: string) => {
    setLabel(newLabel);
    onUpdateNode(node.id, { label: newLabel });
  };

  return (
    <div className="w-80 border-l border-slate-200 bg-white flex flex-col shrink-0 h-full overflow-hidden select-none">
      {/* Header */}
      <div className="p-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-indigo-600" />
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider font-mono">
            Node Settings
          </h3>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onDeleteNode(node.id)}
            title="Delete this node"
            className="p-1 rounded-md text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Node Label */}
        <div>
          <label className="block text-[11px] font-semibold text-slate-700 uppercase font-mono mb-1">
            Node Label
          </label>
          <input
            type="text"
            value={label}
            onChange={(e) => handleLabelChange(e.target.value)}
            className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-medium"
            placeholder="e.g. My Step"
          />
          <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400 font-mono">
            <span>ID: {node.id}</span>
            <span className="uppercase">{node.type}</span>
          </div>
        </div>

        {/* Node Type Specific Configurations */}
        {node.type === 'trigger' && (
          <div className="space-y-3.5 pt-2 border-t border-slate-100">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 uppercase font-mono mb-1">
                Trigger Type
              </label>
              <select
                value={config.triggerType || 'manual'}
                onChange={(e) => updateConfigField('triggerType', e.target.value)}
                className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="manual">Manual Execution</option>
                <option value="webhook">Inbound Webhook</option>
                <option value="cron">Scheduled Cron</option>
              </select>
            </div>

            {config.triggerType === 'cron' && (
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 uppercase font-mono mb-1">
                  Cron Expression
                </label>
                <input
                  type="text"
                  value={config.cronExpression || '0 * * * *'}
                  onChange={(e) => updateConfigField('cronExpression', e.target.value)}
                  className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-200"
                  placeholder="0 * * * *"
                />
                <div className="mt-1 flex gap-1 flex-wrap">
                  {['0 * * * *', '0 9 * * *', '*/15 * * * *'].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => updateConfigField('cronExpression', preset)}
                      className="px-1.5 py-0.5 text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-600 rounded font-mono"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {config.triggerType === 'webhook' && (
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 uppercase font-mono mb-1">
                  Webhook Ingress Path
                </label>
                <input
                  type="text"
                  value={config.webhookPath || '/webhooks/v1/event'}
                  onChange={(e) => updateConfigField('webhookPath', e.target.value)}
                  className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-200"
                  placeholder="/webhooks/v1/event"
                />
              </div>
            )}

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 uppercase font-mono mb-1">
                Default Test Payload (JSON)
              </label>
              <textarea
                rows={5}
                value={safeJsonStringify(config.defaultPayload || {})}
                onChange={(e) => {
                  try {
                    const parsed = JSON.parse(e.target.value);
                    updateConfigField('defaultPayload', parsed);
                    setJsonError(null);
                  } catch (err: any) {
                    setJsonError('Invalid JSON syntax');
                  }
                }}
                className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-200 focus:ring-indigo-500 focus:border-indigo-500"
              />
              {jsonError && <p className="text-[10px] text-rose-500 mt-1">{jsonError}</p>}
            </div>
          </div>
        )}

        {node.type === 'transform' && (
          <div className="space-y-3.5 pt-2 border-t border-slate-100">
            <div className="p-2 bg-indigo-50/60 rounded-lg border border-indigo-100 text-[11px] text-indigo-900 flex items-start gap-1.5">
              <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
              <span>Safe deterministic execution without arbitrary eval.</span>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 uppercase font-mono mb-1">
                Operation
              </label>
              <select
                value={config.operation || 'pass_through'}
                onChange={(e) => updateConfigField('operation', e.target.value as TransformOperation)}
                className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200"
              >
                <option value="pass_through">Pass Through (No-op)</option>
                <option value="json_extract">JSON Field Extract</option>
                <option value="string_template">String Template Interpolation</option>
                <option value="math_aggregate">Math Aggregation</option>
                <option value="filter_array">Filter Array</option>
              </select>
            </div>

            {config.operation === 'json_extract' && (
              <>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 uppercase font-mono mb-1">
                    Path to Extract (dot-notation)
                  </label>
                  <input
                    type="text"
                    value={config.extractPath || ''}
                    onChange={(e) => updateConfigField('extractPath', e.target.value)}
                    className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-200"
                    placeholder="e.g. data.items[0].email"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 uppercase font-mono mb-1">
                    Target Output Key
                  </label>
                  <input
                    type="text"
                    value={config.targetField || 'extracted'}
                    onChange={(e) => updateConfigField('targetField', e.target.value)}
                    className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-200"
                  />
                </div>
              </>
            )}

            {config.operation === 'string_template' && (
              <>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 uppercase font-mono mb-1">
                    Template String
                  </label>
                  <textarea
                    rows={3}
                    value={config.template || ''}
                    onChange={(e) => updateConfigField('template', e.target.value)}
                    className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-200"
                    placeholder="Hello, {{name}}! Total: {{data.total}}"
                  />
                  <p className="mt-1 text-[10px] text-slate-400">
                    Use {'{{'}property{'}}'} to insert upstream values.
                  </p>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 uppercase font-mono mb-1">
                    Target Output Key
                  </label>
                  <input
                    type="text"
                    value={config.targetField || 'message'}
                    onChange={(e) => updateConfigField('targetField', e.target.value)}
                    className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-200"
                  />
                </div>
              </>
            )}

            {config.operation === 'math_aggregate' && (
              <>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 uppercase font-mono mb-1">
                    Aggregate Function
                  </label>
                  <select
                    value={config.aggregateOp || 'sum'}
                    onChange={(e) => updateConfigField('aggregateOp', e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200"
                  >
                    <option value="sum">Sum</option>
                    <option value="count">Count</option>
                    <option value="avg">Average</option>
                    <option value="min">Min</option>
                    <option value="max">Max</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 uppercase font-mono mb-1">
                    Field to Aggregate
                  </label>
                  <input
                    type="text"
                    value={config.aggregateField || 'value'}
                    onChange={(e) => updateConfigField('aggregateField', e.target.value)}
                    className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-200"
                    placeholder="e.g. amount or value"
                  />
                </div>
              </>
            )}

            {config.operation === 'filter_array' && (
              <>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 uppercase font-mono mb-1">
                    Filter Key
                  </label>
                  <input
                    type="text"
                    value={config.filterKey || ''}
                    onChange={(e) => updateConfigField('filterKey', e.target.value)}
                    className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-200"
                    placeholder="e.g. status"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 uppercase font-mono mb-1">
                    Filter Match Value
                  </label>
                  <input
                    type="text"
                    value={config.filterValue || ''}
                    onChange={(e) => updateConfigField('filterValue', e.target.value)}
                    className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-200"
                    placeholder="e.g. active"
                  />
                </div>
              </>
            )}
          </div>
        )}

        {node.type === 'httpRequest' && (
          <div className="space-y-3.5 pt-2 border-t border-slate-100">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 uppercase font-mono mb-1">
                HTTP Method & URL
              </label>
              <div className="flex gap-2">
                <select
                  value={config.method || 'GET'}
                  onChange={(e) => updateConfigField('method', e.target.value as HttpMethod)}
                  className="w-24 px-2 py-1.5 text-xs font-mono rounded-lg border border-slate-200 shrink-0"
                >
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                  <option value="PUT">PUT</option>
                  <option value="PATCH">PATCH</option>
                  <option value="DELETE">DELETE</option>
                </select>
                <input
                  type="text"
                  value={config.url || ''}
                  onChange={(e) => updateConfigField('url', e.target.value)}
                  className="flex-1 px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-200"
                  placeholder="https://api.example.com/v1"
                />
              </div>
            </div>

            {/* Mock Response Configuration for testing */}
            <div className="rounded-lg border border-slate-200 p-3 bg-slate-50/50">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-700">Simulate Response (Mock)</span>
                <input
                  type="checkbox"
                  checked={Boolean(config.mockResponse?.enabled)}
                  onChange={(e) =>
                    updateConfigField('mockResponse', {
                      enabled: e.target.checked,
                      status: config.mockResponse?.status || 200,
                      body: config.mockResponse?.body || { ok: true, data: 'Mock payload' },
                    })
                  }
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
              </div>
              {config.mockResponse?.enabled && (
                <div className="mt-2.5 space-y-2">
                  <div>
                    <label className="block text-[10px] text-slate-500 font-mono">Mock Status Code</label>
                    <input
                      type="number"
                      value={config.mockResponse?.status || 200}
                      onChange={(e) =>
                        updateConfigField('mockResponse', {
                          ...config.mockResponse,
                          status: Number(e.target.value),
                        })
                      }
                      className="w-24 px-2 py-1 text-xs font-mono border rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500 font-mono">Mock Body (JSON)</label>
                    <textarea
                      rows={3}
                      value={safeJsonStringify(config.mockResponse?.body || {})}
                      onChange={(e) => {
                        try {
                          const parsed = JSON.parse(e.target.value);
                          updateConfigField('mockResponse', {
                            ...config.mockResponse,
                            body: parsed,
                          });
                        } catch {}
                      }}
                      className="w-full p-2 text-xs font-mono border rounded bg-white"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {node.type === 'delay' && (
          <div className="space-y-3.5 pt-2 border-t border-slate-100">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 uppercase font-mono mb-1">
                Duration (milliseconds)
              </label>
              <input
                type="number"
                min="0"
                max="60000"
                step="100"
                value={config.durationMs ?? 1000}
                onChange={(e) => updateConfigField('durationMs', Number(e.target.value))}
                className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-200"
              />
              <div className="mt-2 flex gap-1.5">
                {[500, 1000, 2000, 5000].map((ms) => (
                  <button
                    key={ms}
                    type="button"
                    onClick={() => updateConfigField('durationMs', ms)}
                    className="px-2 py-1 text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-mono"
                  >
                    {ms}ms
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {node.type === 'webhookAction' && (
          <div className="space-y-3.5 pt-2 border-t border-slate-100">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 uppercase font-mono mb-1">
                Target Webhook URL
              </label>
              <input
                type="text"
                value={config.url || ''}
                onChange={(e) => updateConfigField('url', e.target.value)}
                className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-200"
                placeholder="https://hooks.slack.com/services/..."
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="incParent"
                checked={config.includeParentOutput ?? true}
                onChange={(e) => updateConfigField('includeParentOutput', e.target.checked)}
                className="rounded text-indigo-600 focus:ring-indigo-500"
              />
              <label htmlFor="incParent" className="text-xs text-slate-700">
                Forward upstream node payload
              </label>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
