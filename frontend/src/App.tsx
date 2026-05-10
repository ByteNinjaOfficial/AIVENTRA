import { AnimatePresence, motion } from "framer-motion";
import { InvestigationGraph } from "@/components/InvestigationGraph";
import {
  Activity,
  Bell,
  BrainCircuit,
  ChevronRight,
  Command,
  Database,
  FileScan,
  Fingerprint,
  LayoutDashboard,
  Map,
  Radar,
  Search,
  Settings,
  ShieldAlert,
  Siren,
  Sparkles,
  UploadCloud,
  UserCircle2,
  Trash2
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { analyzeCase, createCase, deleteCase, getAnalysisResults, getCases, getReport, getReportDocumentUrl, uploadEvidence } from "@/lib/api";
import { mockCases, mockReport, mockTimeline } from "@/lib/mock-data";
import type { CaseRecord, CaseReport } from "@/lib/types";
import { cn, delay, formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";

const navItems = [
  { label: "Dashboard", icon: LayoutDashboard },
  { label: "Case Details", icon: FileScan },
  { label: "Narrative Graph", icon: Map },
  { label: "Evidence", icon: Database },
  { label: "AI Analysis", icon: BrainCircuit },
  { label: "Risk Engine", icon: ShieldAlert },
  { label: "Settings", icon: Settings }
];

const evidenceTypes = [
  { key: "autopsy", label: "Autopsy report", icon: Fingerprint, accept: ".pdf" },
  { key: "cctv", label: "CCTV logs", icon: Radar, accept: ".csv,.txt,.log" },
  { key: "metadata", label: "Metadata", icon: Database, accept: ".json,.csv,.txt" },
  { key: "image", label: "Images", icon: FileScan, accept: ".jpg,.jpeg,.png" },
  { key: "gps", label: "GPS records", icon: Map, accept: ".csv,.txt,.log" }
];

const processLogs = [
  "Parsing autopsy report...",
  "Extracting injury signatures...",
  "Correlating CCTV and GPS metadata...",
  "Building timeline reconstruction...",
  "Detecting anomalies and route conflicts...",
  "Generating forensic intelligence story...",
  "Preparing police investigation briefing..."
];

type FlowStep = "case" | "upload" | "analysis" | "results";

type CaseForm = {
  title: string;
  victim_name: string;
  incident_location: string;
  incident_date: string;
  notes: string;
  priority: string;
};

export default function App() {
  const [cases, setCases] = useState<CaseRecord[]>(mockCases);
  const [selectedCase, setSelectedCase] = useState<CaseReport>(mockReport);
  const [flowOpen, setFlowOpen] = useState(false);
  const [flowStep, setFlowStep] = useState<FlowStep>("case");
  const [liveLogs, setLiveLogs] = useState<string[]>([]);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [activeTab, setActiveTab] = useState("Dashboard");

  useEffect(() => {
    refreshCases();
  }, []);

  async function refreshCases() {
    const items = await getCases();
    if (items.length) setCases(items);
  }

  async function handleDeleteCase(id: string) {
    if (!confirm("Are you sure you want to delete this case? This action cannot be undone.")) return;
    try {
      await deleteCase(id);
      await refreshCases();
      if (selectedCase?.case_id === id) {
        setSelectedCase(mockReport);
        setActiveTab("Dashboard");
      }
    } catch (e) {
      console.error("Failed to delete case", e);
      alert("Failed to delete case.");
    }
  }

  const intelligence = selectedCase?.structured_report?.investigative_intelligence || selectedCase?.investigative_intelligence;
  const timeline = selectedCase?.structured_report?.timeline_analysis?.events || selectedCase?.timeline || mockTimeline;

  async function loadCase(caseId: string) {
    try {
      const report = await getReport(caseId);
      setSelectedCase(report);
    } catch (error) {
      console.error("Failed to load case report", error);
      alert("This case has no completed report yet. Run analysis first.");
    }
  }

  return (
    <div className="min-h-screen overflow-hidden bg-[#0B1220] text-foreground">
      <div className="flex min-h-screen">
        <Sidebar activeTab={activeTab} onTabSelect={setActiveTab} />
        <main className="min-w-0 flex-1 px-4 py-4 md:px-6 lg:px-8">
          <Topbar onCreate={() => setFlowOpen(true)} />
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="mt-6"
          >
            {activeTab === "Dashboard" ? (
              <>
                <DashboardHeader caseCount={cases.length} onCreate={() => setFlowOpen(true)} />
                <MetricGrid cases={cases} />
                <div className="mt-5 grid gap-5 2xl:grid-cols-[minmax(0,1fr)_320px]">
                  <InvestigationTable
                    cases={cases} 
                    selected={selectedCase?.case_id} 
                    onSelect={(id) => { loadCase(id); setActiveTab("Case Details"); }} 
                    onDelete={handleDeleteCase}
                  />
                  <ActivityFeed cases={cases} selectedCase={selectedCase} />
                </div>
              </>
            ) : activeTab === "Case Details" ? (
              <div className="space-y-6">
                <HeroCommand selectedCase={selectedCase} onCreate={() => setFlowOpen(true)} />
                <div className="grid gap-6 2xl:grid-cols-[1.15fr_.85fr]">
                  <CaseIntelPanel report={selectedCase} intelligence={intelligence} onOpenReport={() => window.open(getReportDocumentUrl(selectedCase.case_id), "_blank")} />
                  <CorrelationNetwork />
                </div>
                <TimelinePanel timeline={timeline} />
              </div>
            ) : activeTab === "Narrative Graph" ? (
              <InvestigationGraph caseId={selectedCase.case_id} />
            ) : (
              <div className="flex h-[60vh] flex-col items-center justify-center rounded-3xl border border-white/10 bg-slate-950/40 text-center">
                <BrainCircuit className="h-16 w-16 text-cyan-500/50" />
                <h3 className="mt-4 text-2xl font-bold text-white">{activeTab}</h3>
                <p className="mt-2 text-slate-400">This module is part of the advanced forensic suite.</p>
                <Button className="mt-6" onClick={() => setActiveTab("Dashboard")}>Return to Dashboard</Button>
              </div>
            )}
          </motion.section>
        </main>
      </div>

      <CaseFlowDialog
        open={flowOpen}
        step={flowStep}
        setStep={setFlowStep}
        logs={liveLogs}
        progress={analysisProgress}
        onClose={() => {
          setFlowOpen(false);
          setFlowStep("case");
          setLiveLogs([]);
          setAnalysisProgress(0);
        }}
        onComplete={(report, created) => {
          setSelectedCase(report);
          setCases((prev) => [created, ...prev.filter((item) => item.case_id !== created.case_id)]);
        }}
        runLogs={async () => {
          setLiveLogs([]);
          setAnalysisProgress(0);
          for (let i = 0; i < processLogs.length; i += 1) {
            await delay(520);
            setLiveLogs((prev) => [...prev, processLogs[i]]);
            setAnalysisProgress(Math.round(((i + 1) / processLogs.length) * 100));
          }
        }}
      />
    </div>
  );
}

function Sidebar({ activeTab, onTabSelect }: { activeTab: string; onTabSelect: (tab: string) => void }) {
  return (
    <aside className="hidden w-72 shrink-0 border-r border-slate-800 bg-[#0F172A] p-5 lg:block">
      <div className="flex items-center gap-3">
        <div className="grid h-12 w-12 place-items-center rounded-lg border border-slate-700 bg-slate-900">
          <Command className="h-6 w-6 text-sky-300" />
        </div>
        <div>
          <p className="text-lg font-black tracking-wide text-white">ForensiAI</p>
          <p className="text-xs text-slate-400">Command Center</p>
        </div>
      </div>
      <nav className="mt-9 space-y-2">
        {navItems.map((item, index) => (
          <motion.button
            key={item.label}
            onClick={() => onTabSelect(item.label)}
            initial={{ opacity: 0, x: -14 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.06 * index }}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm font-semibold text-slate-300 transition hover:bg-slate-800 hover:text-white",
              activeTab === item.label && "bg-slate-800 text-sky-100 ring-1 ring-slate-700"
            )}
          >
            <item.icon className="h-5 w-5" />
            {item.label}
          </motion.button>
        ))}
      </nav>
      <div className="mt-8 rounded-lg border border-slate-700 bg-slate-900 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          System Online
        </div>
        <p className="mt-3 text-xs leading-5 text-slate-400">Backend connected. AI risk engine and report generator are ready for demo review.</p>
      </div>
    </aside>
  );
}

function Topbar({ onCreate }: { onCreate: () => void }) {
  return (
    <header className="glass sticky top-4 z-30 flex flex-col gap-3 rounded-lg px-4 py-3 md:flex-row md:items-center md:justify-between">
      <div className="flex min-w-0 flex-1 items-center gap-3 rounded-lg border border-slate-700 bg-slate-950/40 px-3 py-2">
        <Search className="h-4 w-4 text-sky-300" />
        <input className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-500" placeholder="Search case ID, evidence, vehicle, location..." />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone="green" className="gap-2"><span className="h-2 w-2 rounded-full bg-emerald-300" /> Live AI Processing</Badge>
        <Button variant="secondary" className="h-10 w-10 px-0"><Bell className="h-4 w-4" /></Button>
        <div className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2">
          <UserCircle2 className="h-5 w-5 text-sky-300" />
          <span className="text-sm font-semibold">Investigator</span>
        </div>
        <Button onClick={onCreate}><Sparkles className="h-4 w-4" /> Create New Case</Button>
      </div>
    </header>
  );
}

function HeroCommand({ selectedCase, onCreate }: { selectedCase: CaseReport; onCreate: () => void }) {
  return (
    <Card className="relative overflow-hidden p-0">
      <div className="relative grid gap-6 p-6 lg:grid-cols-[1.35fr_.65fr] lg:p-8">
        <div>
          <Badge tone="cyan">Forensic Intelligence Operations</Badge>
          <h1 className="mt-5 max-w-4xl text-3xl font-bold leading-tight text-white md:text-4xl">
            Investigation command center
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-7 text-slate-300">
            Track evidence, reconstruct timelines, surface anomalies, and convert forensic data into investigator-ready intelligence.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button onClick={onCreate}><UploadCloud className="h-4 w-4" /> Launch Investigation Flow</Button>
            <Button variant="secondary" onClick={() => window.open(getReportDocumentUrl(selectedCase.case_id), "_blank")}>
              Open Intelligence Report <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="relative min-h-64 overflow-hidden rounded-lg border border-slate-700 bg-slate-950/45 p-5">
          <div className="relative z-10 flex h-full flex-col justify-between">
            <Badge tone="red">Risk {selectedCase.risk_score}/100</Badge>
            <div>
              <p className="text-sm text-slate-400">Active Case</p>
              <h2 className="mt-2 text-2xl font-bold text-white">{selectedCase.case_id}</h2>
              <p className="mt-2 text-sm text-slate-300">{selectedCase.victim_name} · {selectedCase.incident_location}</p>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

function DashboardHeader({ caseCount, onCreate }: { caseCount: number; onCreate: () => void }) {
  return (
    <div className="rounded-lg border border-[#2A3138] bg-[#171A1D] px-5 py-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7C9B8A]">Operations Queue</p>
          <h1 className="mt-2 text-2xl font-semibold text-[#E6E9EC]">Dashboard</h1>
          <p className="mt-1 text-sm text-[#AAB3BB]">{caseCount} investigation records loaded from the case service.</p>
        </div>
        <Button onClick={onCreate} className="bg-[#7C9B8A] text-[#111315] hover:bg-[#8bad9a]">
          <UploadCloud className="h-4 w-4" /> Open Investigation Flow
        </Button>
      </div>
    </div>
  );
}

function MetricGrid({ cases }: { cases: CaseRecord[] }) {
  const metrics = useMemo(() => {
    const active = cases.filter((item) => !["completed", "archived"].includes(item.status.toLowerCase())).length;
    const pending = cases.filter((item) => ["processing", "pending", "pending_review", "under_review"].includes(item.status.toLowerCase())).length;
    const highRisk = cases.filter((item) => item.risk_level === "HIGH").length;
    const completed = cases.filter((item) => item.status.toLowerCase() === "completed").length;
    return [
      { label: "Active Cases", value: active, icon: Activity },
      { label: "Pending Review", value: pending, icon: FileScan },
      { label: "High Risk", value: highRisk, icon: Siren },
      { label: "Completed", value: completed, icon: Database }
    ];
  }, [cases]);

  return (
    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => (
        <Card key={metric.label} className="border-[#2A3138] bg-[#171A1D]">
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-2xl font-semibold text-[#E6E9EC]">{metric.value}</p>
              <p className="mt-1 text-xs font-medium uppercase tracking-[0.14em] text-[#AAB3BB]">{metric.label}</p>
            </div>
            <div className="grid h-10 w-10 place-items-center rounded-md border border-[#2A3138] bg-[#1E2328]">
              <metric.icon className="h-5 w-5 text-[#7C9B8A]" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function CaseIntelPanel({ report, intelligence, onOpenReport }: { report: CaseReport; intelligence?: CaseReport["investigative_intelligence"]; onOpenReport: () => void }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>AI Investigation Insights</CardTitle>
          <p className="mt-2 text-sm text-slate-400">{report.case_id} · {report.victim_name}</p>
        </div>
        <Badge tone={report.risk_level === "HIGH" ? "red" : "yellow"}>{report.risk_level}</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <InsightCard title="Crime Story" body={intelligence?.crime_story || report.summary || "No crime story generated yet."} icon={BrainCircuit} />
        <InsightCard title="Case Breakthrough" body={intelligence?.case_breakthrough || "Upload evidence and run analysis to generate a breakthrough hypothesis."} icon={Sparkles} accent />
        <div className="grid gap-3 sm:grid-cols-2">
          {(intelligence?.priority_leads || ["Pull CCTV overwrite-window footage", "Map route conflicts", "Check suspect injury trail"]).slice(0, 4).map((lead) => (
            <div key={lead} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-sm text-slate-300">{lead}</div>
          ))}
        </div>
        <Button variant="secondary" onClick={onOpenReport}>Open Full Report <ChevronRight className="h-4 w-4" /></Button>
      </CardContent>
    </Card>
  );
}

function InsightCard({ title, body, icon: Icon, accent }: { title: string; body: string; icon: typeof BrainCircuit; accent?: boolean }) {
  return (
    <div className={cn("rounded-2xl border p-4", accent ? "border-cyan-300/30 bg-cyan-300/10" : "border-white/10 bg-white/[0.04]")}>
      <div className="flex items-center gap-2 text-sm font-bold text-white"><Icon className="h-4 w-4 text-cyan-200" />{title}</div>
      <p className="mt-3 text-sm leading-6 text-slate-300">{body}</p>
    </div>
  );
}

function TimelinePanel({ timeline }: { timeline: CaseReport["timeline"] }) {
  const events = timeline || [];
  return (
    <Card>
      <CardHeader><CardTitle>Interactive Case Timeline</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {events.map((event, index) => (
          <motion.div key={`${event.timestamp}-${index}`} initial={{ opacity: 0, x: -18 }} whileInView={{ opacity: 1, x: 0 }} className="relative border-l border-cyan-300/20 pl-5">
            <span className="absolute -left-2 top-1 h-4 w-4 rounded-full bg-sky-300" />
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={event.severity === "high" ? "red" : "cyan"}>{event.source}</Badge>
                <span className="text-sm text-slate-400">{formatDate(event.timestamp)}</span>
              </div>
              <p className="mt-2 text-sm text-white">{event.event}</p>
            </div>
          </motion.div>
        ))}
      </CardContent>
    </Card>
  );
}

function CorrelationNetwork() {
  const nodes = [
    { label: "Suspect", x: "50%", y: "16%" },
    { label: "Phone", x: "24%", y: "42%" },
    { label: "CCTV", x: "76%", y: "42%" },
    { label: "Location", x: "34%", y: "76%" },
    { label: "Vehicle", x: "66%", y: "76%" }
  ];
  return (
    <Card>
      <CardHeader><CardTitle>Evidence Correlation Network</CardTitle></CardHeader>
      <CardContent>
        <div className="relative h-[420px] overflow-hidden rounded-lg border border-slate-700 bg-slate-950/45">
          <svg className="absolute inset-0 h-full w-full">
            {[[0, 1], [0, 2], [1, 3], [2, 4], [3, 4], [1, 4]].map(([a, b], index) => (
              <line
                key={`${a}-${b}`}
                x1={nodes[a].x}
                y1={nodes[a].y}
                x2={nodes[b].x}
                y2={nodes[b].y}
                stroke="rgba(148,163,184,.38)"
                strokeWidth="2"
              />
            ))}
          </svg>
          {nodes.map((node, index) => (
            <div
              key={node.label}
              className="absolute grid h-24 w-24 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-slate-600 bg-slate-900 text-center text-xs font-bold text-slate-100"
              style={{ left: node.x, top: node.y }}
            >
              {node.label}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

type CaseSortField = "case_id" | "name" | "risk_level" | "created_at" | "status";

function InvestigationTable({
  cases,
  selected,
  onSelect,
  onDelete
}: {
  cases: CaseRecord[];
  selected: string;
  onSelect: (caseId: string) => void;
  onDelete: (caseId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [sortField, setSortField] = useState<CaseSortField>("created_at");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const rows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return cases
      .filter((item) => {
        if (!normalizedQuery) return true;
        return [
          item.case_id,
          getCaseName(item),
          item.risk_level,
          normalizeCaseStatus(item.status),
          item.incident_location,
          item.victim_name
        ].some((value) => value.toLowerCase().includes(normalizedQuery));
      })
      .sort((a, b) => {
        const first = getSortValue(a, sortField);
        const second = getSortValue(b, sortField);
        const result = first.localeCompare(second, undefined, { numeric: true, sensitivity: "base" });
        return sortDirection === "asc" ? result : -result;
      });
  }, [cases, query, sortDirection, sortField]);

  function updateSort(field: CaseSortField) {
    if (field === sortField) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortField(field);
    setSortDirection(field === "created_at" ? "desc" : "asc");
  }

  const headers: Array<{ label: string; field: CaseSortField }> = [
    { label: "Case ID", field: "case_id" },
    { label: "Case Name", field: "name" },
    { label: "Priority", field: "risk_level" }
  ];

  return (
    <Card className="border-[#2A3138] bg-[#171A1D]">
      <CardHeader className="flex flex-col gap-3 border-b border-[#2A3138] sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-[#E6E9EC]">Active Investigations</CardTitle>
          <p className="mt-1 text-sm text-[#AAB3BB]">Open a case to continue evidence review, analysis, and report work.</p>
        </div>
        <div className="flex min-w-0 items-center gap-2 rounded-md border border-[#2A3138] bg-[#111315] px-3 py-2 sm:w-72">
          <Search className="h-4 w-4 shrink-0 text-[#7C9B8A]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="min-w-0 flex-1 bg-transparent text-sm text-[#E6E9EC] outline-none placeholder:text-[#AAB3BB]/70"
            placeholder="Search investigations"
          />
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="thin-scrollbar overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="border-b border-[#2A3138] bg-[#1E2328] text-xs uppercase tracking-[0.14em] text-[#AAB3BB]">
              <tr>
                {headers.map((header) => (
                  <th key={header.field} className="px-4 py-3 font-semibold">
                    <button className="flex items-center gap-2 transition hover:text-[#E6E9EC]" onClick={() => updateSort(header.field)}>
                      {header.label}
                      {sortField === header.field ? <span className="text-[#7C9B8A]">{sortDirection === "asc" ? "Asc" : "Desc"}</span> : null}
                    </button>
                  </th>
                ))}
                <th className="px-4 py-3 font-semibold">Assigned Investigator</th>
                <th className="px-4 py-3 font-semibold">
                  <button className="flex items-center gap-2 transition hover:text-[#E6E9EC]" onClick={() => updateSort("created_at")}>
                    Last Updated
                    {sortField === "created_at" ? <span className="text-[#7C9B8A]">{sortDirection === "asc" ? "Asc" : "Desc"}</span> : null}
                  </button>
                </th>
                <th className="px-4 py-3 font-semibold">
                  <button className="flex items-center gap-2 transition hover:text-[#E6E9EC]" onClick={() => updateSort("status")}>
                    Status
                    {sortField === "status" ? <span className="text-[#7C9B8A]">{sortDirection === "asc" ? "Asc" : "Desc"}</span> : null}
                  </button>
                </th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2A3138]">
              {rows.map((item) => (
                <tr
                  key={item.case_id}
                  className={cn(
                    "group cursor-pointer bg-[#171A1D] transition hover:bg-[#1E2328]",
                    selected === item.case_id && "bg-[#1E2328]"
                  )}
                  onClick={() => onSelect(item.case_id)}
                >
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-[#E6E9EC]">{item.case_id}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-[#E6E9EC]">{getCaseName(item)}</p>
                    <p className="mt-1 text-xs text-[#AAB3BB]">{item.incident_location}</p>
                  </td>
                  <td className="px-4 py-3"><PriorityBadge riskLevel={item.risk_level} /></td>
                  <td className="px-4 py-3 text-[#AAB3BB]">Unassigned</td>
                  <td className="px-4 py-3 text-[#AAB3BB]">{formatDate(item.created_at || item.incident_date)}</td>
                  <td className="px-4 py-3"><StatusBadge status={item.status} /></td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        onDelete(item.case_id);
                      }}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[#A65A5A]/35 text-[#A65A5A] transition hover:bg-[#A65A5A]/10"
                      title="Delete case"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length ? (
            <div className="border-t border-[#2A3138] px-4 py-10 text-center text-sm text-[#AAB3BB]">No investigations match the current search.</div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function ActivityFeed({ cases, selectedCase }: { cases: CaseRecord[]; selectedCase: CaseReport }) {
  const items = useMemo(() => {
    const caseEvents = cases.slice(0, 5).map((item) => ({
      id: `${item.case_id}-${item.status}`,
      title: normalizeCaseStatus(item.status) === "Completed" ? "Report available" : "Case queued",
      description: `${item.case_id} · ${getCaseName(item)}`,
      timestamp: item.created_at || item.incident_date,
      tone: item.risk_level === "HIGH" ? "red" : item.risk_level === "MEDIUM" ? "yellow" : "green"
    }));

    const reportEvents = selectedCase?.generated_at
      ? [{
          id: `${selectedCase.case_id}-report`,
          title: "Selected case refreshed",
          description: `${selectedCase.case_id} report data loaded`,
          timestamp: selectedCase.generated_at,
          tone: selectedCase.risk_level === "HIGH" ? "red" : "green"
        }]
      : [];

    return [...reportEvents, ...caseEvents].slice(0, 6);
  }, [cases, selectedCase]);

  return (
    <Card className="border-[#2A3138] bg-[#171A1D]">
      <CardHeader className="border-b border-[#2A3138]">
        <CardTitle className="text-[#E6E9EC]">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-4">
        {items.map((item) => (
          <div key={item.id} className="rounded-md border border-[#2A3138] bg-[#1E2328] p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-[#E6E9EC]">{item.title}</p>
              <Badge tone={item.tone as "red" | "yellow" | "green"}>{item.tone}</Badge>
            </div>
            <p className="mt-2 text-xs leading-5 text-[#AAB3BB]">{item.description}</p>
            <p className="mt-2 text-xs text-[#AAB3BB]/75">{formatDate(item.timestamp)}</p>
          </div>
        ))}
        {!items.length ? <p className="text-sm text-[#AAB3BB]">No activity from the case service yet.</p> : null}
      </CardContent>
    </Card>
  );
}

function getCaseName(item: CaseRecord) {
  const titleMatch = item.notes?.match(/Case Title:\s*(.+)/i);
  if (titleMatch?.[1]) return titleMatch[1].trim();
  if (item.victim_name && item.incident_location) return `${item.victim_name} investigation`;
  return item.case_id;
}

function getSortValue(item: CaseRecord, field: CaseSortField) {
  if (field === "name") return getCaseName(item);
  if (field === "created_at") return item.created_at || item.incident_date || "";
  return String(item[field] || "");
}

function normalizeCaseStatus(status: string) {
  return status
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function PriorityBadge({ riskLevel }: { riskLevel: string }) {
  const tone = riskLevel === "HIGH" ? "red" : riskLevel === "MEDIUM" ? "yellow" : "green";
  return <Badge tone={tone}>{riskLevel || "LOW"}</Badge>;
}

function StatusBadge({ status }: { status: string }) {
  const normalized = normalizeCaseStatus(status || "active");
  const tone = normalized === "Completed" ? "green" : normalized === "Archived" ? "slate" : normalized.includes("Review") ? "yellow" : "cyan";
  return <Badge tone={tone}>{normalized}</Badge>;
}

function CaseFlowDialog({
  open,
  step,
  setStep,
  logs,
  progress,
  onClose,
  onComplete,
  runLogs
}: {
  open: boolean;
  step: FlowStep;
  setStep: (step: FlowStep) => void;
  logs: string[];
  progress: number;
  onClose: () => void;
  onComplete: (report: CaseReport, created: CaseRecord) => void;
  runLogs: () => Promise<void>;
}) {
  const [form, setForm] = useState<CaseForm>({
    title: "",
    victim_name: "",
    incident_location: "",
    incident_date: new Date().toISOString().slice(0, 10),
    notes: "",
    priority: "HIGH"
  });
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [createdCase, setCreatedCase] = useState<CaseRecord | null>(null);
  const [busy, setBusy] = useState(false);

  async function createAndUpload() {
    setBusy(true);
    try {
      const created = await createCase({
        victim_name: form.victim_name || form.title || "Unknown victim",
        incident_location: form.incident_location || "Unknown location",
        incident_date: form.incident_date,
        notes: `${form.title ? `Case Title: ${form.title}\n` : ""}${form.notes}`
      });
      setCreatedCase(created);
      for (const item of evidenceTypes) {
        const file = files[item.key];
        if (!file) continue;
        await uploadEvidence(created.case_id, item.key, file, (value) => {
          setUploadProgress((prev) => ({ ...prev, [item.key]: value }));
        });
      }
      setStep("analysis");
      await analyzeCase(created.case_id);
      await runLogs();
      
      let isBackendComplete = false;
      for (let i = 0; i < 15; i++) {
        const data = await getAnalysisResults(created.case_id);
        if (data.status === "failed") {
          throw new Error(data.message || "Analysis failed on the backend");
        }
        if (data.status === "complete") {
          isBackendComplete = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 2000));
      }

      if (!isBackendComplete) {
        throw new Error("Backend analysis did not complete in time. Check the case again in a moment.");
      }
      const report = await getReport(created.case_id);
      onComplete(report, { ...created, status: "completed", risk_level: report.risk_level, risk_score: report.risk_score });
      setStep("results");
    } catch (error) {
      console.error("Investigation flow failed", error);
      alert(error instanceof Error ? error.message : "Investigation flow failed. Check the backend and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div className="fixed inset-0 z-40 grid place-items-center bg-slate-950/80 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div
            className="glass thin-scrollbar max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-lg p-5 md:p-7"
            initial={{ opacity: 0, scale: 0.92, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <Badge tone="violet">Investigation Workflow</Badge>
                <h2 className="mt-3 text-3xl font-black text-white">Create case and launch AI analysis</h2>
              </div>
              <Button variant="ghost" onClick={onClose}>Close</Button>
            </div>
            <StepHeader step={step} />

            <AnimatePresence mode="wait">
              {step === "case" ? (
                <motion.div key="case" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} className="mt-6 grid gap-4 md:grid-cols-2">
                  <Field label="Case Title"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Operation Midnight Route" /></Field>
                  <Field label="Victim Name"><Input value={form.victim_name} onChange={(e) => setForm({ ...form, victim_name: e.target.value })} placeholder="Victim name" /></Field>
                  <Field label="Incident Location"><Input value={form.incident_location} onChange={(e) => setForm({ ...form, incident_location: e.target.value })} placeholder="City, scene, landmark" /></Field>
                  <Field label="Incident Date"><Input type="date" value={form.incident_date} onChange={(e) => setForm({ ...form, incident_date: e.target.value })} /></Field>
                  <Field label="Priority Level">
                    <select className="h-11 w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 text-sm text-white outline-none" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                      <option>HIGH</option>
                      <option>MEDIUM</option>
                      <option>LOW</option>
                    </select>
                  </Field>
                  <Field label="Investigation Notes" className="md:col-span-2"><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Initial narrative, last-seen details, scene notes, witness hints..." /></Field>
                  <div className="md:col-span-2 flex justify-end gap-3">
                    <Button variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button onClick={() => setStep("upload")}>Next Step <ChevronRight className="h-4 w-4" /></Button>
                  </div>
                </motion.div>
              ) : null}

              {step === "upload" ? (
                <motion.div key="upload" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} className="mt-6">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {evidenceTypes.map((type) => (
                      <label key={type.key} className="group relative cursor-pointer overflow-hidden rounded-3xl border border-dashed border-cyan-300/25 bg-cyan-300/[0.04] p-5 transition hover:border-cyan-200/60">
                        <input type="file" accept={type.accept} className="hidden" onChange={(e) => setFiles((prev) => ({ ...prev, [type.key]: e.target.files?.[0] || null }))} />
                        <div className="flex items-center gap-3">
                          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-cyan-300/10"><type.icon className="h-5 w-5 text-cyan-200" /></div>
                          <div>
                            <p className="font-semibold text-white">{type.label}</p>
                            <p className="text-xs text-slate-400">{files[type.key]?.name || "Drop or choose file"}</p>
                          </div>
                        </div>
                        <div className="mt-5"><Progress value={uploadProgress[type.key] || (files[type.key] ? 28 : 0)} /></div>
                      </label>
                    ))}
                  </div>
                  <div className="mt-6 flex justify-end gap-3">
                    <Button variant="secondary" onClick={() => setStep("case")}>Back</Button>
                    <Button disabled={busy} onClick={createAndUpload}>{busy ? "Launching AI..." : "Upload & Analyze"} <Sparkles className="h-4 w-4" /></Button>
                  </div>
                </motion.div>
              ) : null}

              {step === "analysis" ? (
                <motion.div key="analysis" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-6 grid gap-6 lg:grid-cols-[.8fr_1.2fr]">
                  <div className="relative grid min-h-96 place-items-center overflow-hidden rounded-lg border border-slate-700 bg-slate-950/50">
                    <div className="absolute text-center">
                      <BrainCircuit className="mx-auto h-12 w-12 text-sky-300" />
                      <p className="mt-4 text-4xl font-black">{progress}%</p>
                      <p className="text-sm text-slate-400">AI forensic scan</p>
                    </div>
                  </div>
                  <Card>
                    <CardHeader><CardTitle>Streaming AI Logs</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                      <Progress value={progress} tone="violet" />
                      {logs.map((log) => (
                        <motion.div key={log} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-sm text-cyan-100">
                          <span className="mr-2 text-emerald-300">OK</span>{log}
                        </motion.div>
                      ))}
                    </CardContent>
                  </Card>
                </motion.div>
              ) : null}

              {step === "results" ? (
                <motion.div key="results" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="mt-6">
                  <Card className="border-emerald-300/20 bg-emerald-300/8">
                    <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
                      <div>
                        <p className="text-2xl font-black text-white">Analysis complete</p>
                        <p className="mt-1 text-sm text-slate-300">The new case is now loaded into the command dashboard.</p>
                      </div>
                      <Button onClick={onClose}>View Dashboard</Button>
                    </CardContent>
                  </Card>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function StepHeader({ step }: { step: FlowStep }) {
  const steps: Array<{ key: FlowStep; label: string }> = [
    { key: "case", label: "Case" },
    { key: "upload", label: "Evidence" },
    { key: "analysis", label: "AI Analysis" },
    { key: "results", label: "Results" }
  ];
  const activeIndex = steps.findIndex((item) => item.key === step);
  return (
    <div className="mt-6 grid gap-3 sm:grid-cols-4">
      {steps.map((item, index) => (
        <div key={item.key} className={cn("rounded-2xl border p-3 text-sm font-semibold", index <= activeIndex ? "border-cyan-300/35 bg-cyan-300/10 text-cyan-100" : "border-white/10 bg-white/[0.03] text-slate-400")}>
          {index + 1}. {item.label}
        </div>
      ))}
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={className}>
      <span className="mb-2 block text-sm font-semibold text-slate-200">{label}</span>
      {children}
    </label>
  );
}
