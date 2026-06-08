import { useEffect, useState } from 'react';
import type { AgentPlatformType } from '@/lib/agentTypeDetect';
import type { Project, ProjectFileContent, ProjectFileTree, ProjectInput } from '@/types';

export interface DesktopAgentCandidate {
  type: AgentPlatformType;
  confidence: 'high' | 'low';
  path: string;
  name: string;
  reason: string;
  scores?: Partial<Record<AgentPlatformType, number>>;
}

export interface DesktopFolderFile {
  path: string;
  content: string;
}

export interface DesktopSkippedFile {
  path: string;
  reason: string;
}

export interface DesktopFolderPayload {
  rootPath: string;
  agentType: AgentPlatformType;
  detected?: DesktopAgentCandidate | null;
  fileCount: number;
  totalBytes: number;
  skippedCount: number;
  skippedSamples: DesktopSkippedFile[];
  files: DesktopFolderFile[];
}

export interface DesktopScanResult {
  homeDir: string;
  scannedDirs: number;
  scanLimitReached: boolean;
  agents: DesktopAgentCandidate[];
}

export interface DesktopLocalAgent {
  id: string;
  name: string;
  description?: string;
  avatar?: string;
  platform: AgentPlatformType | string;
  workspacePath: string;
  confidence?: 'high' | 'low';
  reason?: string;
  imported?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DesktopLocalAgentListResult {
  homeDir: string;
  scannedDirs: number;
  scanLimitReached: boolean;
  agents: DesktopLocalAgent[];
}

export interface DesktopImportLocalAgentInput {
  rootPath: string;
  name: string;
  agentType: AgentPlatformType;
  description?: string;
  avatar?: string;
}

export interface DesktopImportLocalAgentResult {
  success: boolean;
  agent: DesktopLocalAgent;
}

export interface OpenClawDesktopBridge {
  isDesktop?: boolean;
  scanLocalAgents: (options?: Record<string, unknown>) => Promise<DesktopScanResult>;
  readLocalAgentFolder: (rootPath: string, options?: Record<string, unknown>) => Promise<DesktopFolderPayload>;
  listLocalAgents?: (options?: Record<string, unknown>) => Promise<DesktopLocalAgentListResult>;
  importLocalAgent?: (
    input: DesktopImportLocalAgentInput,
    options?: Record<string, unknown>
  ) => Promise<DesktopImportLocalAgentResult>;
  deleteLocalAgent?: (agentId: string, options?: Record<string, unknown>) => Promise<{ success: boolean }>;
  listLocalProjects?: (options?: Record<string, unknown>) => Promise<Project[]>;
  createLocalProject?: (input: ProjectInput, options?: Record<string, unknown>) => Promise<Project>;
  updateLocalProject?: (
    projectId: string,
    input: Partial<ProjectInput>,
    options?: Record<string, unknown>
  ) => Promise<Project>;
  openLocalProject?: (projectId: string, options?: Record<string, unknown>) => Promise<Project>;
  deleteLocalProject?: (projectId: string, options?: Record<string, unknown>) => Promise<{ success: boolean }>;
  readLocalProjectTree?: (
    projectId: string,
    relativePath?: string,
    options?: Record<string, unknown>
  ) => Promise<ProjectFileTree>;
  readLocalProjectFile?: (
    projectId: string,
    relativePath: string,
    options?: Record<string, unknown>
  ) => Promise<ProjectFileContent>;
}

declare global {
  interface Window {
    openclawDesktop?: OpenClawDesktopBridge;
  }
}

export function getOpenClawDesktop(): OpenClawDesktopBridge | null {
  if (typeof window === 'undefined') return null;
  return window.openclawDesktop || null;
}

export function isOpenClawDesktop(): boolean {
  return Boolean(getOpenClawDesktop());
}

export function useOpenClawDesktopBridge(): OpenClawDesktopBridge | null {
  const [bridge, setBridge] = useState<OpenClawDesktopBridge | null>(() => getOpenClawDesktop());

  useEffect(() => {
    setBridge(getOpenClawDesktop());
  }, []);

  return bridge;
}
