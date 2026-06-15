'use client';

import { Suspense, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useRouter, useSearchParams } from 'next/navigation';
import { BackButton } from '@/components/ui/BackButton';
import { PixelButton } from '@/components/ui/PixelButton';
import { PixelInput } from '@/components/ui/PixelInput';
import { ProjectInfoMenu } from '@/components/projects/ProjectInfoMenu';
import { useStore } from '@/store/useStore';
import type { Lobster, Project, ProjectInput } from '@/types';

const DEFAULT_ICON = '/project-icons/folder-blue.svg';
const PROJECT_ICON_OPTIONS = [
  { src: '/project-icons/folder-blue.svg', label: '蓝色' },
  { src: '/project-icons/folder-green.svg', label: '绿色' },
  { src: '/project-icons/folder-yellow.svg', label: '黄色' },
  { src: '/project-icons/folder-red.svg', label: '红色' },
  { src: '/project-icons/folder-gray.svg', label: '灰色' },
  { src: '/project-icons/folder-purple.svg', label: '紫色' },
];

function FolderIcon({ src, className = 'h-14 w-14' }: { src?: string; className?: string }) {
  return (
    <img
      src={src || DEFAULT_ICON}
      alt=""
      className={`${className} object-contain`}
      style={{ imageRendering: 'pixelated' }}
    />
  );
}

function emptyForm(): ProjectInput {
  return {
    name: '',
    description: '',
    icon: DEFAULT_ICON,
    teamIds: [],
    agentIds: [],
  };
}

function ProjectIconPicker({
  value,
  onChange,
}: {
  value?: string;
  onChange: (value: string) => void;
}) {
  const activeIcon = value || DEFAULT_ICON;

  return (
    <div className="overflow-hidden border-4 border-pixel-black bg-pixel-white p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="shrink-0 border-4 border-pixel-black bg-pixel-white p-2">
          <FolderIcon src={activeIcon} className="h-16 w-16" />
        </div>
        <div className="min-w-0 flex-1">
          <label className="mb-2 block font-pixel text-[1.25rem] font-bold text-pixel-black md:text-base">
            项目图标
          </label>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {PROJECT_ICON_OPTIONS.map((option) => {
              const active = activeIcon === option.src;
              return (
                <button
                  key={option.src}
                  type="button"
                  onClick={() => onChange(option.src)}
                  title={option.label}
                  aria-label={`选择${option.label}项目图标`}
                  className={`flex h-12 w-full min-w-0 items-center justify-center border-2 border-pixel-black bg-pixel-white p-1 ${
                    active ? 'ring-4 ring-pixel-yellow' : 'hover:bg-pixel-yellow/40'
                  }`}
                >
                  <FolderIcon src={option.src} className="h-10 w-10" />
                </button>
              );
            })}
          </div>
          <PixelInput
            value={activeIcon}
            onChange={(nextValue) => onChange(nextValue || DEFAULT_ICON)}
            placeholder={DEFAULT_ICON}
            className="mt-3 min-h-[56px] text-[1.15rem] md:min-h-0 md:text-base"
          />
        </div>
      </div>
    </div>
  );
}

function ProjectEditorModal({
  form,
  architectures,
  agents,
  saving,
  message,
  onClose,
  onSave,
  onUpdate,
  onToggleTeam,
  onToggleAgent,
}: {
  form: ProjectInput;
  architectures: Array<{ id: string; name: string }>;
  agents: Array<Pick<Lobster, 'id' | 'name' | 'description' | 'avatar'>>;
  saving: boolean;
  message: string;
  onClose: () => void;
  onSave: () => void;
  onUpdate: <K extends keyof ProjectInput>(key: K, value: ProjectInput[K]) => void;
  onToggleTeam: (teamId: string) => void;
  onToggleAgent: (agentId: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-pixel-black/70 p-3" role="dialog" aria-modal="true">
      <section className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden border-4 border-pixel-black bg-pixel-white" style={{ boxShadow: '8px 8px 0 #101010' }}>
        <div className="shrink-0 flex items-center justify-between gap-3 border-b-4 border-pixel-black bg-pixel-white p-4">
          <div className="min-w-0">
            <p className="truncate font-pixel text-[2rem] font-bold leading-none text-pixel-black md:text-2xl md:leading-normal">
              新建项目
            </p>
            <p className="mt-2 font-pixel text-[1.05rem] leading-snug text-pixel-black/55 md:text-sm">
              只配置项目名称、简介、图标和可调用对象。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-10 w-10 shrink-0 border-2 border-pixel-black bg-pixel-red font-pixel text-xl leading-none text-pixel-white hover:bg-pixel-gray"
            aria-label="关闭项目编辑"
          >
            x
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)]">
          <div className="min-w-0 space-y-4">
            <div>
              <label className="mb-2 block font-pixel text-[1.25rem] font-bold text-pixel-black md:text-base">
                项目名称 *
              </label>
              <PixelInput
                value={form.name}
                onChange={(value) => onUpdate('name', value)}
                placeholder="例如：论文返修自动化项目"
                className="min-h-[56px] text-[1.25rem] md:min-h-0 md:text-base"
              />
            </div>
            <div>
              <label className="mb-2 block font-pixel text-[1.25rem] font-bold text-pixel-black md:text-base">
                项目简介
              </label>
              <PixelInput
                value={form.description || ''}
                onChange={(value) => onUpdate('description', value)}
                placeholder="这个项目要完成什么？"
                multiline
                rows={6}
                compactMultiline
                className="text-[1.15rem] md:text-base"
              />
            </div>
          </div>

          <div className="min-w-0 space-y-4">
            <ProjectIconPicker
              value={form.icon}
              onChange={(value) => onUpdate('icon', value)}
            />

            <div className="border-4 border-pixel-black bg-pixel-white p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="font-pixel text-[1.35rem] font-bold leading-none text-pixel-black md:text-base md:leading-normal">
                    绑定对象
                  </p>
                  <p className="mt-1 font-pixel text-[1.05rem] leading-none text-pixel-black/55 md:text-sm md:leading-normal">
                    同时支持单 Agent 模式与多 Agent 协作模式
                  </p>
                </div>
                <span className="border-2 border-pixel-black bg-pixel-blue px-3 py-2 font-pixel text-base text-pixel-white md:px-2 md:py-1 md:text-xs">
                  {(form.agentIds || []).length + (form.teamIds || []).length}
                </span>
              </div>
              <div className="grid gap-3">
                <BindingPickerSection
                  title="单 Agent 模式"
                  emptyText="还没有可绑定的单个 Agent。"
                  items={agents}
                  selectedIds={form.agentIds || []}
                  selectedClassName="bg-pixel-blue text-pixel-white"
                  onToggle={onToggleAgent}
                  defaultCollapsed
                  showAvatars
                />
                <BindingPickerSection
                  title="多 Agent 协作模式"
                  emptyText="还没有可绑定的团队。可以先创建团队，再回到这里绑定。"
                  items={architectures}
                  selectedIds={form.teamIds || []}
                  selectedClassName="bg-pixel-green text-pixel-white"
                  onToggle={onToggleTeam}
                />
              </div>
            </div>
          </div>
        </div>

        </div>

        <div className="shrink-0 flex flex-col items-stretch justify-between gap-3 border-t-4 border-pixel-black bg-pixel-white p-4 md:flex-row md:items-center">
          <p className="min-h-[28px] font-pixel text-[1.05rem] leading-snug text-pixel-black/65 md:text-sm">
            {message}
          </p>
          <PixelButton onClick={onSave} disabled={saving || !form.name.trim()} className="min-h-[58px] text-[1.25rem] md:min-h-0 md:text-base">
            {saving ? '保存中...' : '创建项目'}
          </PixelButton>
        </div>
      </section>
    </div>
  );
}

function BindingPickerSection({
  title,
  emptyText,
  items,
  selectedIds,
  selectedClassName,
  onToggle,
  defaultCollapsed = false,
  showAvatars = false,
}: {
  title: string;
  emptyText: string;
  items: Array<{ id: string; name: string; description?: string; avatar?: string }>;
  selectedIds: string[];
  selectedClassName: string;
  onToggle: (id: string) => void;
  defaultCollapsed?: boolean;
  showAvatars?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <div className="border-2 border-pixel-black bg-pixel-white">
      <button
        type="button"
        onClick={() => setCollapsed((value) => !value)}
        className="flex w-full items-center justify-between gap-2 border-b-2 border-pixel-black bg-pixel-black/5 px-3 py-2 text-left"
        aria-expanded={!collapsed}
      >
        <p className="font-pixel text-xs font-bold text-pixel-black">{collapsed ? '+' : '-'} {title}</p>
        <span className="border-2 border-pixel-black bg-pixel-white px-2 py-0.5 font-pixel text-[10px] text-pixel-black">
          {selectedIds.length}
        </span>
      </button>
      {!collapsed && (items.length > 0 ? (
        <div className="max-h-[220px] space-y-2 overflow-y-auto p-3">
          {items.map((item) => {
            const checked = selectedIds.includes(item.id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onToggle(item.id)}
                className={`w-full min-h-[42px] border-2 border-pixel-black p-2 text-left font-pixel text-sm ${
                  checked ? selectedClassName : 'bg-pixel-white text-pixel-black hover:bg-pixel-yellow'
                }`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  {showAvatars && (
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center border-2 border-pixel-black bg-pixel-white">
                      <img src={item.avatar || '/claw_profile/03.png'} alt="" className="h-7 w-7 object-contain" style={{ imageRendering: 'pixelated' }} />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{checked ? '[x]' : '[ ]'} {item.name}</span>
                    {item.description && (
                      <span className={`mt-1 block truncate text-xs ${checked ? 'text-pixel-white/75' : 'text-pixel-black/55'}`}>
                        {item.description}
                      </span>
                    )}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="border-2 border-dashed border-pixel-black p-3 font-pixel text-xs text-pixel-black/55">
          {emptyText}
        </p>
      ))}
    </div>
  );
}

function formatTime(value?: string | null) {
  if (!value) return '尚未打开';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '尚未打开';
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getProjectIntro(project: Project): string {
  return project.description?.trim() || '这个项目还没有简介。';
}

export default function ProjectsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center font-pixel text-pixel-black/50">加载中...</div>}>
      <ProjectsPageInner />
    </Suspense>
  );
}

function ProjectsPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const {
    projects,
    architectures,
    lobsters,
    initialize,
    fetchAgents,
    fetchProjects,
    createProjectAPI,
    deleteProjectAPI,
  } = useStore();
  const [form, setForm] = useState<ProjectInput>(() => emptyForm());
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    void initialize();
  }, [initialize]);

  useEffect(() => {
    void fetchAgents();
  }, [fetchAgents]);

  useEffect(() => {
    const requestedProjectId = searchParams.get('project');
    if (requestedProjectId) {
      router.replace(`/projects/${requestedProjectId}`);
    }
  }, [router, searchParams]);

  const updateForm = <K extends keyof ProjectInput>(key: K, value: ProjectInput[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const toggleTeam = (teamId: string) => {
    const teamIds = form.teamIds || [];
    updateForm(
      'teamIds',
      teamIds.includes(teamId)
        ? teamIds.filter((id) => id !== teamId)
        : [...teamIds, teamId]
    );
  };

  const toggleAgent = (agentId: string) => {
    const agentIds = form.agentIds || [];
    updateForm(
      'agentIds',
      agentIds.includes(agentId)
        ? agentIds.filter((id) => id !== agentId)
        : [...agentIds, agentId]
    );
  };

  const handleNew = () => {
    setForm(emptyForm());
    setMessage('');
    setIsEditorOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      setMessage('项目名称不能为空');
      return;
    }

    setSaving(true);
    setMessage('');
    try {
      await createProjectAPI({
        name: form.name.trim(),
        description: form.description?.trim() || '',
        icon: form.icon || DEFAULT_ICON,
        teamIds: form.teamIds || [],
        agentIds: form.agentIds || [],
      });
      await fetchProjects();
      setIsEditorOpen(false);
      setForm(emptyForm());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存项目失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProject = async (project: Project) => {
    const ok = window.confirm(`确定删除项目「${project.name}」吗？这会删除项目配置和工作空间。`);
    if (!ok) return;
    try {
      await deleteProjectAPI(project.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '删除项目失败');
    }
  };

  return (
    <div data-mobile-projects-page="true" className="mx-auto max-w-6xl px-2 pb-48 md:px-4 md:pb-16">
      <div className="hidden md:block">
        <BackButton href="/" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-5 border-b-4 border-pixel-black bg-pixel-white pb-4 text-left md:mb-6 md:border-b-0 md:bg-transparent md:pb-0 md:text-center"
      >
        <p className="font-pixel text-[1.35rem] leading-none text-pixel-black/55 md:hidden">PROJECT WORKSPACES</p>
        <div className="mt-2 flex items-center justify-between gap-3 md:block">
          <div className="min-w-0">
            <h1 className="chinese-large mb-2 truncate text-pixel-black">
              我的项目
            </h1>
            <p className="hidden font-pixel text-xl text-pixel-blue md:block">PROJECT WORKSPACES</p>
          </div>
          <button
            type="button"
            onClick={handleNew}
            className="flex h-[74px] w-[74px] shrink-0 items-center justify-center border-4 border-pixel-black bg-pixel-blue font-pixel text-4xl leading-none text-pixel-white md:hidden"
            style={{ boxShadow: '4px 4px 0 #101010' }}
            aria-label="新建项目"
          >
            +
          </button>
        </div>
        <p className="mt-2 font-pixel text-[1.2rem] leading-snug text-pixel-black/60 md:text-sm">
          每个项目对应服务器上的个人工作空间，可绑定单个 Agent 或多个 Agent 团队。
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2 md:hidden">
          <div className="border-2 border-pixel-black bg-pixel-blue px-2 py-2 text-center text-pixel-white">
            <p className="font-pixel text-base leading-none">项目</p>
            <p className="mt-1 font-pixel text-[1.7rem] leading-none">{projects.length}</p>
          </div>
          <div className="border-2 border-pixel-black bg-pixel-green px-2 py-2 text-center text-pixel-white">
            <p className="font-pixel text-base leading-none">团队</p>
            <p className="mt-1 font-pixel text-[1.7rem] leading-none">{architectures.length}</p>
          </div>
        </div>
      </motion.div>

      <section className="mx-auto w-full border-4 border-pixel-black bg-pixel-white" style={{ boxShadow: '6px 6px 0 #101010' }}>
        <div className="flex items-center justify-between border-b-4 border-pixel-black p-4">
          <div>
            <p className="font-pixel text-[1.8rem] font-bold leading-none text-pixel-black md:text-xl">项目列表</p>
            <p className="mt-1 font-pixel text-[1.15rem] leading-none text-pixel-black/55 md:text-sm">{projects.length} 个工作空间</p>
          </div>
          <PixelButton size="sm" onClick={handleNew} className="min-h-[48px] md:min-h-0">
            新建
          </PixelButton>
        </div>

        <div className="max-h-[360px] overflow-y-auto p-3 md:max-h-[620px]">
          {projects.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {projects.map((project) => (
                <article
                  key={project.id}
                  className="group relative min-h-[116px] border-4 border-pixel-black bg-pixel-white transition-colors hover:bg-pixel-yellow/60 md:min-h-[128px]"
                  style={{ boxShadow: '4px 4px 0 #101010' }}
                >
                  <button
                    type="button"
                    onClick={() => router.push(`/projects/${project.id}`)}
                    className="block h-full w-full p-3 pr-12 text-left"
                  >
                    <div className="flex items-start gap-3">
                      <FolderIcon src={project.icon} className="h-[72px] w-[72px] shrink-0 md:h-12 md:w-12" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-pixel text-[1.65rem] font-bold leading-none text-pixel-black md:text-lg md:leading-normal">
                          {project.name}
                        </p>
                        <p className="mt-2 line-clamp-2 font-pixel text-[1.15rem] leading-snug text-pixel-black/60 md:mt-1 md:text-sm">
                          {(project.agentIds || []).length} 个 Agent · {project.teamIds.length} 个团队 · {getProjectIntro(project)}
                        </p>
                        <p className="mt-2 font-pixel text-base leading-none text-pixel-black/45 md:mt-1 md:text-xs md:leading-normal">
                          最近：{formatTime(project.lastOpenedAt)}
                        </p>
                      </div>
                    </div>
                  </button>
                  <div className="absolute right-2 top-2">
                    <ProjectInfoMenu project={project} revealOnHover onDelete={handleDeleteProject} />
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="border-4 border-dashed border-pixel-black p-6 text-center">
              <FolderIcon className="mx-auto h-20 w-20 md:h-16 md:w-16" />
              <p className="mt-3 font-pixel text-[1.45rem] text-pixel-black/60 md:text-base">还没有项目</p>
            </div>
          )}
        </div>
      </section>

      {isEditorOpen && (
        <ProjectEditorModal
          form={form}
          architectures={architectures}
          agents={lobsters}
          saving={saving}
          message={message}
          onClose={() => setIsEditorOpen(false)}
          onSave={() => void handleSave()}
          onUpdate={updateForm}
          onToggleTeam={toggleTeam}
          onToggleAgent={toggleAgent}
        />
      )}
    </div>
  );
}
