'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { PixelButton } from '@/components/ui/PixelButton';
import { PixelInput } from '@/components/ui/PixelInput';

interface Skill {
  id: string;
  name: string;
  summary: string;
  relativePath: string;
  skillMdPath: string;
  size: number;
  updatedAt: string;
}

interface Agent {
  id: string;
  name: string;
  workspacePath: string;
  providerId?: string | null;
}

interface CapabilitiesConfigProps {
  agent: Agent;
  token: string;
}

const API_BASE = 'http://localhost:3002';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

export function CapabilitiesConfig({ agent, token }: CapabilitiesConfigProps) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadName, setUploadName] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadMessage, setUploadMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selectedSkill = useMemo(
    () => skills.find((skill) => skill.id === selectedSkillId) || skills[0] || null,
    [selectedSkillId, skills]
  );

  // 搜索过滤
  const filteredSkills = useMemo(() => {
    if (!uploadName.trim()) return skills;
    const query = uploadName.toLowerCase();
    return skills.filter(
      (skill) =>
        skill.name.toLowerCase().includes(query) ||
        skill.summary.toLowerCase().includes(query)
    );
  }, [skills, uploadName]);

  const loadSkills = useCallback(async () => {
    if (!token || !agent.id) return;

    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/agents/${agent.id}/skills`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to load skills');
      }

      const data = await res.json();
      const loadedSkills: Skill[] = data.skills || [];
      setSkills(loadedSkills);
      setSelectedSkillId((current) => {
        if (current && loadedSkills.some((skill) => skill.id === current)) return current;
        return loadedSkills[0]?.id || null;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load skills');
    } finally {
      setLoading(false);
    }
  }, [agent.id, token]);

  useEffect(() => {
    void loadSkills();
  }, [loadSkills]);

  const handleUpload = async () => {
    if (!uploadFile || uploading) return;

    setUploading(true);
    setError('');
    setUploadMessage('');

    try {
      const formData = new FormData();
      formData.append('skill', uploadFile);
      if (uploadName.trim()) {
        formData.append('name', uploadName.trim());
      }

      const res = await fetch(`${API_BASE}/api/agents/${agent.id}/skills`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || 'Failed to upload skill');
      }

      const nextSkills: Skill[] = data.skills || [];
      const uploaded: Skill[] = data.uploaded || [];
      setSkills(nextSkills);
      setSelectedSkillId(uploaded[0]?.id || nextSkills[0]?.id || null);
      setUploadFile(null);
      setUploadName('');
      setUploadMessage(`已上传 ${uploaded.length || 1} 个技能`);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to upload skill');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="p-4 max-w-5xl mx-auto space-y-4">
      <div className="bg-pixel-white p-4 border-4 border-pixel-black">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="font-pixel text-lg text-pixel-black">{agent.name} 技能库</h2>
            <p className="font-pixel text-xs text-pixel-black/60 mt-1">
              {uploadName.trim() && filteredSkills.length !== skills.length
                ? `${filteredSkills.length} / ${skills.length} 个技能`
                : `${skills.length} 个技能`}
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <PixelInput
              value={uploadName}
              onChange={setUploadName}
              placeholder="搜索技能..."
              className="sm:w-44"
              disabled={uploading}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept=".md,.zip"
              className="hidden"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                setUploadFile(file);
                // 自动触发上传
                setUploading(true);
                setError('');
                setUploadMessage('');
                try {
                  const formData = new FormData();
                  formData.append('skill', file);
                  if (uploadName.trim()) {
                    formData.append('name', uploadName.trim());
                  }
                  const res = await fetch(`${API_BASE}/api/agents/${agent.id}/skills`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}` },
                    body: formData,
                  });
                  const data = await res.json().catch(() => ({}));
                  if (!res.ok) {
                    throw new Error(data.message || 'Failed to upload skill');
                  }
                  const nextSkills: Skill[] = data.skills || [];
                  const uploaded: Skill[] = data.uploaded || [];
                  setSkills(nextSkills);
                  setSelectedSkillId(uploaded[0]?.id || nextSkills[0]?.id || null);
                  setUploadFile(null);
                  setUploadMessage(`已上传 ${uploaded.length || 1} 个技能`);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Failed to upload skill');
                } finally {
                  setUploading(false);
                }
              }}
            />
            <PixelButton
              variant="primary"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? '上传中...' : '📤 上传技能'}
            </PixelButton>
          </div>
        </div>

        {(uploadFile || uploadMessage || error) && (
          <div className="mt-3 font-pixel text-xs">
            {uploadFile && <span className="text-pixel-black/60">已选择: {uploadFile.name}</span>}
            {uploadMessage && <span className="text-pixel-green ml-4">{uploadMessage}</span>}
            {error && <span className="text-pixel-red ml-4">{error}</span>}
          </div>
        )}
      </div>

      {loading ? (
        <div className="p-8 border-4 border-pixel-black bg-pixel-white text-center">
          <span className="font-pixel text-pixel-black/60">加载中...</span>
        </div>
      ) : skills.length === 0 ? (
        <div className="p-8 border-4 border-pixel-black bg-pixel-white text-center">
          <h3 className="font-pixel text-base text-pixel-black">暂无技能</h3>
          <p className="font-pixel text-xs text-pixel-black/60 mt-2">
            点击上方「上传技能」添加新技能
          </p>
        </div>
      ) : (
        <div className="flex gap-4">
          {/* 左侧技能卡片列表 */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-1/2 overflow-y-auto pr-2 max-h-[calc(100vh-280px)]"
          >
            {filteredSkills.length === 0 ? (
              <div className="p-4 border-4 border-pixel-black bg-pixel-white text-center">
                <p className="font-pixel text-sm text-pixel-black/60">没有找到匹配的技能</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredSkills.map((skill) => {
                  const selected = selectedSkill?.id === skill.id;
                  // 获取第一句话
                  const firstSentence = skill.summary.split(/[。.!?\n]/)[0] || skill.summary;
                  return (
                    <button
                      key={skill.id}
                      type="button"
                      onClick={() => setSelectedSkillId(skill.id)}
                      className={`w-full text-left p-4 border-4 border-pixel-black transition-all ${
                        selected ? 'bg-pixel-yellow/30' : 'bg-pixel-white hover:bg-pixel-black/5'
                      } ${selected ? 'ring-2 ring-pixel-black ring-offset-2' : ''}`}
                      style={{ boxShadow: selected ? '2px 2px 0px 0px #101010' : '4px 4px 0px 0px #101010' }}
                    >
                      <h3 className="font-pixel text-sm text-pixel-black font-bold break-words leading-tight mb-2">
                        {skill.name}
                      </h3>
                      <div className={`relative pr-6 ${selected ? '' : 'h-10'}`}>
                        <p className="font-pixel text-xs text-pixel-black/65 leading-relaxed break-words" style={{
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}>
                          {firstSentence}
                        </p>
                        <span className="absolute bottom-0 right-0 font-pixel text-xs text-pixel-black/50">
                          {selected ? '➡️' : '...'}
                        </span>
                      </div>
                      <div className="mt-auto pt-2 flex items-center justify-end">
                        <span className="font-mono text-xs text-pixel-black/50">
                          {formatSize(skill.size)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            {uploadName.trim() && filteredSkills.length > 0 && (
              <p className="mt-2 font-pixel text-xs text-pixel-black/50 text-center">
                显示 {filteredSkills.length} / {skills.length} 个技能
              </p>
            )}
          </motion.div>

          {/* 右侧技能详情面板 */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="w-1/2 border-4 border-pixel-black bg-pixel-white overflow-y-auto"
            style={{ boxShadow: '6px 6px 0px 0px #101010' }}
          >
            {selectedSkill ? (
              <div className="p-6 space-y-4">
                <div className="flex items-start justify-between gap-4 pb-4 border-b-4 border-pixel-black">
                  <div>
                    <h3 className="font-pixel text-xl text-pixel-black break-words leading-tight">
                      {selectedSkill.name}
                    </h3>
                    <p className="font-mono text-xs text-pixel-black/50 mt-2 break-all">
                      {selectedSkill.skillMdPath}
                    </p>
                  </div>
                  <span className="shrink-0 px-3 py-1 bg-pixel-yellow border-2 border-pixel-black font-pixel text-xs">
                    {formatSize(selectedSkill.size)}
                  </span>
                </div>

                <div>
                  <h4 className="font-pixel text-sm text-pixel-black/50 mb-2 flex items-center gap-2">
                    <span>📝</span> 完整介绍
                  </h4>
                  <div className="p-4 bg-pixel-black/5 border-4 border-pixel-black">
                    <p className="font-pixel text-sm leading-relaxed text-pixel-black break-words whitespace-pre-wrap">
                      {selectedSkill.summary}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="border-4 border-pixel-black p-3 bg-pixel-black/5">
                    <div className="font-pixel text-xs text-pixel-black/45 mb-1">文件路径</div>
                    <div className="font-mono text-xs text-pixel-black break-all leading-relaxed">
                      {selectedSkill.relativePath}
                    </div>
                  </div>
                  <div className="border-4 border-pixel-black p-3 bg-pixel-black/5">
                    <div className="font-pixel text-xs text-pixel-black/45 mb-1">最后更新</div>
                    <div className="font-pixel text-xs text-pixel-black">
                      {formatDate(selectedSkill.updatedAt)}
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t-4 border-pixel-black/20">
                  <div className="flex items-center justify-between">
                    <span className="font-pixel text-xs text-pixel-black/50">
                      ID: {selectedSkill.id.slice(0, 8)}...
                    </span>
                    <span className="font-pixel text-xs text-pixel-green">
                      ✓ 已选择
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <div className="text-4xl mb-4">👈</div>
                  <p className="font-pixel text-sm text-pixel-black/50">
                    从左侧选择一个技能
                  </p>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </div>
  );
}
