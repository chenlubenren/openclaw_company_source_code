'use client';

import type { Project } from '@/types';

interface ProjectInfoMenuProps {
  project: Project;
  revealOnHover?: boolean;
  onDelete?: (project: Project) => void;
}

export function ProjectInfoMenu({ project, revealOnHover = false, onDelete }: ProjectInfoMenuProps) {
  const intro = project.description?.trim() || project.notes?.trim() || '暂无简介';
  const workspacePath = formatProjectWorkspacePath(project.workspacePath);
  const revealClass = revealOnHover
    ? 'opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100'
    : '';

  if (onDelete) {
    return (
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onDelete(project);
        }}
        className={`flex h-8 w-8 items-center justify-center border-2 border-pixel-black bg-pixel-red font-pixel text-base font-bold leading-none text-pixel-white hover:brightness-95 ${revealClass}`}
        style={{ boxShadow: '2px 2px 0 #101010' }}
        title="删除项目"
        aria-label={`删除项目 ${project.name}`}
      >
        X
      </button>
    );
  }

  return (
    <details className={`relative inline-block shrink-0 text-left ${revealClass}`}>
      <summary
        className="flex h-7 w-8 cursor-pointer list-none items-center justify-center border-2 border-pixel-black bg-pixel-white font-pixel text-sm leading-none text-pixel-black hover:bg-pixel-yellow"
        title="查看项目详情"
        aria-label="查看项目详情"
      >
        ...
      </summary>
      <div
        className="absolute right-0 top-9 z-30 w-[min(320px,80vw)] border-4 border-pixel-black bg-pixel-white p-3 font-pixel text-xs text-pixel-black"
        style={{ boxShadow: '4px 4px 0 #101010' }}
      >
        <ProjectInfoRow label="项目名称" value={project.name} />
        <ProjectInfoRow label="项目简介" value={intro} multiline />
        <ProjectInfoRow label="工作路径" value={workspacePath} monospace multiline />
      </div>
    </details>
  );
}

function ProjectInfoRow({
  label,
  value,
  multiline = false,
  monospace = false,
}: {
  label: string;
  value: string;
  multiline?: boolean;
  monospace?: boolean;
}) {
  return (
    <div className="mb-2 last:mb-0">
      <div className="mb-1 text-[10px] leading-none text-pixel-black/50">{label}</div>
      <div className={`${multiline ? 'whitespace-pre-wrap break-words leading-snug' : 'truncate'} ${monospace ? 'font-mono' : ''}`}>
        {value || '未设置'}
      </div>
    </div>
  );
}

function formatProjectWorkspacePath(workspacePath: string): string {
  const normalized = workspacePath.replace(/\\/g, '/');
  const usersRootMatch = normalized.match(/\/workspaces\/users\/[^/]+\/(.+)$/i);
  if (usersRootMatch?.[1]) return usersRootMatch[1];

  const osUserMatch = normalized.match(/\/Users\/[^/]+\/(.+)$/i);
  if (osUserMatch?.[1]) return osUserMatch[1];

  const windowsUserMatch = normalized.match(/^[A-Za-z]:\/Users\/[^/]+\/(.+)$/i);
  if (windowsUserMatch?.[1]) return windowsUserMatch[1];

  return normalized.replace(/^[A-Za-z]:\//, '');
}
