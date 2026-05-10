import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  type Node,
} from 'reactflow';
import 'reactflow/dist/style.css';
import {
  Activity,
  AlertTriangle,
  Camera,
  Crosshair,
  Eye,
  FileSearch,
  FileText,
  Lightbulb,
  Loader2,
  Microscope,
  Monitor,
  Navigation,
  Plus,
  RotateCcw,
  Save,
  StickyNote,
  User,
  UserX,
  Zap,
} from 'lucide-react';

import { getReport } from '@/lib/api';
import { mockReport } from '@/lib/mock-data';
import type { CaseReport, InvestigationNodeData, NodePaletteItem, TimelineEvent, RiskFlag, InvestigativeHypothesis } from '@/lib/types';
import { NODE_PALETTE_ITEMS } from '@/lib/types';
import { cn } from '@/lib/utils';
import { generateGraphLayout } from '@/lib/graphUtils';
import {
  CustomTimelineNode,
  CustomRiskNode,
  CustomHypothesisNode,
  CustomStoryNode,
  CustomStoryBeatNode,
  CustomPersonNode,
  CustomLocationNode,
  CustomEvidenceNode,
  CustomNoteNode,
  CustomHypothesisNode2,
  CustomContradictionNode,
} from './graph/CustomNode';
import { DetailsPanel } from './graph/DetailsPanel';
import { generateUserNodeId, useInvestigationStore } from '@/store/useInvestigationStore';

const nodeTypes = {
  customTimeline: CustomTimelineNode,
  customRisk: CustomRiskNode,
  customHypothesis: CustomHypothesisNode,
  customStory: CustomStoryNode,
  customStoryBeat: CustomStoryBeatNode,
  customPerson: CustomPersonNode,
  customLocation: CustomLocationNode,
  customEvidence: CustomEvidenceNode,
  customNote: CustomNoteNode,
  customUserHypothesis: CustomHypothesisNode2,
  customContradiction: CustomContradictionNode,
};

const paletteIcons = {
  Activity,
  AlertTriangle,
  Camera,
  Crosshair,
  Eye,
  FileSearch,
  FileText,
  Lightbulb,
  Microscope,
  Monitor,
  Navigation,
  StickyNote,
  User,
  UserX,
  Zap,
};

interface Props {
  caseId: string;
}

const fallbackTimeline: TimelineEvent[] = [
  { timestamp: "2023-10-01T19:45:00Z", source: "CCTV", event: "Victim's vehicle enters downtown parking structure. Driver appears alone.", severity: "low" },
  { timestamp: "2023-10-01T20:12:00Z", source: "Mobile", event: "Victim's phone connects to 'Cafe-WiFi' network.", severity: "low" },
  { timestamp: "2023-10-01T20:44:00Z", source: "Mobile", event: "Unusual encrypted VoIP call received (2m 14s duration). Caller ID obfuscated.", severity: "medium" },
  { timestamp: "2023-10-01T21:03:00Z", source: "GPS", event: "Victim's vehicle rapidly accelerates out of parking structure, breaking speed limits.", severity: "medium" },
  { timestamp: "2023-10-01T21:18:00Z", source: "CCTV", event: "Unidentified dark SUV tailing victim's vehicle on Highway 9.", severity: "high" },
  { timestamp: "2023-10-01T21:35:00Z", source: "GPS", event: "Vehicle GPS tracker disabled manually. Signal lost.", severity: "high" },
  { timestamp: "2023-10-01T22:05:00Z", source: "Mobile", event: "Phone pings cell tower near abandoned industrial park. Device turned off.", severity: "high" },
];

const fallbackFlags: RiskFlag[] = [
  { name: "Premeditated Sabotage", description: "The GPS tracker was disabled exactly 15 minutes before the CCTV blackout, suggesting coordinated tracking.", score: 92 },
  { name: "Burner Phone Proximity", description: "A prepaid burner phone pinged the same cell tower as the victim immediately after their device turned off.", score: 88 },
];

const fallbackHypotheses: InvestigativeHypothesis[] = [
  { title: "Coordinated Ambush", reasoning: "The encrypted VoIP call likely served as a trigger. The dark SUV followed the victim to a pre-planned blind spot where the GPS was jammed.", confidence: "High" },
  { title: "Secondary Crime Scene", reasoning: "The victim's phone pinged an industrial park after the GPS was lost, suggesting the vehicle was moved to a secondary location to dispose of evidence.", confidence: "Medium" }
];

const fallbackStoryBeats: NonNullable<CaseReport['investigative_intelligence']>['story_beats'] = [
  { title: "Victim arrived at target location", description: "Victim arrived at the target location following a brief, encrypted VoIP call.", phase: "normal", timestamp_guess: "9:12 PM", connected_evidence: "Mobile, CCTV" },
  { title: "Dark SUV intercepted vehicle", description: "A dark SUV immediately began tailing the victim, boxing them in near the highway.", phase: "suspicious", timestamp_guess: "9:35 PM", connected_evidence: "CCTV, GPS" },
  { title: "Violent assault likely occurred", description: "GPS and phone trackers were systematically disabled, indicating pre-planned sabotage and abduction.", phase: "critical", timestamp_guess: "10:05 PM", connected_evidence: "Metadata, Anomaly Engine" }
];

function getNodeType(item: NodePaletteItem) {
  if (item.type === 'people') return 'customPerson';
  if (item.type === 'location') return 'customLocation';
  if (item.type === 'evidence') return 'customEvidence';
  if (item.type === 'note') return 'customNote';
  if (item.type === 'hypothesis') return 'customUserHypothesis';
  return 'customContradiction';
}

function buildNodeData(item: NodePaletteItem): InvestigationNodeData {
  const base: InvestigationNodeData = {
    label: item.label,
    description: '',
    category: item.type,
    source: 'user',
  };

  if (item.type === 'people') return { ...base, personRole: item.label, personName: item.label };
  if (item.type === 'location') return { ...base, locationType: item.label, locationName: item.label };
  if (item.type === 'evidence') return { ...base, evidenceType: item.label };
  if (item.type === 'note') return { ...base, noteContent: '' };
  return base;
}

export function InvestigationGraph({ caseId }: Props) {
  const [report, setReport] = useState<CaseReport | null>(null);
  const [loading, setLoading] = useState(true);

  const {
    nodes,
    edges,
    selectedNodeId,
    initFromReport,
    onNodesChange,
    onEdgesChange,
    onConnect,
    addNode,
    updateNodeData,
    removeNode,
    reset,
    setSelectedNodeId,
    persist,
  } = useInvestigationStore();

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId),
    [nodes, selectedNodeId]
  );

  useEffect(() => {
    async function loadData() {
      if (!caseId) return;
      setLoading(true);
      try {
        const data = await getReport(caseId);
        setReport(data);
      } catch (err) {
        console.error("Failed to load report, using fallback data", err);
        setReport({
          ...mockReport,
          case_id: caseId,
          risk_score: 88,
          timeline: fallbackTimeline,
          flags: fallbackFlags,
          investigative_intelligence: {
            crime_story: "A high-stakes ambush appears to have unfolded through synchronized tracker sabotage and vehicle interception.",
            story_beats: fallbackStoryBeats,
            case_breakthrough: "Demo Breakthrough",
            investigative_hypotheses: fallbackHypotheses,
            timeline_interpretation: [],
            contradictions_and_gaps: [],
            priority_leads: [],
            action_plan: [],
            likely_scene_assessment: "",
            limitations: []
          }
        });
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [caseId]);

  useEffect(() => {
    if (!report) return;

    const timeline = report.structured_report?.timeline_analysis?.events || report.timeline || [];
    const flags = report.structured_report?.risk_assessment?.flags || report.flags || [];
    const reportIntelligence = report.structured_report?.investigative_intelligence || report.investigative_intelligence;
    const intelligence = reportIntelligence
      ? {
          ...reportIntelligence,
          story_beats: reportIntelligence.story_beats?.length ? reportIntelligence.story_beats : fallbackStoryBeats,
        }
      : null;

    if (timeline.length === 0 && flags.length === 0 && !intelligence) {
      initFromReport([], [], caseId);
      return;
    }

    const { nodes: layoutedNodes, edges: layoutedEdges } = generateGraphLayout(timeline, flags, intelligence);
    initFromReport(layoutedNodes, layoutedEdges, caseId);
    setSelectedNodeId(null);
  }, [report, caseId, initFromReport, setSelectedNodeId]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id);
  }, [setSelectedNodeId]);

  const addPaletteNode = useCallback((item: NodePaletteItem) => {
    const offset = nodes.filter((node) => (node.data as InvestigationNodeData)?.source === 'user').length;
    const node: Node<InvestigationNodeData> = {
      id: generateUserNodeId(item.type),
      type: getNodeType(item),
      position: { x: 120 + (offset % 4) * 44, y: 120 + (offset % 6) * 36 },
      data: buildNodeData(item),
    };

    addNode(node);
    setSelectedNodeId(node.id);
  }, [addNode, nodes, setSelectedNodeId]);

  const groupedPalette = useMemo(() => {
    return NODE_PALETTE_ITEMS.reduce<Record<string, NodePaletteItem[]>>((groups, item) => {
      groups[item.category] = [...(groups[item.category] || []), item];
      return groups;
    }, {});
  }, []);

  if (loading) {
    return (
      <div className="flex h-[720px] min-h-[72vh] w-full items-center justify-center rounded-xl border border-slate-800 bg-[#0d1117]">
        <div className="flex flex-col items-center gap-4 text-cyan-400">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-sm font-semibold uppercase tracking-widest">Generating Forensic Layout...</p>
        </div>
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="flex h-[720px] min-h-[72vh] w-full flex-col items-center justify-center rounded-xl border border-slate-800 bg-[#0d1117]">
        <h3 className="text-xl font-bold text-slate-300">Run AI analysis first to generate the investigation graph.</h3>
        <p className="mt-2 text-slate-500">No timeline, story, or risk nodes were found in the current report.</p>
      </div>
    );
  }

  return (
    <div className="relative h-[82vh] min-h-[820px] w-full overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
      <div className="absolute left-4 top-4 z-20 w-[260px] rounded-xl border border-slate-700/80 bg-slate-950/90 p-3 shadow-2xl backdrop-blur">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-300">Investigator Board</p>
            <p className="mt-1 text-[11px] text-slate-500">{caseId}</p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={persist}
              className="grid h-8 w-8 place-items-center rounded-lg border border-slate-700 text-slate-300 transition hover:border-cyan-400/50 hover:text-cyan-200"
              title="Save board"
            >
              <Save className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                reset();
                if (report) {
                  const timeline = report.structured_report?.timeline_analysis?.events || report.timeline || [];
                  const flags = report.structured_report?.risk_assessment?.flags || report.flags || [];
                  const intelligence = report.structured_report?.investigative_intelligence || report.investigative_intelligence || null;
                  const layout = generateGraphLayout(timeline, flags, intelligence);
                  initFromReport(layout.nodes, layout.edges, caseId);
                }
              }}
              className="grid h-8 w-8 place-items-center rounded-lg border border-slate-700 text-slate-300 transition hover:border-amber-400/50 hover:text-amber-200"
              title="Reset board"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="max-h-[630px] space-y-4 overflow-y-auto pr-1">
          {Object.entries(groupedPalette).map(([group, items]) => (
            <div key={group}>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">{group}</p>
              <div className="grid grid-cols-2 gap-2">
                {items.map((item) => {
                  const Icon = paletteIcons[item.icon as keyof typeof paletteIcons] || Plus;
                  return (
                    <button
                      key={`${item.category}-${item.label}`}
                      type="button"
                      onClick={() => addPaletteNode(item)}
                      className={cn(
                        "flex min-h-[58px] flex-col items-start justify-between rounded-lg border border-slate-800 bg-slate-900/80 p-2 text-left transition hover:border-cyan-400/40 hover:bg-slate-800",
                        item.color === 'rose' && "hover:border-rose-400/40",
                        item.color === 'red' && "hover:border-red-400/40",
                        item.color === 'amber' && "hover:border-amber-400/40",
                        item.color === 'purple' && "hover:border-purple-400/40"
                      )}
                    >
                      <Icon className="h-4 w-4 text-slate-300" />
                      <span className="text-[11px] font-medium leading-tight text-slate-300">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onPaneClick={() => setSelectedNodeId(null)}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.08, minZoom: 0.72, maxZoom: 1.25 }}
        className="investigation-canvas"
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#1e293b" gap={24} size={2} />
        <Controls className="!rounded-xl !border !border-slate-700 !bg-slate-950/90 !shadow-xl [&>button]:!border-slate-800 [&>button]:!bg-transparent [&>button]:!text-slate-300 [&>button:hover]:!bg-slate-800" />
        <MiniMap
          pannable
          zoomable
          maskColor="rgba(2,6,23,0.82)"
          className="!rounded-xl !border !border-slate-700 !bg-slate-950/90"
          nodeColor={(node) => {
            const data = node.data as InvestigationNodeData;
            if (data.category === 'ai_flag') return '#ef4444';
            if (data.category === 'hypothesis') return '#f59e0b';
            if (data.category === 'people') return '#fb7185';
            if (data.category === 'location') return '#f97316';
            return '#22d3ee';
          }}
        />
      </ReactFlow>

      {selectedNode && (
        <DetailsPanel
          nodeData={selectedNode.data}
          onClose={() => setSelectedNodeId(null)}
          onUpdate={(data) => updateNodeData(selectedNode.id, data)}
          onDelete={() => removeNode(selectedNode.id)}
        />
      )}
    </div>
  );
}
