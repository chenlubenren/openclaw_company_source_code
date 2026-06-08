'use client';

import { useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { BackButton } from '@/components/ui/BackButton';
import { PixelButton } from '@/components/ui/PixelButton';
import { ProjectWorkspace } from '@/components/projects/ProjectWorkspace';
import { useStore } from '@/store/useStore';

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = String(params.id || '');
  const {
    projects,
    architectures,
    initialize,
    fetchProjects,
    openProjectAPI,
    isInitialized,
  } = useStore();

  useEffect(() => {
    void initialize();
  }, [initialize]);

  useEffect(() => {
    document.body.dataset.projectWorkspacePage = 'true';
    return () => {
      delete document.body.dataset.projectWorkspacePage;
    };
  }, []);

  useEffect(() => {
    if (projects.length === 0) {
      void fetchProjects();
    }
  }, [fetchProjects, projects.length]);

  const project = useMemo(
    () => projects.find((item) => item.id === projectId) || null,
    [projectId, projects]
  );

  useEffect(() => {
    if (!project) return;
    void openProjectAPI(project.id);
  }, [openProjectAPI, project?.id]);

  return (
    <div data-project-workspace-root="true" className="w-full pb-48 md:pb-16 lg:relative lg:left-1/2 lg:w-[85vw] lg:max-w-[1800px] lg:-translate-x-1/2">
      <div className="hidden md:block">
        <BackButton href="/projects" />
      </div>

      {project ? (
        <ProjectWorkspace project={project} architectures={architectures} />
      ) : (
        <div className="mt-6 border-4 border-pixel-black bg-pixel-white p-8 text-center" style={{ boxShadow: '6px 6px 0 #101010' }}>
          <p className="font-pixel text-2xl font-bold text-pixel-black">
            {isInitialized ? '项目不存在或尚未加载' : '正在加载项目...'}
          </p>
          <PixelButton className="mt-5" onClick={() => router.push('/projects')}>
            返回项目列表
          </PixelButton>
        </div>
      )}
    </div>
  );
}
