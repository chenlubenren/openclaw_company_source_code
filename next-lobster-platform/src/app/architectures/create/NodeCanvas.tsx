'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  ReactFlow,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  Background,
  Controls,
  MiniMap,
  Connection,
  Edge,
  Node,
  NodeChange,
  EdgeChange,
  Handle,
  Position,
  NodeProps,
  useNodesState,
  useEdgesState,
  MarkerType,
  getSmoothStepPath,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { motion } from 'framer-motion';
import { PixelButton } from '@/components/ui/PixelButton';
import { ArchitectureAgent, Lobster, WorkflowAgentKind } from '@/types';
import { useStore } from '@/store/useStore';
import { LobsterSprite } from '@/components/lobster/LobsterSprite';
import type { ArchTemplate } from '@/lib/archTemplates';
import { getConnectionValidationError } from '@/lib/workflowDsl';

interface AgentNodeData {
  label: string;
  role: string;
  kind?: WorkflowAgentKind;
  isManager: boolean;
  inputs: string[];
  outputs: string[];
  linkedLobster?: Lobster | null;
  agentId: string;
  isDeletable?: boolean;
  [key: string]: unknown;
}

// ─── Agent Node ────────────────────────────────────────────────────────────────
export function AgentNode({ data, selected }: NodeProps<Node<AgentNodeData> >) {
  return (
    <div
      className={`
        px-4 py-3 min-w-[160px] border-4 border-pixel-black
        ${data.isManager ? 'bg-pixel-blue' : 'bg-pixel-green'}
        ${selected ? 'ring-4 ring-pixel-yellow ring-offset-2' : ''}
        ${!data.isDeletable ? 'opacity-90' : ''}
        transition-all
      `}
      style={{ boxShadow: '4px 4px 0px 0px #101010' }}
    >
      {/* Output handle (right). Always visible: port labels are metadata, not connection availability. */}
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: '#22c55e', border: '3px solid #101010', width: 14, height: 14 }}
      />

      <div className="flex flex-col items-center gap-1">
        {data.isManager && (
          <span className="bg-pixel-red text-pixel-white px-2 py-0.5 font-pixel text-xs">管理员</span>
        )}
        <span className="font-pixel text-base text-pixel-white font-bold text-center">
          {data.label || '未命名成员'}
        </span>
        <span className="font-pixel text-xs text-pixel-white/70 text-center">
          {data.role || '未设置角色'}
        </span>
        {data.kind && (
          <span className="bg-pixel-black/20 text-pixel-white/80 px-2 py-0.5 font-pixel text-[10px]">
            {AGENT_KIND_OPTIONS.find((option) => option.value === data.kind)?.label ?? data.kind}
          </span>
        )}
        {data.linkedLobster && (
          <span className="bg-pixel-black/30 text-pixel-white/80 px-2 py-0.5 font-pixel text-xs">
            🟢 {data.linkedLobster.name}
          </span>
        )}
      </div>

      {/* Input handle (left) */}
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: '#3b82f6', border: '3px solid #101010', width: 14, height: 14 }}
      />
    </div>
  );
}

// ─── Condition Node (Wide flat diamond — 左=输入, 右=是, 下=否) ────────────────

export interface ConditionNodeData {
  label: string;
  description?: string;
  [key: string]: unknown;
}

export function ConditionNode({ data, selected }: NodeProps<Node<ConditionNodeData> >) {
  const label = data.label || '条件';
  const description = data.description || '';

  // Diamond points for 160×60 (wide/flat):
  //   top(80,2), right(158,30), bottom(80,58), left(2,30)
  // Left handle  → point (2,30)  → div left: 2/160*100 = 1.25%,  top: 30/60*100 = 50%
  // Right handle → point (158,30) → div right: (160-158)/160*100 = 1.25%, top: 50%
  // Bottom handle → point (80,58) → div left: 50%, bottom: (60-58)/60*100 = 3.3%

  return (
    <div
      className="relative"
      style={{ width: 180, height: 80 }}
    >
      <svg
        width="180"
        height="80"
        viewBox="0 0 180 80"
        className="absolute inset-0"
        style={{ overflow: 'visible' }}
      >
        {selected && (
          <polygon
            points="90,3 177,40 90,77 3,40"
            fill="#a855f7"
            stroke="#facc15"
            strokeWidth="6"
          />
        )}
        <polygon
          points="90,3 177,40 90,77 3,40"
          fill="#a855f7"
          stroke="#101010"
          strokeWidth="4"
        />
      </svg>

      {/* Label & description — diamond center */}
      <div
        className="absolute font-pixel text-center pointer-events-none"
        style={{
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: '55%',
        }}
      >
        <div className="font-pixel text-base text-pixel-white font-bold text-center leading-tight truncate">
          {label}
        </div>
        {description && (
          <div className="font-pixel text-[9px] text-pixel-white/70 text-center leading-tight truncate mt-0.5">
            {description}
          </div>
        )}
      </div>

      {/* "是" badge — right section, inside diamond boundary */}
      <div
        className="absolute font-pixel text-xs text-pixel-white font-bold"
        style={{
          right: '8px',
          top: '50%',
          transform: 'translateY(-50%)',
          pointerEvents: 'none',
        }}
      >
        <span className="bg-pixel-green border-2 border-pixel-black px-1">是 ✓</span>
      </div>

      {/* "否" badge — bottom section, inside diamond boundary */}
      <div
        className="absolute font-pixel text-xs text-pixel-white font-bold"
        style={{
          left: '50%',
          bottom: '4px',
          transform: 'translateX(-50%)',
          pointerEvents: 'none',
        }}
      >
        <span className="bg-pixel-red border-2 border-pixel-black px-1">否 ✗</span>
      </div>

      {/* Input handle — left (diamond left point y=40, mid-height) */}
      <Handle
        type="target"
        position={Position.Left}
        id="input"
        style={{
          background: '#a855f7',
          border: '3px solid #101010',
          width: 14,
          height: 14,
          left: -7,
          top: '50%',
        }}
      />

      {/* Output: Yes — right (diamond right point y=40) */}
      <Handle
        id="yes"
        type="source"
        position={Position.Right}
        style={{
          background: '#22c55e',
          border: '3px solid #101010',
          width: 14,
          height: 14,
          right: -7,
          top: '50%',
        }}
      />

      {/* Output: No — bottom (diamond bottom point y=77, offset into div: (80-77)/80 = 3.75%) */}
      <Handle
        id="no"
        type="source"
        position={Position.Bottom}
        style={{
          background: '#ef4444',
          border: '3px solid #101010',
          width: 14,
          height: 14,
          bottom: -7,
          left: '50%',
          transform: 'translateX(-50%)',
        }}
      />
    </div>
  );
}

// ─── Start / End Nodes ────────────────────────────────────────────────────────
export function StartNode({ data }: NodeProps<Node<{ label: string }>>) {
  return (
    <div
      className="px-4 py-3 min-w-[120px] border-4 border-pixel-black bg-pixel-black"
      style={{ boxShadow: '4px 4px 0px 0px #101010', borderRadius: '999px' }}
    >
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: '#22c55e', border: '3px solid #fff', width: 14, height: 14 }}
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

function EndNode({ data }: NodeProps<Node<{ label: string }>>) {
  return (
    <div
      className="px-4 py-3 min-w-[120px] border-4 border-pixel-black bg-pixel-black"
      style={{ boxShadow: '4px 4px 0px 0px #101010', borderRadius: '999px' }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: '#ef4444', border: '3px solid #fff', width: 14, height: 14 }}
      />
      <div className="flex flex-col items-center gap-1">
        <span className="bg-pixel-red text-pixel-white px-2 py-0.5 font-pixel text-xs">■ 终点</span>
        <span className="font-pixel text-base text-pixel-white font-bold text-center">
          {data.label || '输出'}
        </span>
      </div>
    </div>
  );
}

const nodeTypes = {
  agentNode: AgentNode,
  conditionNode: ConditionNode,
  startNode: StartNode,
  endNode: EndNode,
};

// ─── DataFlow Edge (no label) ─────────────────────────────────────────────────
// Edge that adapts its shape: "no" port (bottom) → right-angle step,
// "yes" port (right) or other → smooth bezier
function DataFlowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  targetPosition,
  selected,
  data,
  markerEnd,
  sourceHandleId,
}: {
  id: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  targetPosition?: Position;
  selected?: boolean;
  data?: { onDelete?: (id: string) => void; sourceHandle?: string };
  markerEnd?: string;
  /** React Flow v12 passes handle id here (not `sourceHandle`) */
  sourceHandleId?: string | null;
}) {
  const [isHovered, setIsHovered] = useState(false);

  const isNoPort =
    sourceHandleId === 'no' || (data as { sourceHandle?: string } | undefined)?.sourceHandle === 'no';

  let pathD: string;
  let midX: number;
  let midY: number;

  if (isNoPort) {
    // 「否」自底部端口出发：直角折线（先离开节点再拐向目标），与示意图一致
    const [stepPath, labelX, labelY] = getSmoothStepPath({
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourcePosition: Position.Bottom,
      targetPosition: targetPosition ?? Position.Left,
      borderRadius: 0,
      offset: 28,
    });
    pathD = stepPath;
    midX = labelX;
    midY = labelY;
  } else {
    // Bezier curve for "yes" and other ports
    midX = (sourceX + targetX) / 2;
    midY = (sourceY + targetY) / 2;
    pathD = `M ${sourceX} ${sourceY} C ${midX} ${sourceY} ${midX} ${targetY} ${targetX} ${targetY}`;
  }

  return (
    <>
      <path
        d={pathD}
        fill="none"
        stroke={selected ? '#f59e0b' : '#101010'}
        strokeWidth={selected ? 4 : 3}
        strokeDasharray="5,3"
        style={{ zIndex: 10 }}
        markerEnd={markerEnd}
      />
      <path
        d={pathD}
        fill="none"
        stroke="transparent"
        strokeWidth={24}
        style={{ zIndex: 9, cursor: 'pointer' }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={(e) => {
          e.stopPropagation();
          data?.onDelete?.(id);
        }}
      />
      {(isHovered || selected) && (
        <g
          transform={`translate(${midX - 10}, ${midY - 10})`}
          onClick={(e) => {
            e.stopPropagation();
            data?.onDelete?.(id);
          }}
          style={{ cursor: 'pointer' }}
        >
          <circle cx={10} cy={10} r={10} fill="#ef4444" stroke="#101010" strokeWidth={2} />
          <text
            x={10}
            y={15}
            textAnchor="middle"
            fontSize={14}
            fill="white"
            fontWeight="bold"
            fontFamily="monospace"
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            ×
          </text>
        </g>
      )}
    </>
  );
}

const edgeTypes = { dataFlow: DataFlowEdge };

// ─── Node Templates ───────────────────────────────────────────────────────────
type NodeTemplate = {
  type: string;
  label: string;
  color: string;
  description: string;
};

const NODE_TEMPLATES: NodeTemplate[] = [
  { type: 'agentNode', label: '成员节点', color: 'bg-pixel-green', description: '普通工作成员' },
  { type: 'conditionNode', label: '条件判断', color: 'bg-pixel-purple', description: '右=是，下=否' },
  { type: 'endNode', label: '终点', color: 'bg-pixel-black', description: '流程终点' },
];

const AGENT_KIND_OPTIONS: Array<{ value: WorkflowAgentKind; label: string }> = [
  { value: 'worker', label: '执行者' },
  { value: 'router', label: '路由器' },
  { value: 'aggregator', label: '汇总者' },
  { value: 'judge', label: '评审者' },
  { value: 'orchestrator', label: '编排者' },
  { value: 'evaluator', label: '评估者' },
  { value: 'optimizer', label: '优化者' },
];

interface NodeCanvasProps {
  onAgentsChange: (agents: ArchitectureAgent[]) => void;
  /** Report raw nodes/edges changes back to parent (for saving to architecture) */
  onGraphChange?: (nodes: Node[], edges: Edge[]) => void;
  /** If provided, use these nodes/edges as the initial canvas state instead of the blank default */
  initialTemplate?: ArchTemplate | null;
  workflowTemplates?: ArchTemplate[];
  activeTemplateId?: string;
  activeTemplateName?: string;
  onSelectTemplate?: (template: ArchTemplate) => void;
  initialViewportMode?: 'overview' | 'fit';
}

function getConcreteAgentId(lobster?: Lobster | null): string | undefined {
  const id = lobster?.id?.trim();
  if (!id || /^(lobster|agent|arch)-/i.test(id)) return undefined;
  return id;
}

function buildAgentsFromNodes(nodes: Node[]): ArchitectureAgent[] {
  return nodes
    .filter((n) => n.type === 'agentNode')
    .map((n) => {
      const d = n.data as AgentNodeData;
      return {
        id: n.id,
        nodeId: n.id,
        name: d.label || `成员`,
        role: d.role || '成员',
        kind: d.kind,
        status: 'standby' as const,
        isManager: d.isManager,
        inputs: d.inputs ?? [],
        outputs: d.outputs ?? [],
        linkedLobsterId: getConcreteAgentId(d.linkedLobster),
        openclawPath: d.linkedLobster?.openclawPath,
        openclawPort: d.linkedLobster?.openclawPort,
      };
    });
}

// Default canvas: start/end only. Users choose a mode or add agents explicitly.
const START_NODE_ID = 'node-start';
const END_NODE_ID = 'node-end';

const defaultNodes: Node[] = [
  {
    id: START_NODE_ID,
    type: 'startNode',
    position: { x: 80, y: 240 },
    data: { label: '用户输入' },
  },
  {
    id: END_NODE_ID,
    type: 'endNode',
    position: { x: 420, y: 240 },
    data: { label: '最终输出' },
  },
];

const defaultEdges: Edge[] = [];

export default function NodeCanvas({
  onAgentsChange,
  onGraphChange,
  initialTemplate,
  workflowTemplates = [],
  activeTemplateId,
  activeTemplateName,
  onSelectTemplate,
  initialViewportMode = 'overview',
}: NodeCanvasProps) {
  // Convert template nodes (ArchitectureNode[]) to ReactFlow Node[] with position
  const templateNodes: Node[] = initialTemplate?.nodes?.map((n) => ({
    id: n.id,
    type: n.type,
    position: n.position ?? { x: 0, y: 0 },
    data: n.data,
    draggable: true,
  })) ?? [];

  const templateEdges: Edge[] = (initialTemplate?.edges ?? []).map((e) => {
    const ext = e as { sourceHandle?: string | null; targetHandle?: string | null };
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: ext.sourceHandle ?? undefined,
      targetHandle: ext.targetHandle ?? undefined,
      type: 'dataFlow',
      markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
      label: (e as { label?: string }).label,
    };
  });

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(
    templateNodes.length > 0 ? templateNodes : defaultNodes
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    templateEdges.length > 0 ? templateEdges : defaultEdges
  );

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [showLobsterPicker, setShowLobsterPicker] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showTemplateMenu, setShowTemplateMenu] = useState(false);
  const [showMobileNodePanel, setShowMobileNodePanel] = useState(false);

  const { lobsters } = useStore();

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;
  const selectedNodeData = selectedNode?.data as AgentNodeData | ConditionNodeData | undefined;

  const applyInitialViewport = useCallback((instance: ReactFlowInstance) => {
    window.requestAnimationFrame(() => {
      void (async () => {
        await instance.fitView({
          padding: initialViewportMode === 'fit' ? 0.18 : 0.42,
          duration: 0,
        });
        if (initialViewportMode === 'overview') {
          await instance.zoomOut({ duration: 0 });
          await instance.zoomOut({ duration: 0 });
        }
      })();
    });
  }, [initialViewportMode]);

  // Sync agents to parent when template is loaded
  useEffect(() => {
    if (templateNodes.length > 0) {
      syncAgents(templateNodes);
    }
  }, [templateNodes.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Report graph changes to parent (so it can save nodes/edges)
  useEffect(() => {
    onGraphChange?.(nodes, edges);
  }, [nodes, edges]); // eslint-disable-line react-hooks/exhaustive-deps

  const syncAgents = useCallback(
    (currentNodes: Node[]) => {
      onAgentsChange(buildAgentsFromNodes(currentNodes));
    },
    [onAgentsChange]
  );

  useEffect(() => {
    syncAgents(nodes);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Stable delete-edge handler
  const handleEdgeDelete = useCallback(
    (edgeId: string) => {
      setEdges((eds) => eds.filter((e) => e.id !== edgeId));
      setSelectedEdgeId(null);
    },
    [setEdges]
  );

  // Inject onDelete into edge data（sourceHandle 在边上由 React Flow / 保存逻辑维护）
  const edgesWithCallbacks = useMemo<Edge[]>(
    () =>
      edges.map((edge): Edge => ({
        ...edge,
        data: { ...edge.data, onDelete: handleEdgeDelete },
      })),
    [edges, handleEdgeDelete]
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      const validationError = getConnectionValidationError(nodes, edges, connection);
      if (validationError) return;

      const edgeId = `edge-${connection.source}-${connection.sourceHandle ?? 'out'}-${connection.target}-${connection.targetHandle ?? 'in'}`;
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            id: edgeId,
            type: 'dataFlow',
            markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
            data: { sourceHandle: connection.sourceHandle ?? undefined },
          },
          eds
        )
      );
    },
    [nodes, edges, setEdges]
  );

  const isValidConnection = useCallback(
    (connection: Connection | Edge) => !getConnectionValidationError(nodes, edges, connection),
    [nodes, edges]
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      setSelectedNodeId(node.id);
      setSelectedEdgeId(null);
      if (window.matchMedia('(max-width: 767px)').matches) {
        setShowMobileNodePanel(true);
      }
    },
    []
  );

  const onEdgeClick = useCallback(
    (_: React.MouseEvent, edge: Edge) => {
      setSelectedEdgeId(edge.id);
      setSelectedNodeId(null);
    },
    []
  );

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setShowAddMenu(false);
    setShowTemplateMenu(false);
    setShowMobileNodePanel(false);
  }, []);

  // Update any field on a node
  const updateNodeData = useCallback(
    (nodeId: string, field: string, value: unknown) => {
      setNodes((nds) => {
        const updated = nds.map((node) =>
          node.id === nodeId
            ? { ...node, data: { ...node.data, [field]: value } }
            : node
        );
        syncAgents(updated);
        return updated;
      });
    },
    [setNodes, syncAgents]
  );

  // Add a new node from template
  const addNodeFromTemplate = useCallback(
    (template: NodeTemplate) => {
      const id = `${template.type}-${Date.now()}`;
      let newData: Record<string, unknown> = {};

      if (template.type === 'agentNode') {
        newData = {
          label: `成员 ${nodes.filter((n) => n.type === 'agentNode').length + 1}`,
          role: '成员',
          kind: 'worker',
          isManager: false,
          inputs: ['输入'],
          outputs: ['输出'],
          agentId: id,
          isDeletable: true,
          linkedLobster: null,
        };
      } else if (template.type === 'conditionNode') {
        newData = { label: '条件' };
      } else if (template.type === 'startNode') {
        newData = { label: '用户输入' };
      } else if (template.type === 'endNode') {
        newData = { label: '输出' };
      }

      const newNode: Node = {
        id,
        type: template.type,
        position: {
          x: Math.random() * 300 + 300,
          y: Math.random() * 250 + 120,
        },
        data: newData,
      };

      setNodes((nds) => {
        const updated = [...nds, newNode];
        if (template.type === 'agentNode') syncAgents(updated);
        return updated;
      });
      setSelectedNodeId(id);
      setShowAddMenu(false);
      setShowTemplateMenu(false);
      if (window.matchMedia('(max-width: 767px)').matches) {
        setShowMobileNodePanel(true);
      }
    },
    [nodes, setNodes, syncAgents]
  );

  const handleSelectTemplate = useCallback(
    (template: ArchTemplate) => {
      onSelectTemplate?.(template);
      setShowTemplateMenu(false);
      setShowAddMenu(false);
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
    },
    [onSelectTemplate]
  );

  const handleDeleteNode = useCallback(() => {
    if (!selectedNodeId) return;
    const node = nodes.find((n) => n.id === selectedNodeId);
    const nodeData = node?.data as AgentNodeData | undefined;

    // Manager node cannot be deleted
    if (!nodeData?.isDeletable) return;

    setNodes((nds) => {
      const updated = nds.filter((n) => n.id !== selectedNodeId);
      syncAgents(updated);
      return updated;
    });
    setEdges((eds) => eds.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId));
    setSelectedNodeId(null);
  }, [selectedNodeId, nodes, setNodes, setEdges, syncAgents]);

  const handleDeleteSelectedEdge = useCallback(() => {
    if (!selectedEdgeId) return;
    setEdges((eds) => eds.filter((e) => e.id !== selectedEdgeId));
    setSelectedEdgeId(null);
  }, [selectedEdgeId, setEdges]);

  const handleLinkLobster = useCallback(
    (nodeId: string, lobster: Lobster | null) => {
      updateNodeData(nodeId, 'linkedLobster', lobster);
      if (lobster) {
        updateNodeData(nodeId, 'openclawPath', lobster.openclawPath);
        updateNodeData(nodeId, 'openclawPort', lobster.openclawPort);
      }
      setShowLobsterPicker(false);
    },
    [updateNodeData]
  );

  return (
    <div className="relative h-full md:flex md:gap-4">
      {/* Canvas */}
      <div
        className="relative h-full min-h-[420px] flex-1 bg-pixel-white border-4 border-pixel-black"
        style={{ boxShadow: '6px 6px 0px 0px #101010' }}
      >
        <ReactFlow
          nodes={nodes}
          edges={edgesWithCallbacks}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          isValidConnection={isValidConnection}
          onNodeClick={onNodeClick}
          onEdgeClick={onEdgeClick}
          onPaneClick={onPaneClick}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onInit={applyInitialViewport}
          fitViewOptions={{ padding: 0.42, maxZoom: 0.68 }}
          defaultViewport={{ x: 24, y: 48, zoom: 0.3 }}
          minZoom={0.18}
          className="font-pixel"
        >
          <Background color="#101010" gap={20} />
          <Controls className="!bg-pixel-white !border-pixel-black !shadow-none" />
          <MiniMap
            className="hidden !bg-pixel-white !border-pixel-black md:block"
            style={{ width: 120, height: 86 }}
            nodeColor={(node) => {
              if (node.type === 'conditionNode') return '#a855f7';
              if (node.type === 'startNode') return '#22c55e';
              if (node.type === 'endNode') return '#ef4444';
              const d = node.data as AgentNodeData;
              return d.isManager ? '#3b82f6' : '#22c55e';
            }}
            maskColor="rgba(0,0,0,0.3)"
          />
        </ReactFlow>

        {/* Toolbar */}
        <div className="absolute left-2 top-2 z-10 flex max-w-[calc(100%-1rem)] items-start gap-2 md:left-3 md:top-3">
          <div className="flex flex-col gap-2">
          {/* Add node menu */}
          <div className="relative">
            <PixelButton
              onClick={() => {
                setShowAddMenu((open) => !open);
                setShowTemplateMenu(false);
              }}
              variant="secondary"
              size="sm"
            >
              + 添加节点
            </PixelButton>
            {showAddMenu && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute top-full left-0 mt-1 bg-pixel-white border-3 border-pixel-black w-48 z-30"
                style={{ boxShadow: '4px 4px 0px 0px #101010' }}
              >
                {NODE_TEMPLATES.map((t) => (
                  <button
                    key={t.type}
                    onClick={() => addNodeFromTemplate(t)}
                    className="w-full px-3 py-2 font-pixel text-sm text-pixel-black text-left hover:bg-pixel-gray border-b border-pixel-black/10 last:border-b-0 transition-colors"
                  >
                    <span className={`inline-block w-2 h-2 rounded-full mr-2 ${t.color}`} />
                    {t.label}
                    <div className="text-xs text-pixel-black/50">{t.description}</div>
                  </button>
                ))}
              </motion.div>
            )}
          </div>

            {workflowTemplates.length > 0 && onSelectTemplate && (
              <div className="relative">
                <PixelButton
                  onClick={() => {
                    setShowTemplateMenu((open) => !open);
                    setShowAddMenu(false);
                  }}
                  variant="secondary"
                  size="sm"
                >
                  使用参考模板
                </PixelButton>
                {showTemplateMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="absolute top-full left-0 mt-1 w-[560px] max-w-[calc(100vw-2rem)] bg-pixel-white border-3 border-pixel-black p-3 z-30"
                    style={{ boxShadow: '4px 4px 0px 0px #101010' }}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <div className="font-pixel text-sm text-pixel-black">协作模式参考模板</div>
                      <div className="px-2 py-1 border-2 border-pixel-black bg-pixel-gray/20 font-pixel text-[10px] text-pixel-black">
                        {activeTemplateName || '导入已有团队'}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {workflowTemplates.map((template) => {
                        const selected = activeTemplateId === template.id;
                        return (
                          <button
                            key={template.id}
                            type="button"
                            onClick={() => handleSelectTemplate(template)}
                            className={`min-h-[86px] border-3 border-pixel-black p-3 text-left transition-colors ${
                              selected
                                ? 'bg-pixel-blue text-pixel-white'
                                : 'bg-pixel-white text-pixel-black hover:bg-pixel-yellow/30'
                            }`}
                            style={{ boxShadow: selected ? 'none' : '3px 3px 0px 0px #101010' }}
                          >
                            <div className="font-pixel text-xs leading-tight">{template.nameCn}</div>
                            <div className={`font-pixel text-[10px] mt-2 leading-snug ${selected ? 'text-pixel-white/75' : 'text-pixel-black/50'}`}>
                              {template.descriptionCn}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </div>
            )}
          </div>

          {/* Link lobster shortcut for selected agent node */}
          {selectedNode?.type === 'agentNode' && (
            <PixelButton
              onClick={() => setShowLobsterPicker(true)}
              variant="secondary"
              size="sm"
              className="hidden md:inline-block"
            >
              🟢 关联Agent
            </PixelButton>
          )}
        </div>

        <button
          type="button"
          onClick={() => setShowMobileNodePanel(true)}
          className="absolute right-2 top-2 z-10 border-3 border-pixel-black bg-pixel-yellow px-3 py-2 font-pixel text-xs text-pixel-black md:hidden"
          style={{ boxShadow: '3px 3px 0px 0px #101010' }}
        >
          {selectedNode ? '编辑节点' : '节点列表'}
        </button>

        {/* Edge delete banner */}
        {selectedEdgeId && (
          <div className="absolute right-2 top-14 z-10 md:right-3 md:top-3">
            <div
              className="bg-pixel-yellow border-3 border-pixel-black px-3 py-2 font-pixel text-sm text-pixel-black flex items-center gap-2"
              style={{ boxShadow: '3px 3px 0px 0px #101010' }}
            >
              <span>已选中连接</span>
              <button
                onClick={handleDeleteSelectedEdge}
                className="bg-pixel-red text-pixel-white border-2 border-pixel-black px-2 py-0.5 font-pixel text-xs hover:bg-pixel-yellow hover:text-pixel-black transition-colors"
              >
                删除连接
              </button>
              <button onClick={() => setSelectedEdgeId(null)} className="ml-1 text-pixel-black/50 hover:text-pixel-black text-lg leading-none">×</button>
            </div>
          </div>
        )}
      </div>

      {/* Side panel */}
      <div
        className={`fixed inset-0 z-[80] items-end bg-pixel-black/70 p-3 md:static md:z-auto md:flex md:w-72 md:flex-col md:items-stretch md:gap-4 md:bg-transparent md:p-0 ${
          showMobileNodePanel ? 'flex' : 'hidden md:flex'
        }`}
        onClick={() => setShowMobileNodePanel(false)}
      >
        <div
          className="max-h-[82dvh] w-full flex-none overflow-y-auto bg-pixel-white border-4 border-pixel-black p-4 md:max-h-none md:flex-1"
          style={{ boxShadow: '6px 6px 0px 0px #101010' }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="mb-3 flex items-center justify-between gap-3 md:hidden">
            <p className="font-pixel text-sm font-bold text-pixel-black">
              {selectedNode ? '编辑节点' : '节点列表'}
            </p>
            <button
              type="button"
              onClick={() => setShowMobileNodePanel(false)}
              className="border-2 border-pixel-black bg-pixel-white px-2 py-1 font-pixel text-sm leading-none text-pixel-black"
            >
              ×
            </button>
          </div>
          <h3 className="mb-3 hidden font-pixel text-base text-pixel-black md:block">
            {selectedNode ? '编辑节点' : '节点列表'}
          </h3>

          {selectedNode ? (
            <div className="space-y-3">
              {/* Condition node editor */}
              {selectedNode.type === 'conditionNode' && (
                <>
                  <div>
                    <label className="font-pixel text-xs text-pixel-black/60 block mb-1">条件名称</label>
                    <input
                      type="text"
                      value={(selectedNodeData as ConditionNodeData).label || ''}
                      onChange={(e) => updateNodeData(selectedNodeId!, 'label', e.target.value)}
                      placeholder="如: 审核通过"
                      className="w-full bg-pixel-white border-3 border-pixel-black font-pixel text-sm px-3 py-2 focus:outline-none focus:border-pixel-blue"
                    />
                  </div>
                  <div>
                    <label className="font-pixel text-xs text-pixel-black/60 block mb-1">条件内容</label>
                    <textarea
                      value={(selectedNodeData as ConditionNodeData).description || ''}
                      onChange={(e) => updateNodeData(selectedNodeId!, 'description', e.target.value)}
                      placeholder="用文本描述此条件的判断逻辑，如: 内容合规检查"
                      rows={3}
                      className="w-full bg-pixel-white border-3 border-pixel-black font-pixel text-sm px-3 py-2 focus:outline-none focus:border-pixel-blue resize-none"
                    />
                  </div>
                  <div className="bg-pixel-purple/20 border-3 border-pixel-purple p-2 font-pixel text-xs text-pixel-purple">
                    ⚡ 右侧=是(绿) · 下侧=否(红) · 左侧接收输入
                  </div>
                </>
              )}

              {/* Agent node editor */}
              {selectedNode.type === 'agentNode' && (() => {
                const data = selectedNodeData as AgentNodeData;
                return (
                  <>
                    {/* Name */}
                    <div>
                      <label className="font-pixel text-xs text-pixel-black/60 block mb-1">名称</label>
                      <input
                        type="text"
                        value={data.label}
                        onChange={(e) => updateNodeData(selectedNodeId!, 'label', e.target.value)}
                        className="w-full bg-pixel-white border-3 border-pixel-black font-pixel text-sm px-3 py-2 focus:outline-none focus:border-pixel-blue"
                      />
                    </div>

                    {/* Role */}
                    <div>
                      <label className="font-pixel text-xs text-pixel-black/60 block mb-1">角色/职责</label>
                      <input
                        type="text"
                        value={data.role}
                        onChange={(e) => updateNodeData(selectedNodeId!, 'role', e.target.value)}
                        className="w-full bg-pixel-white border-3 border-pixel-black font-pixel text-sm px-3 py-2 focus:outline-none focus:border-pixel-blue"
                      />
                    </div>

                    <div>
                      <label className="font-pixel text-xs text-pixel-black/60 block mb-1">协作身份</label>
                      <select
                        value={data.kind ?? 'worker'}
                        onChange={(e) => updateNodeData(selectedNodeId!, 'kind', e.target.value as WorkflowAgentKind)}
                        className="w-full bg-pixel-white border-3 border-pixel-black font-pixel text-sm px-3 py-2 focus:outline-none focus:border-pixel-blue"
                      >
                        {AGENT_KIND_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Inputs */}
                    <div>
                      <label className="font-pixel text-xs text-pixel-black/60 block mb-1">输入端口（逗号分隔）</label>
                      <input
                        type="text"
                        value={data.inputs?.join(', ') || ''}
                        onChange={(e) =>
                          updateNodeData(
                            selectedNodeId!,
                            'inputs',
                            e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
                          )
                        }
                        placeholder="如: 任务, 素材"
                        className="w-full bg-pixel-white border-3 border-pixel-black font-pixel text-sm px-3 py-2 focus:outline-none focus:border-pixel-blue"
                      />
                    </div>

                    {/* Outputs */}
                    <div>
                      <label className="font-pixel text-xs text-pixel-black/60 block mb-1">输出端口（逗号分隔）</label>
                      <input
                        type="text"
                        value={data.outputs?.join(', ') || ''}
                        onChange={(e) =>
                          updateNodeData(
                            selectedNodeId!,
                            'outputs',
                            e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
                          )
                        }
                        placeholder="如: 结果, 报告"
                        className="w-full bg-pixel-white border-3 border-pixel-black font-pixel text-sm px-3 py-2 focus:outline-none focus:border-pixel-blue"
                      />
                    </div>

                    {/* Manager toggle — only for non-manager deletable nodes */}
                    {data.isDeletable && (
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="isManager"
                          checked={data.isManager}
                          onChange={(e) => updateNodeData(selectedNodeId!, 'isManager', e.target.checked)}
                          className="w-5 h-5 border-3 border-pixel-black accent-pixel-blue"
                        />
                        <label htmlFor="isManager" className="font-pixel text-sm text-pixel-black cursor-pointer">
                          设置为管理员
                        </label>
                      </div>
                    )}

                    {/* Link lobster */}
                    <div>
                      <label className="font-pixel text-xs text-pixel-black/60 block mb-1">关联Agent</label>
                      <button
                        onClick={() => setShowLobsterPicker(true)}
                        className={`
                          w-full p-2 border-3 border-pixel-black font-pixel text-sm text-left
                          ${data.linkedLobster ? 'bg-pixel-blue text-pixel-white' : 'bg-pixel-gray text-pixel-black'}
                        `}
                      >
                        {data.linkedLobster ? `🟢 ${data.linkedLobster.name}` : '点击选择Agent...'}
                      </button>
                      {data.linkedLobster && (
                        <div className="mt-1 text-xs text-pixel-black/50 font-pixel">
                          {data.linkedLobster.role} · 🟢 已连接
                        </div>
                      )}
                    </div>

                    {/* Delete — only deletable */}
                    {data.isDeletable !== false && (
                      <motion.button
                        whileTap={{ scale: 0.95 }}
                        onClick={handleDeleteNode}
                        className="w-full p-2 bg-pixel-red text-pixel-white border-3 border-pixel-black font-pixel text-sm hover:bg-pixel-yellow hover:text-pixel-black transition-colors"
                      >
                        删除此成员
                      </motion.button>
                    )}
                    {!data.isDeletable && (
                      <div className="text-center text-xs text-pixel-black/30 font-pixel py-1">
                        管理员节点不可删除
                      </div>
                    )}
                  </>
                );
              })()}

              {/* Start node */}
              {selectedNode.type === 'startNode' && (
                <div>
                  <label className="font-pixel text-xs text-pixel-black/60 block mb-1">显示名称</label>
                  <input
                    type="text"
                    value={(selectedNode.data as { label?: string }).label || ''}
                    onChange={(e) => updateNodeData(selectedNodeId!, 'label', e.target.value)}
                    className="w-full bg-pixel-white border-3 border-pixel-black font-pixel text-sm px-3 py-2 focus:outline-none focus:border-pixel-blue"
                  />
                  <div className="mt-2 bg-pixel-green/20 border-3 border-pixel-green p-2 font-pixel text-xs text-pixel-green">
                    ▶ 起点：代表用户输入的入口点，拖动右侧边缘连接到成员节点
                  </div>
                </div>
              )}

              {/* End node */}
              {selectedNode.type === 'endNode' && (
                <div>
                  <label className="font-pixel text-xs text-pixel-black/60 block mb-1">显示名称</label>
                  <input
                    type="text"
                    value={(selectedNode.data as { label?: string }).label || ''}
                    onChange={(e) => updateNodeData(selectedNodeId!, 'label', e.target.value)}
                    className="w-full bg-pixel-white border-3 border-pixel-black font-pixel text-sm px-3 py-2 focus:outline-none focus:border-pixel-blue"
                  />
                  <div className="mt-2 bg-pixel-red/20 border-3 border-pixel-red p-2 font-pixel text-xs text-pixel-red">
                    ■ 终点：流程结束节点，拖动成员节点边缘连接至此
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-pixel-black/50 font-pixel text-sm">
              <div className="text-4xl mb-2 opacity-30">👈</div>
              <p>点击节点进行编辑</p>
              <div className="mt-3 space-y-1 text-left">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 bg-pixel-blue rounded" />
                  <span className="font-pixel text-xs">管理员节点（不可删除）</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 bg-pixel-green rounded" />
                  <span className="font-pixel text-xs">普通成员节点</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 bg-pixel-purple rounded" />
                  <span className="font-pixel text-xs">条件判断节点</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Lobster picker modal */}
        {showLobsterPicker && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-pixel-black/70"
            onClick={() => setShowLobsterPicker(false)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-pixel-white border-4 border-pixel-black p-6 max-w-md w-full mx-4"
              style={{ boxShadow: '8px 8px 0px 0px #101010' }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="font-pixel text-lg text-pixel-black mb-4 text-center">选择关联Agent</h3>
              {lobsters.length === 0 ? (
                <div className="text-center py-6">
                  <div className="text-4xl mb-3 opacity-40">🦞</div>
                  <p className="font-pixel text-pixel-black/60 text-sm mb-2">Agent窝里还没有Agent</p>
                  <p className="font-pixel text-pixel-black/40 text-xs">请先在「我的agent窝」领养或添加Agent后再来关联</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {lobsters.map((lobster) => {
                    const isSelected = (selectedNodeData as AgentNodeData | undefined)?.linkedLobster?.id === lobster.id;
                  return (
                    <motion.button
                      key={lobster.id}
                      onClick={() => handleLinkLobster(selectedNodeId!, lobster)}
                      className={`
                        w-full p-3 border-3 border-pixel-black text-left bg-pixel-white transition-all
                        ${isSelected ? 'ring-2 ring-pixel-blue' : 'hover:shadow-lg'}
                      `}
                      style={{ boxShadow: isSelected ? '4px 4px 0px 0px #3b82f6' : '3px 3px 0px 0px #101010' }}
                    >
                      <div className="flex items-center gap-3">
                        <LobsterSprite lobster={lobster} size="sm" showStatus={false} />
                        <div className="flex-1 min-w-0">
                          <div className="font-pixel text-sm text-pixel-black font-bold">{lobster.name}</div>
                          <div className="font-pixel text-xs text-pixel-black/60">{lobster.role}</div>
                          {lobster.openclawPath && (
                            <div className="font-pixel text-xs text-pixel-black/40 mt-0.5 truncate max-w-[200px]">
                              {lobster.openclawPath.split('\\').pop()}
                            </div>
                          )}
                        </div>
                        <div className="text-right">
                          <span className="font-pixel text-xs text-pixel-green">🟢 已连接</span>
                          {isSelected && <div className="text-xs text-pixel-blue font-pixel mt-1">✓ 已选中</div>}
                        </div>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
              )}
              <button
                onClick={() => setShowLobsterPicker(false)}
                className="w-full mt-4 p-3 bg-pixel-black text-pixel-white border-4 border-pixel-black font-pixel text-sm hover:bg-pixel-gray transition-colors"
              >
                取消
              </button>
            </motion.div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
