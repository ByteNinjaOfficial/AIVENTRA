import React, { memo } from 'react';
import { Handle, Position } from 'reactflow';
import {
  Camera, MapPin, Smartphone, Brain, AlertTriangle, Lightbulb, BookOpen, Film,
  UserX, Eye, User, Crosshair, FileSearch, Monitor, FileText, Microscope,
  StickyNote, Zap, Activity, Shield, ShieldAlert
} from 'lucide-react';
import type { TimelineEvent, RiskFlag, InvestigativeHypothesis, InvestigationNodeData } from '@/lib/types';
import { cn } from '@/lib/utils';

export const CustomTimelineNode = memo(({ data, selected }: { data: { event: TimelineEvent }, selected: boolean }) => {
  const { event } = data;
  const isHighRisk = event.severity === 'high';
  
  let Icon = Brain;
  let borderColor = 'border-cyan-500/50';
  let badgeColor = 'bg-cyan-500/20 text-cyan-200';
  
  const source = (event.source || '').toLowerCase();
  if (source.includes('cctv')) {
    Icon = Camera;
    borderColor = 'border-purple-500/50';
    badgeColor = 'bg-purple-500/20 text-purple-200';
  } else if (source.includes('gps')) {
    Icon = MapPin;
    borderColor = 'border-green-500/50';
    badgeColor = 'bg-green-500/20 text-green-200';
  } else if (source.includes('mobile') || source.includes('phone')) {
    Icon = Smartphone;
    borderColor = 'border-amber-500/50';
    badgeColor = 'bg-amber-500/20 text-amber-200';
  }

  return (
    <div className={cn(
      "relative min-w-[280px] max-w-[320px] rounded-xl bg-slate-900/90 border p-4 shadow-lg backdrop-blur-md transition-all",
      borderColor,
      selected ? "ring-2 ring-cyan-400" : "",
      isHighRisk ? "border-red-500/60" : ""
    )}>
      {isHighRisk && (
        <div className="absolute -inset-1 rounded-xl border border-red-500/30 pointer-events-none" />
      )}
      <Handle type="target" position={Position.Left} className="w-2 h-2 bg-slate-400 border-none" />
      
      <div className="flex items-start gap-3">
        <div className={cn("p-2 rounded-lg", badgeColor)}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <div className="flex justify-between items-start mb-1">
            <span className={cn("text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded", badgeColor)}>
              {event.source}
            </span>
            {isHighRisk && <span className="text-xs text-red-400 font-bold">HIGH</span>}
          </div>
          <p className="text-sm text-slate-200 line-clamp-2 mt-2">{event.event}</p>
          <p className="text-xs text-slate-500 mt-2">
            {event.timestamp ? new Date(event.timestamp).toLocaleString() : 'Unknown Time'}
          </p>
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="w-2 h-2 bg-slate-400 border-none" />
    </div>
  );
});

export const CustomRiskNode = memo(({ data, selected }: { data: { flag: RiskFlag }, selected: boolean }) => {
  const { flag } = data;
  const isHighRisk = flag.score > 80;

  return (
    <div className={cn(
      "relative min-w-[280px] max-w-[320px] rounded-xl bg-slate-900/90 border border-red-500/50 p-4 shadow-lg backdrop-blur-md transition-all",
      selected ? "ring-2 ring-red-400" : "",
      isHighRisk ? "border-red-400" : ""
    )}>
      {isHighRisk && (
        <div className="absolute -inset-1 rounded-xl border border-red-500/50 pointer-events-none" />
      )}
      <Handle type="target" position={Position.Left} className="w-2 h-2 bg-red-400 border-none" />
      
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-red-500/20 text-red-300">
          <AlertTriangle className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs font-bold text-red-400 uppercase tracking-wider">
              Risk Anomaly
            </span>
            <span className="text-xs font-mono text-red-300 bg-red-950/50 px-2 py-0.5 rounded border border-red-500/30">
              Score: {flag.score}
            </span>
          </div>
          <p className="text-sm font-semibold text-white mt-1 line-clamp-1">{flag.name || (flag as any).flag || "Risk Flag"}</p>
          <p className="text-xs text-slate-300 mt-1 line-clamp-2">{flag.description}</p>
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="w-2 h-2 bg-red-400 border-none" />
    </div>
  );
});

export const CustomHypothesisNode = memo(({ data, selected }: { data: { hypothesis: InvestigativeHypothesis }, selected: boolean }) => {
  const { hypothesis } = data;
  return (
    <div className={cn(
      "relative min-w-[320px] max-w-[380px] rounded-xl bg-slate-900/90 border border-amber-500/60 p-4 shadow-lg backdrop-blur-md transition-all",
      selected ? "ring-2 ring-amber-400" : ""
    )}>
      <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-amber-500/15 to-transparent pointer-events-none" />
      <Handle type="target" position={Position.Left} className="w-2 h-2 bg-amber-400 border-none" />
      
      <div className="flex items-start gap-3 relative z-10">
        <div className="p-2 rounded-lg bg-amber-500/20 text-amber-300">
          <Lightbulb className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">
              AI Conclusion
            </span>
            <span className="text-xs font-mono text-amber-300 bg-amber-950/50 px-2 py-0.5 rounded border border-amber-500/30">
              Confidence: {hypothesis.confidence}
            </span>
          </div>
          <p className="text-sm font-semibold text-white mt-1 leading-snug">{hypothesis.title}</p>
          <p className="text-xs text-slate-300 mt-2 line-clamp-3 leading-relaxed">{hypothesis.reasoning}</p>
        </div>
      </div>
    </div>
  );
});

export const CustomStoryNode = memo(({ data, selected }: { data: { story: string }, selected: boolean }) => {
  return (
    <div className={cn(
      "relative min-w-[380px] max-w-[480px] rounded-xl bg-slate-900/90 border border-sky-500/50 p-5 shadow-lg backdrop-blur-md transition-all",
      selected ? "ring-2 ring-sky-400" : ""
    )}>
      <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-sky-500/10 to-transparent pointer-events-none" />
      
      <div className="flex items-start gap-3 relative z-10">
        <div className="p-3 rounded-xl bg-sky-500/20 text-sky-300 shadow-inner">
          <BookOpen className="w-6 h-6" />
        </div>
        <div className="flex-1">
          <span className="text-xs font-black text-sky-400 uppercase tracking-[0.15em] mb-2 block">
            Executive Crime Story
          </span>
          <p className="text-sm text-slate-200 mt-2 leading-relaxed font-medium">
            {data.story}
          </p>
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="w-2 h-2 bg-sky-400 border-none" />
    </div>
  );
});

export const CustomStoryBeatNode = memo(({ data, selected }: { data: { beat: { title: string; description: string; phase?: 'normal' | 'suspicious' | 'critical'; timestamp_guess?: string; connected_evidence?: string } }, selected: boolean }) => {
  const { beat } = data;
  const phase = beat.phase || 'normal';

  let borderColor = 'border-cyan-500/50';
  let badgeColor = 'bg-cyan-500/20 text-cyan-200';
  let ringColor = 'ring-cyan-400';
  let selectedColor = '';
  let pulse = false;
  let sizeClass = 'min-w-[320px] max-w-[360px]';

  if (phase === 'suspicious') {
    borderColor = 'border-amber-500/50';
    badgeColor = 'bg-amber-500/20 text-amber-200';
    ringColor = 'ring-amber-400';
    selectedColor = '';
  } else if (phase === 'critical') {
    borderColor = 'border-red-500/60';
    badgeColor = 'bg-red-500/20 text-red-200';
    ringColor = 'ring-red-400';
    selectedColor = 'border-red-400';
    pulse = true;
    sizeClass = 'min-w-[380px] max-w-[420px] scale-105';
  }

  return (
    <div className={cn(
      "relative rounded-xl bg-slate-900/90 border p-4 backdrop-blur-md transition-all",
      sizeClass,
      borderColor,
      selected ? cn("ring-2", ringColor) : selectedColor
    )}>
      {pulse && (
        <div className="absolute -inset-1 rounded-xl border border-red-500/30 pointer-events-none" />
      )}
      <Handle type="target" position={Position.Left} className={cn("w-2 h-2 border-none", badgeColor.split(' ')[1])} />
      <Handle type="source" position={Position.Right} className={cn("w-2 h-2 border-none", badgeColor.split(' ')[1])} />
      
      <div className="flex items-start gap-3">
        <div className={cn("p-2 rounded-lg", badgeColor)}>
          {phase === 'critical' ? <AlertTriangle className="w-5 h-5" /> : <Film className="w-5 h-5" />}
        </div>
        <div className="flex-1">
          <div className="flex justify-between items-center mb-1">
            <span className={cn("text-xs font-bold uppercase tracking-wider", badgeColor.replace('bg-', 'text-').split(' ')[1])}>
              {phase === 'critical' ? 'MAIN INCIDENT NODE' : 'Investigation Event'}
            </span>
          </div>
          <p className="text-sm font-bold text-white mt-1 leading-snug">{beat.title}</p>
          <p className="text-xs text-slate-300 mt-2 leading-relaxed">{beat.description}</p>
        </div>
      </div>
    </div>
  );
});

const CATEGORY_STYLES: Record<string, { border: string; badge: string; iconBg: string; text: string }> = {
  people: { border: 'border-rose-500/50', badge: 'bg-rose-500/20 text-rose-200', iconBg: 'bg-rose-500/20', text: 'text-rose-300' },
  location: { border: 'border-red-500/50', badge: 'bg-red-500/20 text-red-200', iconBg: 'bg-red-500/20', text: 'text-red-300' },
  evidence: { border: 'border-cyan-500/50', badge: 'bg-cyan-500/20 text-cyan-200', iconBg: 'bg-cyan-500/20', text: 'text-cyan-300' },
  note: { border: 'border-slate-500/50', badge: 'bg-slate-500/20 text-slate-200', iconBg: 'bg-slate-500/20', text: 'text-slate-300' },
  hypothesis: { border: 'border-amber-500/60', badge: 'bg-amber-500/20 text-amber-200', iconBg: 'bg-amber-500/20', text: 'text-amber-300' },
  contradiction: { border: 'border-purple-500/60', badge: 'bg-purple-500/20 text-purple-200', iconBg: 'bg-purple-500/20', text: 'text-purple-300' },
  ai_flag: { border: 'border-red-500/50', badge: 'bg-red-500/20 text-red-200', iconBg: 'bg-red-500/20', text: 'text-red-300' },
};

function CategoryBadge({ category, label }: { category: string; label: string }) {
  const style = CATEGORY_STYLES[category] || CATEGORY_STYLES['note'];
  return (
    <span className={cn("text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded", style.badge)}>
      {label}
    </span>
  );
}

function SourceIndicator({ source }: { source: 'ai' | 'user' }) {
  if (source === 'ai') {
    return (
      <span className="flex items-center gap-1 text-[9px] font-bold text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded border border-cyan-500/20">
        <ShieldAlert className="w-3 h-3" /> AI
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-[9px] font-medium text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">
      <Shield className="w-3 h-3" /> USER
    </span>
  );
}

export const CustomPersonNode = memo(({ data, selected }: { data: InvestigationNodeData; selected: boolean }) => {
  const style = CATEGORY_STYLES['people'];
  return (
    <div className={cn(
      "relative min-w-[240px] max-w-[300px] rounded-xl bg-slate-900/90 border p-4 shadow-lg backdrop-blur-md transition-all",
      style.border,
      selected ? "ring-2 ring-rose-400" : ""
    )}>
      <Handle type="target" position={Position.Left} className="w-2 h-2 bg-rose-400 border-none" />
      <div className="flex items-start gap-3">
        <div className={cn("p-2 rounded-lg", style.iconBg)}>
          {data.personRole === 'Suspect' ? <UserX className={cn("w-5 h-5", style.text)} /> :
           data.personRole === 'Witness' ? <Eye className={cn("w-5 h-5", style.text)} /> :
           <User className={cn("w-5 h-5", style.text)} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <CategoryBadge category="people" label={data.personRole || 'Person'} />
            <SourceIndicator source={data.source || 'user'} />
          </div>
          <p className="text-sm font-bold text-white mt-1 truncate">{data.personName || data.label || 'Unknown Person'}</p>
          {data.description && <p className="text-xs text-slate-400 mt-1 line-clamp-2">{data.description}</p>}
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="w-2 h-2 bg-rose-400 border-none" />
    </div>
  );
});

export const CustomLocationNode = memo(({ data, selected }: { data: InvestigationNodeData; selected: boolean }) => {
  const style = CATEGORY_STYLES['location'];
  return (
    <div className={cn(
      "relative min-w-[240px] max-w-[300px] rounded-xl bg-slate-900/90 border p-4 shadow-lg backdrop-blur-md transition-all",
      style.border,
      selected ? "ring-2 ring-red-400" : ""
    )}>
      <Handle type="target" position={Position.Left} className="w-2 h-2 bg-red-400 border-none" />
      <div className="flex items-start gap-3">
        <div className={cn("p-2 rounded-lg", style.iconBg)}>
          {data.locationType === 'Crime Scene' ? <Crosshair className={cn("w-5 h-5", style.text)} /> :
           data.locationType === 'Route' ? <MapPin className={cn("w-5 h-5", style.text)} /> :
           <MapPin className={cn("w-5 h-5", style.text)} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <CategoryBadge category="location" label={data.locationType || 'Location'} />
            <SourceIndicator source={data.source || 'user'} />
          </div>
          <p className="text-sm font-bold text-white mt-1 truncate">{data.locationName || data.label || 'Unknown Location'}</p>
          {data.description && <p className="text-xs text-slate-400 mt-1 line-clamp-2">{data.description}</p>}
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="w-2 h-2 bg-red-400 border-none" />
    </div>
  );
});

export const CustomEvidenceNode = memo(({ data, selected }: { data: InvestigationNodeData; selected: boolean }) => {
  const style = CATEGORY_STYLES['evidence'];
  return (
    <div className={cn(
      "relative min-w-[240px] max-w-[300px] rounded-xl bg-slate-900/90 border p-4 shadow-lg backdrop-blur-md transition-all",
      style.border,
      selected ? "ring-2 ring-cyan-400" : ""
    )}>
      <Handle type="target" position={Position.Left} className="w-2 h-2 bg-cyan-400 border-none" />
      <div className="flex items-start gap-3">
        <div className={cn("p-2 rounded-lg", style.iconBg)}>
          {data.evidenceType === 'Digital' ? <Monitor className={cn("w-5 h-5", style.text)} /> :
           data.evidenceType === 'Document' ? <FileText className={cn("w-5 h-5", style.text)} /> :
           data.evidenceType === 'Photograph' ? <Camera className={cn("w-5 h-5", style.text)} /> :
           data.evidenceType === 'Forensic' ? <Microscope className={cn("w-5 h-5", style.text)} /> :
           <FileSearch className={cn("w-5 h-5", style.text)} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <CategoryBadge category="evidence" label={data.evidenceType || 'Evidence'} />
            <SourceIndicator source={data.source || 'user'} />
          </div>
          <p className="text-sm font-bold text-white mt-1 truncate">{data.label || 'Evidence Item'}</p>
          {data.evidenceFile && <p className="text-[10px] text-cyan-400/60 mt-0.5 truncate">{data.evidenceFile}</p>}
          {data.description && <p className="text-xs text-slate-400 mt-1 line-clamp-2">{data.description}</p>}
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="w-2 h-2 bg-cyan-400 border-none" />
    </div>
  );
});

export const CustomNoteNode = memo(({ data, selected }: { data: InvestigationNodeData; selected: boolean }) => {
  const style = CATEGORY_STYLES['note'];
  return (
    <div className={cn(
      "relative min-w-[220px] max-w-[280px] rounded-xl bg-slate-900/90 border p-4 shadow-lg backdrop-blur-md transition-all",
      style.border,
      selected ? "ring-2 ring-slate-400" : ""
    )}>
      <Handle type="target" position={Position.Left} className="w-2 h-2 bg-slate-400 border-none" />
      <div className="flex items-start gap-3">
        <div className={cn("p-2 rounded-lg", style.iconBg)}>
          <StickyNote className={cn("w-5 h-5", style.text)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <CategoryBadge category="note" label="Note" />
            <SourceIndicator source={data.source || 'user'} />
          </div>
          <p className="text-sm font-semibold text-white mt-1 truncate">{data.label || 'Investigator Note'}</p>
          {data.noteContent && <p className="text-xs text-slate-400 mt-1 line-clamp-3">{data.noteContent}</p>}
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="w-2 h-2 bg-slate-400 border-none" />
    </div>
  );
});

export const CustomHypothesisNode2 = memo(({ data, selected }: { data: InvestigationNodeData; selected: boolean }) => {
  const style = CATEGORY_STYLES['hypothesis'];
  return (
    <div className={cn(
      "relative min-w-[280px] max-w-[340px] rounded-xl bg-slate-900/90 border p-4 shadow-lg backdrop-blur-md transition-all",
      style.border,
      selected ? "ring-2 ring-amber-400" : ""
    )}>
      <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-amber-500/10 to-transparent pointer-events-none" />
      <Handle type="target" position={Position.Left} className="w-2 h-2 bg-amber-400 border-none" />
      <div className="flex items-start gap-3 relative z-10">
        <div className={cn("p-2 rounded-lg", style.iconBg)}>
          <Lightbulb className={cn("w-5 h-5", style.text)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <CategoryBadge category="hypothesis" label="Hypothesis" />
            <SourceIndicator source={data.source || 'user'} />
          </div>
          <p className="text-sm font-bold text-white mt-1 leading-snug">{data.label || 'Hypothesis'}</p>
          {data.description && <p className="text-xs text-slate-300 mt-2 line-clamp-3 leading-relaxed">{data.description}</p>}
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="w-2 h-2 bg-amber-400 border-none" />
    </div>
  );
});

export const CustomContradictionNode = memo(({ data, selected }: { data: InvestigationNodeData; selected: boolean }) => {
  const style = CATEGORY_STYLES['contradiction'];
  return (
    <div className={cn(
      "relative min-w-[260px] max-w-[320px] rounded-xl bg-slate-900/90 border p-4 shadow-lg backdrop-blur-md transition-all",
      style.border,
      selected ? "ring-2 ring-purple-400" : ""
    )}>
      <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-purple-500/10 to-transparent pointer-events-none" />
      <Handle type="target" position={Position.Left} className="w-2 h-2 bg-purple-400 border-none" />
      <div className="flex items-start gap-3 relative z-10">
        <div className={cn("p-2 rounded-lg", style.iconBg)}>
          <Zap className={cn("w-5 h-5", style.text)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <CategoryBadge category="contradiction" label="Contradiction" />
            <SourceIndicator source={data.source || 'user'} />
          </div>
          <p className="text-sm font-bold text-white mt-1 leading-snug">{data.label || 'Contradiction'}</p>
          {data.contradictionText && <p className="text-xs text-slate-300 mt-2 line-clamp-3 leading-relaxed">{data.contradictionText}</p>}
          {data.description && !data.contradictionText && <p className="text-xs text-slate-300 mt-2 line-clamp-3 leading-relaxed">{data.description}</p>}
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="w-2 h-2 bg-purple-400 border-none" />
    </div>
  );
});
