'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  MarkerType,
  Node,
  Edge,
  EdgeProps,
  getBezierPath,
  getSmoothStepPath,
  Handle,
  Position,
  NodeMouseHandler,
} from '@xyflow/react';
import { motion, AnimatePresence } from 'framer-motion';
import '@xyflow/react/dist/style.css';
import { Architecture, ArchitectureAgent, Lobster } from '@/types';
import { useStore } from '@/store/useStore';
import { LobsterSprite } from '@/components/lobster/LobsterSprite';

/** 画布上展示的成员名：技术名 research-bot-manager 显示为「项目经理」 */
function displayAgentLabel(label: string | undefined, isManager?: boolean): string {
  const raw = (label ?? '').trim();
  if (raw === 'research-bot-manager') return '项目经理';
  if (isManager && /research-bot-manager/i.test(raw)) return '项目经理';
  return raw || '未命名成员';
}

// ─── Preview Node Components (simplified, with handles for visibility) ──────────────
function PreviewAgentNode({
  data,
  selected,
}: {
  data: { label?: string; role?: string; isManager?: boolean; agentId?: string };
  selected?: boolean;
}) {
  const title = displayAgentLabel(data.label, data.isManager);
  return (
    <div
      className={`px-4 py-3 min-w-[160px] border-4 border-pixel-black ${
        data.isManager ? 'bg-pixel-blue' : 'bg-pixel-green'
      } ${selected ? 'ring-4 ring-pixel-yellow' : ''}`}
      style={{ boxShadow: selected ? '6px 6px 0px 0px #f59e0b' : '4px 4px 0px 0px #101010' }}
    >
      {/* Left handle (input) */}
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: '#3b82f6', border: '3px solid #101010', width: 12, height: 12 }}
      />
      {/* Right handle (output) */}
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: '#22c55e', border: '3px solid #101010', width: 12, height: 12 }}
      />
      <div className="flex flex-col items-center gap-1">
        {data.isManager && (
          <span className="bg-pixel-red text-pixel-white px-2 py-0.5 font-pixel text-xs">管理员</span>
        )}
        <span className="font-pixel text-base text-pixel-white font-bold text-center">
          {title}
        </span>
        <span className="font-pixel text-xs text-pixel-white/70 text-center">
          {data.role || '未设置角色'}
        </span>
      </div>
    </div>
  );
}

function PreviewConditionNode({ data }: { data: { label?: string; description?: string } }) {
  return (
    <div
      className="relative bg-pixel-purple border-4 border-pixel-black"
      style={{ width: 180, height: 80 }}
    >
      {/* Left handle (input) */}
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: '#a855f7', border: '3px solid #101010', width: 12, height: 12, left: -6 }}
      />
      {/* Right handle (yes) */}
      <Handle
        type="source"
        position={Position.Right}
        id="yes"
        style={{ background: '#22c55e', border: '3px solid #101010', width: 12, height: 12, right: -6 }}
      />
      {/* Bottom handle (no) */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="no"
        style={{ background: '#ef4444', border: '3px solid #101010', width: 12, height: 12, bottom: -6 }}
      />
      <div
        className="absolute inset-0"
        style={{
          clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
          background: '#a855f7',
        }}
      />
      <div
        className="absolute font-pixel text-center pointer-events-none"
        style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: '55%' }}
      >
        <div className="font-pixel text-base text-pixel-white font-bold text-center leading-tight truncate">
          {data.label || '条件'}
        </div>
      </div>
      <div
        className="absolute font-pixel text-xs text-pixel-white font-bold"
        style={{ right: '8px', top: '50%', transform: 'translateY(-50%)' }}
      >
        <span className="bg-pixel-green border-2 border-pixel-black px-1">是 ✓</span>
      </div>
      <div
        className="absolute font-pixel text-xs text-pixel-white font-bold"
        style={{ left: '50%', bottom: '4px', transform: 'translateX(-50%)' }}
      >
        <span className="bg-pixel-red border-2 border-pixel-black px-1">否 ✗</span>
      </div>
    </div>
  );
}

function PreviewStartNode({ data }: { data: { label?: string } }) {
  return (
    <div
      className="px-4 py-3 min-w-[120px] border-4 border-pixel-black bg-pixel-black"
      style={{ boxShadow: '4px 4px 0px 0px #101010', borderRadius: '999px' }}
    >
      {/* Right handle (output) */}
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: '#22c55e', border: '3px solid #fff', width: 12, height: 12 }}
      />
      <div className="flex flex-col items-center gap-1">
        <span className="bg-pixel-green text-pixel-black px-2 py-0.5 font-pixel text-xs">▶ 起点</span>
        <span className="font-pixel text-base text-pixel-white font-bold text-center">
          {data.label || '用户输入'}
        </span>
      </div>
    </div>
  );
}

// nodeTypes for ReactFlow
const nodeTypes = {
  agentNode: PreviewAgentNode,
  conditionNode: PreviewConditionNode,
  startNode: PreviewStartNode,
};

// ─── DataFlow Edge for Preview ─────────────────────────────────────────────────
// Edge that adapts its shape: "no" port → right-angle step, other → bezier
function DataFlowEdgePreview({
  sourceX,
  sourceY,
  targetX,
  targetY,
  targetPosition,
  selected,
  data,
  sourceHandleId,
}: EdgeProps) {
  const isNoPort =
    sourceHandleId === 'no' || (data as { sourceHandle?: string } | undefined)?.sourceHandle === 'no';

  if (isNoPort) {
    const [stepPath] = getSmoothStepPath({
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourcePosition: Position.Bottom,
      targetPosition: targetPosition ?? Position.Left,
      borderRadius: 0,
      offset: 28,
    });
    return (
      <path
        d={stepPath}
        fill="none"
        stroke={selected ? '#f59e0b' : '#101010'}
        strokeWidth={selected ? 4 : 3}
        markerEnd={`url(#arrow-${selected ? 'selected' : 'default'})`}
      />
    );
  }

  const [edgePath] = getBezierPath({ sourceX, sourceY, targetX, targetY });
  return (
    <path
      d={edgePath}
      fill="none"
      stroke={selected ? '#f59e0b' : '#101010'}
      strokeWidth={selected ? 4 : 3}
      markerEnd={`url(#arrow-${selected ? 'selected' : 'default'})`}
    />
  );
}

const edgeTypes = {
  dataFlow: DataFlowEdgePreview,
};

// ─── Build preview nodes & edges from architecture ─────────────────────────────
function buildPreviewGraph(architecture: Architecture) {
  const { nodes: archNodes, edges: archEdges } = architecture;

  // If architecture has explicit nodes/edges, use them directly (preserve saved positions)
  if (archNodes && archNodes.length > 0) {
    const agentNodes = archNodes.filter((n) => n.type === 'agentNode' || n.type === 'startNode' || n.type === 'conditionNode');
    const allAtOrigin = agentNodes.every((n) => {
      const p = (n as { position?: { x: number; y: number } }).position;
      return !p || (p.x === 0 && p.y === 0);
    });

    const SPACING_X = 280;
    const START_X = 80;
    const START_Y = 60;

    const previewNodes: Node[] = archNodes.map((n, idx) => {
      let position = (n as { position?: { x: number; y: number } }).position ?? { x: 0, y: 0 };
      // If all agent nodes landed at origin (legacy / unpositioned), lay them out linearly
      if (allAtOrigin && n.type === 'agentNode') {
        const agentIdx = agentNodes.findIndex((a) => a.id === n.id);
        position = { x: START_X + agentIdx * SPACING_X, y: START_Y };
      }
      return {
        id: n.id,
        type: n.type,
        position,
        data: n.data as Record<string, unknown>,
      };
    });

    const previewEdges: Edge[] = (archEdges ?? []).map((e) => {
      const ext = e as { sourceHandle?: string | null; targetHandle?: string | null };
      const sh = ext.sourceHandle ?? undefined;
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: sh,
        targetHandle: ext.targetHandle ?? undefined,
        type: 'dataFlow',
        markerEnd: { type: MarkerType.ArrowClosed, color: '#101010' },
        style: { stroke: '#101010', strokeWidth: 3 },
        data: { sourceHandle: sh },
      };
    });

    return { previewNodes, previewEdges };
  }

  // Default: linear pipeline from architecture.agents (ids match agentMap / tooltips)
  const agents = architecture.agents;
  if (agents.length === 0) {
    return { previewNodes: [], previewEdges: [] };
  }

  const SPACING_X = 280;
  const START_X = 80;
  const START_Y = 60;

  const previewNodes: Node[] = agents.map((agent, i) => ({
    id: agent.id,
    type: 'agentNode',
    position: { x: START_X + i * SPACING_X, y: START_Y },
    data: {
      label: agent.name,
      role: agent.role,
      isManager: agent.isManager ?? false,
      inputs: agent.inputs ?? [],
      outputs: agent.outputs ?? [],
      agentId: agent.id,
      linkedLobsterId: agent.linkedLobsterId,
      linkedLobster: null,
      isDeletable: false,
    } as Record<string, unknown>,
  }));

  const previewEdges: Edge[] = agents.slice(0, -1).map((agent, i) => ({
    id: `edge-${agent.id}-${agents[i + 1].id}`,
    source: agent.id,
    target: agents[i + 1].id,
    type: 'dataFlow',
    markerEnd: { type: MarkerType.ArrowClosed, color: '#101010' },
    style: { stroke: '#101010', strokeWidth: 3 },
  }));

  return { previewNodes, previewEdges };
}

/** 同一水平带内节点横坐标过近时右移，避免多个成员节点叠在一起 */
function enforceMinimumHorizontalGap(nodes: Node[]): Node[] {
  if (nodes.length <= 1) return nodes;
  const Y_BAND = 90;
  const MIN_GAP = 260;
  const byBand = new Map<number, Node[]>();
  for (const n of nodes) {
    const band = Math.round(n.position.y / Y_BAND);
    const list = byBand.get(band) ?? [];
    list.push(n);
    byBand.set(band, list);
  }
  const nextPos = new Map<string, { x: number; y: number }>();
  for (const [, group] of Array.from(byBand.entries())) {
    const sorted = [...group].sort((a, b) => a.position.x - b.position.x);
    let prevX = -1e9;
    for (const n of sorted) {
      let x = n.position.x;
      if (x - prevX < MIN_GAP) x = prevX + MIN_GAP;
      prevX = x;
      nextPos.set(n.id, { x, y: n.position.y });
    }
  }
  return nodes.map((n) => ({
    ...n,
    position: nextPos.get(n.id) ?? n.position,
  }));
}

// ─── Main Component ───────────────────────────────────────────────────────────
interface NodeFlowPreviewProps {
  architecture: Architecture;
}

export function NodeFlowPreview({ architecture }: NodeFlowPreviewProps) {
  const { lobsters } = useStore();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  // Deferred timer so tooltip has a chance to catch the mouse before hiding
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHide = () => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };
  const scheduleHide = () => {
    clearHide();
    hideTimer.current = setTimeout(() => setHoveredNodeId(null), 150);
  };

  // Cancel the hide timer whenever hover state changes
  useEffect(() => {
    if (hoveredNodeId) clearHide();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoveredNodeId]);

  const { previewNodes, previewEdges } = useMemo(() => {
    const g = buildPreviewGraph(architecture);
    return {
      previewNodes: enforceMinimumHorizontalGap(g.previewNodes),
      previewEdges: g.previewEdges,
    };
  }, [architecture]);

  // Build a map from pipeline id → agent for rich detail lookups
  const agentMap = useMemo(() => {
    const m = new Map<string, ArchitectureAgent>();
    architecture.agents.forEach((a) => m.set(a.id, a));
    return m;
  }, [architecture.agents]);

  const showTooltip = selectedNodeId || hoveredNodeId;
  const activeNodeId = selectedNodeId ?? hoveredNodeId;
  const activeNode = previewNodes.find((n) => n.id === activeNodeId);

  // Resolve the real agent — check data.agentId first (nodes branch), fall back to node.id (agents-only branch)
  const activeAgent = useMemo(() => {
    if (!activeNodeId) return null;
    // Nodes branch: data.agentId holds the real agent ID created at save time
    const agentIdFromNodeData = (activeNode?.data as { agentId?: string } | undefined)?.agentId;
    return (
      (agentIdFromNodeData ? agentMap.get(agentIdFromNodeData) : null) ??
      agentMap.get(activeNodeId) ??
      null
    );
  }, [activeNodeId, activeNode, agentMap]);

  const linkedLobster = activeAgent?.linkedLobsterId
    ? lobsters.find((l: Lobster) => l.id === activeAgent.linkedLobsterId)
    : null;

  const handleNodeClick: NodeMouseHandler = (evt, node) => {
    setSelectedNodeId((prev) => (prev === node.id ? null : node.id));
  };

  const handlePaneClick = () => {
    setSelectedNodeId(null);
  };

  if (previewNodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 font-pixel text-pixel-black/50">
        暂无节点图
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        className="border-4 border-pixel-black bg-pixel-white"
        style={{ boxShadow: '6px 6px 0px 0px #101010', height: '400px' }}
      >
        <ReactFlow
          nodes={previewNodes.map((n) => ({
            ...n,
            selected: n.id === selectedNodeId,
          }))}
          edges={previewEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={true}
          panOnDrag={true}
          zoomOnScroll={true}
          minZoom={0.3}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
          style={{ background: 'transparent', height: '100%' }}
          onNodeClick={handleNodeClick}
          onPaneClick={handlePaneClick}
          onNodeMouseEnter={(_evt, node) => { clearHide(); setHoveredNodeId(node.id); }}
          onNodeMouseLeave={() => scheduleHide()}
        >
          <Background color="#d4d4d4" gap={16} />
        </ReactFlow>
      </div>

      {/* Node Detail Tooltip — shown when a node is selected or hovered */}
      <AnimatePresence>
        {showTooltip && activeNode && (
          <motion.div
            key={activeNodeId}
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            onMouseEnter={() => clearHide()}
            onMouseLeave={() => scheduleHide()}
            className="absolute top-3 right-3 z-20 w-64 bg-pixel-white border-4 border-pixel-black pointer-events-auto"
            style={{ boxShadow: '6px 6px 0px 0px #101010' }}
          >
            {/* Header */}
            <div
              className={`px-4 py-2 border-b-4 border-pixel-black ${
                activeAgent?.isManager ? 'bg-pixel-blue' : 'bg-pixel-green'
              }`}
            >
              <div className="flex items-center gap-2">
                {activeAgent?.isManager && (
                  <span className="bg-pixel-red text-pixel-white px-2 py-0.5 font-pixel text-xs">
                    管理员
                  </span>
                )}
                <span className="font-pixel text-pixel-white font-bold text-base">
                  {displayAgentLabel(
                    (activeAgent?.name ?? (activeNode.data?.label as string | undefined)) as string | undefined,
                    activeAgent?.isManager ?? Boolean((activeNode.data as { isManager?: boolean } | undefined)?.isManager)
                  )}
                </span>
              </div>
              <span className="font-pixel text-pixel-white/70 text-xs">
                {linkedLobster?.name ??
                  (activeAgent?.role ?? (activeNode.data?.role as string)) ??
                  '未关联Agent'}
              </span>
            </div>

            {/* Body */}
            <div className="p-3 space-y-2 font-pixel text-sm text-pixel-black">
              {/* Inputs */}
              <div>
                <div className="flex items-center gap-1 mb-1">
                  <span className="bg-pixel-blue text-pixel-white px-1.5 py-0.5 border-2 border-pixel-black text-xs">
                    ← 输入
                  </span>
                </div>
                {(activeAgent?.inputs && activeAgent.inputs.length > 0) ? (
                  <div className="flex flex-wrap gap-1">
                    {activeAgent.inputs.map((inp, i) => (
                      <span
                        key={i}
                        className="bg-pixel-gray text-pixel-white px-2 py-0.5 border-2 border-pixel-black text-xs"
                      >
                        {inp}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-pixel-black/40 text-xs italic">无特定输入端口</span>
                )}
              </div>

              {/* Outputs */}
              <div>
                <div className="flex items-center gap-1 mb-1">
                  <span className="bg-pixel-green text-pixel-white px-1.5 py-0.5 border-2 border-pixel-black text-xs">
                    → 输出
                  </span>
                </div>
                {(activeAgent?.outputs && activeAgent.outputs.length > 0) ? (
                  <div className="flex flex-wrap gap-1">
                    {activeAgent.outputs.map((out, i) => (
                      <span
                        key={i}
                        className="bg-pixel-gray text-pixel-white px-2 py-0.5 border-2 border-pixel-black text-xs"
                      >
                        {out}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-pixel-black/40 text-xs italic">无特定输出端口</span>
                )}
              </div>

              {/* Linked Lobster */}
              <div className="pt-1 border-t-2 border-pixel-black/20">
                <div className="flex items-center gap-1 mb-2">
                  <span className="bg-pixel-purple text-pixel-white px-1.5 py-0.5 border-2 border-pixel-black text-xs">
                    🦞 关联Agent
                  </span>
                </div>
                {linkedLobster ? (
                  <div className="flex items-start gap-3 bg-pixel-gray/30 p-2 border-2 border-pixel-black">
                    <LobsterSprite lobster={linkedLobster} size="lg" showStatus={false} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-pixel text-pixel-black font-bold text-sm leading-none">
                          {linkedLobster.name}
                        </span>
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          linkedLobster.isConnected ? 'bg-pixel-green' : 'bg-pixel-black/30'
                        }`} />
                      </div>
                      <div className="font-pixel text-xs text-pixel-black/60 leading-tight truncate">
                        {linkedLobster.role}
                      </div>
                      <div className="font-pixel text-xs text-pixel-black/40 mt-0.5 leading-tight truncate">
                        {linkedLobster.isConnected ? '🟢 在线' : '⚪ 未连接'}
                      </div>
                    </div>
                  </div>
                ) : (
                  <span className="text-pixel-black/40 text-xs italic">未关联任何Agent</span>
                )}
              </div>

              {/* Status */}
              <div className="flex items-center gap-2 pt-1 border-t-2 border-pixel-black/20">
                <span className="font-pixel text-xs text-pixel-black/60">状态:</span>
                <span
                  className={`px-2 py-0.5 border-2 border-pixel-black font-pixel text-xs text-pixel-white ${
                    activeAgent?.status === 'executing'
                      ? 'bg-pixel-yellow'
                      : activeAgent?.status === 'active'
                      ? 'bg-pixel-green'
                      : 'bg-pixel-gray'
                  }`}
                >
                  {activeAgent?.status === 'executing'
                    ? '执行中'
                    : activeAgent?.status === 'active'
                    ? '激活'
                    : '待命'}
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
