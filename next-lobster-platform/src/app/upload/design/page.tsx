'use client';

import { useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  PixelCanvas,
  EMPTY_PIXEL,
  DEFAULT_GRID,
  GRID_SIZE_OPTIONS,
} from '@/components/pixel/PixelCanvas';
import { PixelButton } from '@/components/ui/PixelButton';
import { PixelInput } from '@/components/ui/PixelInput';
import { BackButton } from '@/components/ui/BackButton';
import { useStore } from '@/store/useStore';
import { Lobster } from '@/types';
import { SKILL_OPTIONS, buildDescription } from '@/lib/skillOptions';

const OUTPUT_SIZES = [48, 64, 96, 128];

export default function DesignPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { addLobster } = useStore();

  const initialName = searchParams.get('name') ?? '';
  const publishToMarket = searchParams.get('publish') === 'true';

  const [name, setName] = useState(initialName);
  const [role, setRole] = useState('');
  const [gridSize, setGridSize] = useState(DEFAULT_GRID);
  const [outputSize, setOutputSize] = useState(96);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [pixels, setPixels] = useState<string[][]>(() =>
    Array.from({ length: DEFAULT_GRID }, () =>
      Array.from({ length: DEFAULT_GRID }, () => EMPTY_PIXEL)
    )
  );
  const [isCreating, setIsCreating] = useState(false);
  const [creationProgress, setCreationProgress] = useState(0);

  const handlePixelsChange = useCallback((newPixels: string[][]) => {
    setPixels(newPixels);
  }, []);

  const handleGridSizeChange = (size: number) => {
    setGridSize(size);
    setPixels(
      Array.from({ length: size }, () =>
        Array.from({ length: size }, () => EMPTY_PIXEL)
      )
    );
  };

  const pixelsToDataURL = (grid: string[][], finalSize: number): string => {
    const scale = Math.ceil(finalSize / gridSize);
    const canvas = document.createElement('canvas');
    canvas.width = finalSize;
    canvas.height = finalSize;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, finalSize, finalSize);
    for (let r = 0; r < gridSize; r++) {
      for (let c = 0; c < gridSize; c++) {
        const color = grid[r][c];
        if (color !== EMPTY_PIXEL) {
          ctx.fillStyle = color;
          ctx.fillRect(c * scale, r * scale, scale, scale);
        }
      }
    }
    return canvas.toDataURL('image/png');
  };

  const toggleSkill = (skill: string) => {
    setSelectedSkills((prev) =>
      prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill]
    );
  };

  const applySkillTemplate = () => {
    setRole(buildDescription(selectedSkills));
  };

  const handleCreate = () => {
    if (!name.trim()) return;
    setIsCreating(true);
    let progress = 0;
    const interval = setInterval(() => {
      progress += 5;
      setCreationProgress(progress);
      if (progress >= 100) {
        clearInterval(interval);

        const spriteDataUrl = pixelsToDataURL(pixels, outputSize);

        const newLobster: Lobster = {
          id: `owned-design-${Date.now()}`,
          name: name.trim(),
          role: role.trim() || 'General Assistant',
          status: 'idle',
          avatar: spriteDataUrl,
          createdAt: new Date().toISOString(),
          conversations: [
            {
              id: `conv-${Date.now()}`,
              role: 'lobster',
              content: `你好！我是 ${name.trim()}，一只聪明的智能体。很高兴认识你！有什么我可以帮忙的吗？`,
              timestamp: new Date().toISOString(),
            },
          ],
        };

        addLobster(newLobster);

        setTimeout(() => {
          setIsCreating(false);
          router.push('/my-den');
        }, 600);
      }
    }, 80);
  };

  return (
    <div className="max-w-5xl mx-auto pb-16">
      <BackButton href="/upload" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mt-6 mb-6"
      >
        <h1 className="chinese-large text-pixel-black mb-1">设计Agent形象</h1>
        <p className="font-pixel text-xl text-pixel-blue">LOBSTER DESIGN STUDIO</p>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left: Canvas + Controls */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          className="lg:col-span-3 bg-pixel-white border-4 border-pixel-black p-6"
          style={{ boxShadow: '6px 6px 0 #101010' }}
        >
          <h2 className="font-pixel text-lg text-pixel-black mb-4 text-center border-b-4 border-pixel-black pb-2">
            用拼豆方式绘制形象
          </h2>

          {/* Grid Size Selector */}
          <div className="mb-4">
            <p className="font-pixel text-xs text-pixel-black/60 mb-2">画布分辨率</p>
            <div className="flex flex-wrap gap-2">
              {GRID_SIZE_OPTIONS.map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => handleGridSizeChange(size)}
                  className={`
                    px-3 py-1.5 border-4 border-pixel-black font-pixel text-xs font-bold transition-colors
                    ${gridSize === size
                      ? 'bg-pixel-blue text-pixel-white'
                      : 'bg-pixel-white text-pixel-black hover:bg-pixel-gray'}
                  `}
                  style={{ boxShadow: gridSize === size ? 'none' : '3px 3px 0 #101010' }}
                >
                  {size}×{size}
                </button>
              ))}
            </div>
          </div>

          {/* Output Size Selector */}
          <div className="mb-4">
            <p className="font-pixel text-xs text-pixel-black/60 mb-2">输出尺寸</p>
            <div className="flex flex-wrap gap-2">
              {OUTPUT_SIZES.map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => setOutputSize(size)}
                  className={`
                    px-3 py-1.5 border-4 border-pixel-black font-pixel text-xs font-bold transition-colors
                    ${outputSize === size
                      ? 'bg-pixel-green text-pixel-white'
                      : 'bg-pixel-white text-pixel-black hover:bg-pixel-gray'}
                  `}
                  style={{ boxShadow: outputSize === size ? 'none' : '3px 3px 0 #101010' }}
                >
                  {size}px
                </button>
              ))}
            </div>
          </div>

          <PixelCanvas
            gridSize={gridSize}
            initialPixels={pixels}
            onPixelsChange={handlePixelsChange}
          />

          <div className="mt-3 text-center">
            <p className="font-pixel text-xs text-pixel-black/50">
              点击画布上色 · 右键 / 橡皮擦擦除 · 拖拽连续绘制
            </p>
          </div>
        </motion.div>

        {/* Right: Info Form */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="lg:col-span-2 bg-pixel-white border-4 border-pixel-black p-6 flex flex-col"
          style={{ boxShadow: '6px 6px 0 #101010' }}
        >
          <h2 className="font-pixel text-lg text-pixel-black mb-4 text-center border-b-4 border-pixel-black pb-2">
            基本信息
          </h2>

          <div className="flex flex-col gap-4 flex-1 overflow-y-auto">
            {/* Name */}
            <div>
              <label className="font-pixel text-pixel-black block mb-2 text-sm">
                Agent名称
              </label>
              <PixelInput
                value={name}
                onChange={setName}
                placeholder="给你的Agent起个名字..."
                className="w-full"
              />
            </div>

            {/* Skills Picker */}
            <div>
              <label className="font-pixel text-pixel-black block mb-2 text-sm">
                选择技能（生成推荐描述）
              </label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {SKILL_OPTIONS.map((skill) => (
                  <button
                    key={skill}
                    type="button"
                    onClick={() => toggleSkill(skill)}
                    className={`
                      px-2 py-1 border-2 border-pixel-black font-pixel text-xs font-bold transition-colors
                      ${selectedSkills.includes(skill)
                        ? 'bg-pixel-blue text-pixel-white'
                        : 'bg-pixel-white text-pixel-black hover:bg-pixel-gray'}
                    `}
                    style={{ boxShadow: selectedSkills.includes(skill) ? 'none' : '2px 2px 0 #101010' }}
                  >
                    {selectedSkills.includes(skill) ? '✓' : '+'} {skill}
                  </button>
                ))}
              </div>
              {selectedSkills.length > 0 && (
                <button
                  type="button"
                  onClick={applySkillTemplate}
                  className="text-xs font-pixel text-pixel-blue hover:text-pixel-black underline underline-offset-2"
                >
                  根据所选技能生成描述 ↓
                </button>
              )}
            </div>

            {/* Role Description */}
            <div>
              <label className="font-pixel text-pixel-black block mb-2 text-sm">
                职责描述
              </label>
              <textarea
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="描述这只Agent的职责和能力，例如：擅长编写 Python 脚本处理自动化任务..."
                rows={5}
                className="
                  w-full
                  bg-pixel-white
                  border-4 border-pixel-black
                  font-pixel text-sm text-pixel-black
                  px-3 py-2
                  resize-none
                  focus:outline-none focus:border-pixel-blue
                  placeholder:text-pixel-black/30
                "
                style={{ boxShadow: '3px 3px 0 #101010' }}
              />
              <p className="font-pixel text-xs text-pixel-black/40 mt-1">
                将在市场卡片上显示此描述（留空则为 General Assistant）
              </p>
            </div>

            {/* Publish info */}
            <div
              className="border-2 border-pixel-black p-3 bg-pixel-gray/10"
              style={{ boxShadow: '2px 2px 0 #101010' }}
            >
              <p className="font-pixel text-xs text-pixel-black/70">
                {publishToMarket ? (
                  <>
                    <span className="text-pixel-green font-bold">✓</span> 此Agent将公开到Agent市场
                  </>
                ) : (
                  <>
                    <span className="text-pixel-black/40">—</span> 此Agent仅自己可见
                  </>
                )}
              </p>
            </div>

            {/* Preview */}
            <div className="flex flex-col items-center gap-2">
              <p className="font-pixel text-xs text-pixel-black/60">预览 ({outputSize}px)</p>
              <div className="relative border-4 border-pixel-black" style={{ boxShadow: '4px 4px 0 #101010' }}>
                <img
                  src={pixelsToDataURL(pixels, outputSize)}
                  alt="预览"
                  className="block"
                  style={{
                    width: outputSize,
                    height: outputSize,
                    imageRendering: 'pixelated',
                  }}
                />
              </div>
            </div>
          </div>

          <div className="mt-6">
            {isCreating ? (
              <div>
                <div className="h-4 bg-pixel-black border-2 border-pixel-black">
                  <motion.div
                    className="h-full bg-pixel-green"
                    animate={{ width: `${creationProgress}%` }}
                    transition={{ duration: 0.1 }}
                  />
                </div>
                <p className="font-pixel text-center text-sm text-pixel-black mt-2">
                  正在创建... {creationProgress}%
                </p>
              </div>
            ) : (
              <PixelButton
                onClick={handleCreate}
                disabled={!name.trim()}
                variant="primary"
                size="lg"
                className="w-full"
              >
                完成创建！
              </PixelButton>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
