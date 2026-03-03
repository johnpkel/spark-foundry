import type { LucideIcon } from 'lucide-react';
import { Building2, HardDrive, MessageSquare, Globe } from 'lucide-react';

// ============================================
// Integration Registry
// Single source of truth for all integrations.
// Both the API route and UI component import this.
// To add a new integration, add an entry here +
// a status check in the API route if server-checked.
// ============================================

export type CheckType = 'server' | 'static';

export interface IntegrationConfig {
  key: string;
  label: string;
  icon: LucideIcon;
  checkType: CheckType;
  /** URL to open for the OAuth connect flow (opens as a popup) */
  connectUrl?: string;
  /** postMessage event type emitted by the popup on completion */
  popupEventType?: string;
  /** API endpoint (POST) to disconnect this integration */
  disconnectEndpoint?: string;
}

export const INTEGRATIONS: IntegrationConfig[] = [
  {
    key: 'contentstack',
    label: 'Contentstack',
    icon: Building2,
    checkType: 'server',
    connectUrl: '/api/auth/contentstack?popup=true',
    popupEventType: 'contentstack-auth',
    disconnectEndpoint: '/api/auth/contentstack/disconnect',
  },
  {
    key: 'google_drive',
    label: 'Google Drive',
    icon: HardDrive,
    checkType: 'server',
    connectUrl: '/api/auth/google',
    popupEventType: 'google-auth',
    disconnectEndpoint: '/api/auth/google/disconnect',
  },
  { key: 'slack', label: 'Slack', icon: MessageSquare, checkType: 'server' },
  { key: 'web_search', label: 'Web Search', icon: Globe, checkType: 'static' },
];

export type IntegrationStatus = 'active' | 'connected' | 'not_configured';

export interface IntegrationStatusResult {
  status: IntegrationStatus;
  detail?: string;
}

export type IntegrationStatusMap = Record<string, IntegrationStatusResult>;
