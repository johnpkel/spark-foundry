'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Plug, Loader2 } from 'lucide-react';
import { INTEGRATIONS } from '@/lib/integrations';
import type { IntegrationStatusMap, IntegrationStatus } from '@/lib/integrations';

type DisplayStatus = IntegrationStatus | 'loading';

function statusDotClass(status: DisplayStatus): string {
  if (status === 'active' || status === 'connected') return 'bg-venus-green';
  if (status === 'loading') return 'bg-venus-gray-300 animate-pulse';
  return 'bg-venus-gray-400';
}

function statusLabel(status: DisplayStatus): string {
  if (status === 'active') return 'Active';
  if (status === 'connected') return 'Connected';
  if (status === 'loading') return 'Checking...';
  return 'Not configured';
}

export default function IntegrationsStatus() {
  const [statuses, setStatuses] = useState<IntegrationStatusMap | null>(null);
  const [open, setOpen] = useState(false);
  const [actionKey, setActionKey] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const fetchStatuses = useCallback(() => {
    fetch('/api/integrations/status')
      .then((res) => res.json())
      .then((data) => setStatuses(data))
      .catch(() => setStatuses(null));
  }, []);

  // Fetch on mount + re-fetch when tab regains focus (catches OAuth redirects)
  useEffect(() => {
    fetchStatuses();
    function handleVisibility() {
      if (document.visibilityState === 'visible') fetchStatuses();
    }
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [fetchStatuses]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function getStatus(key: string, checkType: string): DisplayStatus {
    if (checkType === 'static') return 'active';
    if (!statuses) return 'loading';
    return statuses[key]?.status ?? 'not_configured';
  }

  const activeCount = INTEGRATIONS.filter((i) => {
    const s = getStatus(i.key, i.checkType);
    return s === 'active' || s === 'connected';
  }).length;

  function openConnectPopup(key: string, connectUrl: string, popupEventType: string) {
    setActionKey(key);

    const popup = window.open(
      connectUrl,
      'integration-connect',
      'width=600,height=700,scrollbars=yes,resizable=yes'
    );

    function handleMessage(e: MessageEvent) {
      if (e.data?.type === popupEventType) {
        window.removeEventListener('message', handleMessage);
        clearInterval(checkClosed);
        setActionKey(null);
        fetchStatuses();
        popup?.close();
      }
    }

    window.addEventListener('message', handleMessage);

    // Also refresh if user closes popup manually (might have completed OAuth)
    const checkClosed = setInterval(() => {
      if (popup?.closed) {
        clearInterval(checkClosed);
        window.removeEventListener('message', handleMessage);
        setActionKey(null);
        fetchStatuses();
      }
    }, 500);
  }

  async function handleDisconnect(key: string, disconnectEndpoint: string) {
    setActionKey(key);
    try {
      await fetch(disconnectEndpoint, { method: 'POST' });
      fetchStatuses();
    } finally {
      setActionKey(null);
    }
  }

  return (
    <div className="relative" ref={menuRef}>
      {/* Collapsed: Plug icon + dots + count */}
      <button
        onClick={() => { if (!open) fetchStatuses(); setOpen(!open); }}
        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-venus-gray-50 transition-colors"
        title="Integration status"
      >
        <Plug size={15} className="text-venus-gray-500" />
        <div className="flex items-center gap-1">
          {INTEGRATIONS.map((i) => (
            <span
              key={i.key}
              className={`w-2 h-2 rounded-full ${statusDotClass(getStatus(i.key, i.checkType))}`}
            />
          ))}
        </div>
        <span className="text-xs text-venus-gray-500 font-medium">
          {activeCount}/{INTEGRATIONS.length}
        </span>
      </button>

      {/* Expanded dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-1 w-[307px] bg-card-bg rounded-lg border border-venus-gray-200 shadow-lg py-2 z-50">
          <div className="px-4 py-1.5 border-b border-venus-gray-200">
            <p className="text-xs font-semibold text-venus-gray-500 uppercase tracking-wider">
              Integrations
            </p>
          </div>

          {INTEGRATIONS.map((integration) => {
            const Icon = integration.icon;
            const status = getStatus(integration.key, integration.checkType);
            const detail = statuses?.[integration.key]?.detail;
            const isLoading = actionKey === integration.key;
            const isConnected = status === 'active' || status === 'connected';
            const canConnect = !isConnected && !!integration.connectUrl;
            const canDisconnect = isConnected && !!integration.disconnectEndpoint;

            return (
              <div key={integration.key} className="flex items-center gap-3 px-4 py-2.5">
                <Icon size={16} className="text-venus-gray-500 shrink-0" />

                <div className="flex-1 min-w-0">
                  <p className="text-sm text-venus-gray-700 font-medium truncate">
                    {integration.label}
                  </p>
                  {detail && (
                    <p className="text-xs text-venus-gray-500 truncate">{detail}</p>
                  )}
                </div>

                <div className="flex flex-col items-end gap-0.5 shrink-0">
                  {/* Status indicator */}
                  <div className="flex items-center gap-1.5">
                    {isLoading
                      ? <Loader2 size={12} className="animate-spin text-venus-gray-400" />
                      : <span className={`w-2 h-2 rounded-full ${statusDotClass(status)}`} />
                    }
                    <span className={`text-xs ${
                      isConnected
                        ? 'text-venus-green'
                        : 'text-venus-gray-400'
                    }`}>
                      {statusLabel(status)}
                    </span>
                  </div>

                  {/* Connect / Disconnect action */}
                  {canConnect && !isLoading && (
                    <button
                      onClick={() => openConnectPopup(
                        integration.key,
                        integration.connectUrl!,
                        integration.popupEventType!
                      )}
                      className="text-[10px] text-venus-purple hover:text-venus-purple-deep font-medium transition-colors"
                    >
                      Connect →
                    </button>
                  )}
                  {canDisconnect && !isLoading && (
                    <button
                      onClick={() => handleDisconnect(integration.key, integration.disconnectEndpoint!)}
                      className="text-[10px] text-venus-gray-400 hover:text-venus-red transition-colors"
                    >
                      Disconnect
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
