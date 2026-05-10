import { InvestigationGraph } from "@/components/InvestigationGraph";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Activity,
  AlertTriangle,
  BrainCircuit,
  Command,
  Database,
  Download,
  FileScan,
  LayoutDashboard,
  Map,
  MessageSquareText,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  Sparkles,
  Trash2,
  UploadCloud
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  analyzeCase,
  askQuestion,
  createCase,
  deleteCase,
  deleteEvidence,
  downloadEvidence,
  getAnalysisResults,
  getCases,
  getEvidence,
  getReport,
  getReportDocumentUrl,
  getReportMarkdownUrl,
  getRiskFlags,
  uploadEvidence,
  type EvidenceRecord,
  type QAMessage,
  type RiskFlag as ApiRiskFlag
} from "@/lib/api";
import { mockCases, mockReport } from "@/lib/mock-data";
import type { CaseRecord, CaseReport, TimelineEvent } from "@/lib/types";
import { cn, delay, formatDate } from "@/lib/utils";

const navItems = [
  { label: "Dashboard", icon: LayoutDashboard },
  { label: "Case Details", icon: FileScan },
  { label: "Narrative Graph", icon: Map },
  { label: "Evidence", icon: Database },
  { label: "AI Analysis", icon: BrainCircuit },
  { label: "Risk Engine", icon: ShieldAlert },
  { label: "Q&A", icon: MessageSquareText }
] as const;

const evidenceTypes = [
  { key: "autopsy", label: "Autopsy report", accept: ".pdf" },
  { key: "cctv", label: "CCTV logs", accept: ".csv,.txt,.log,.mp4" },
  { key: "metadata", label: "Metadata", accept: ".json,.csv,.txt" },
  { key: "image", label: "Images", accept: ".jpg,.jpeg,.png,.pdf" },
  { key: "gps", label: "GPS records", accept: ".csv,.txt,.log" }
];

type TabName = (typeof navItems)[number]["label"];
type FlowStep = "case" | "upload" | "analysis" | "results";

export default function App() {
  const [cases, setCases] = useState<CaseRecord[]>(mockCases);
  const [selectedCase, setSelectedCase] = useState<CaseReport>(mockReport);
  const [activeTab, setActiveTab] = useState<TabName>("Dashboard");
  const [flowOpen, setFlowOpen] = useState(false);
  const [flowStep, setFlowStep] = useState<FlowStep>("case");
  const [logs, setLogs] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    refreshCases();
  }, []);

  async function refreshCases() {
    try {
      const items = await getCases();
      if (items.length) setCases(items);
    } catch (error) {
      console.error("Failed to load cases", error);
    }
  }

  async function loadCase(caseId: string, targetTab: TabName = "Case Details") {
    const record = cases.find((item) => item.case_id === caseId);
    try {
      const report = await getReport(caseId);
      setSelectedCase(report);
    } catch {
      if (record) setSelectedCase(reportFromCase(record));
    }
    setActiveTab(targetTab);
  }

  async function handleDeleteCase(caseId: string) {
    if (!confirm("Delete this case and all associated evidence?")) return;
    await deleteCase(caseId);
    await refreshCases();
    if (selectedCase.case_id === caseId) setSelectedCase(mockReport);
  }

  const timeline = selectedCase.structured_report?.timeline_analysis?.events || selectedCase.timeline || [];
  const intelligence = selectedCase.structured_report?.investigative_intelligence || selectedCase.investigative_intelligence;

  return (
    <div className="min-h-screen bg-[#111315] text-[#ECEFF1]">
      <div className="flex min-h-screen">
        <Sidebar activeTab={activeTab} onTabSelect={setActiveTab} />
        <main className="min-w-0 flex-1 px-4 py-4 md:px-6 lg:px-8">
          <Topbar onCreate={() => setFlowOpen(true)} selectedCase={selectedCase} />
          <section className="mt-5">
            {activeTab === "Dashboard" ? (
              <Dashboard cases={cases} selectedCase={selectedCase} onCreate={() => setFlowOpen(true)} onSelect={loadCase} onDelete={handleDeleteCase} />
            ) : activeTab === "Case Details" ? (
              <CaseDetails
                report={selectedCase}
                timeline={timeline}
                intelligence={intelligence}
                onOpenReport={() => window.open(getReportDocumentUrl(selectedCase.case_id), "_blank")}
                onReportReady={(report) => {
                  setSelectedCase(report);
                  setCases((prev) => prev.map((item) => (
                    item.case_id === report.case_id
                      ? { ...item, status: report.status, risk_level: report.risk_level, risk_score: report.risk_score }
                      : item
                  )));
                }}
              />
            ) : activeTab === "Narrative Graph" ? (
              <InvestigationGraph caseId={selectedCase.case_id} />
            ) : activeTab === "Evidence" ? (
              <EvidenceTab caseId={selectedCase.case_id} onChanged={() => loadCase(selectedCase.case_id, "Evidence")} />
            ) : activeTab === "AI Analysis" ? (
              <AIAnalysisTab report={selectedCase} timeline={timeline} />
            ) : activeTab === "Risk Engine" ? (
              <RiskEngineTab report={selectedCase} />
            ) : (
              <QAPage caseId={selectedCase.case_id} report={selectedCase} />
            )}
          </section>
        </main>
      </div>

      <CaseFlowDialog
        open={flowOpen}
        step={flowStep}
        setStep={setFlowStep}
        logs={logs}
        progress={progress}
        onClose={() => {
          setFlowOpen(false);
          setFlowStep("case");
          setLogs([]);
          setProgress(0);
        }}
        onComplete={(report, created) => {
          setSelectedCase(report);
          setCases((prev) => [created, ...prev.filter((item) => item.case_id !== created.case_id)]);
          setActiveTab("AI Analysis");
        }}
        runLogs={async () => {
          const steps = ["Parsing evidence", "Extracting forensic observations", "Reconstructing timeline", "Scoring risk flags", "Generating report"];
          setLogs([]);
          setProgress(0);
          for (let index = 0; index < steps.length; index += 1) {
            await delay(450);
            setLogs((prev) => [...prev, steps[index]]);
            setProgress(Math.round(((index + 1) / steps.length) * 100));
          }
        }}
      />
    </div>
  );
}

function Sidebar({ activeTab, onTabSelect }: { activeTab: TabName; onTabSelect: (tab: TabName) => void }) {
  return (
    <aside className="hidden w-72 shrink-0 border-r border-[#2A3138] bg-[#171A1D] p-5 lg:block">
      <div className="flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-lg border border-[#31363D] bg-[#1E2328]">
          <Command className="h-5 w-5 text-[#C9D4C0]" />
        </div>
        <div>
          <p className="text-lg font-semibold text-white">ForensiAI</p>
          <p className="text-xs text-[#A8B0B8]">Command Center</p>
        </div>
      </div>
      <nav className="mt-8 space-y-2">
        {navItems.map((item) => (
          <button
            key={item.label}
            onClick={() => onTabSelect(item.label)}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm font-semibold text-[#A8B0B8] transition hover:bg-[#23272D] hover:text-white",
              activeTab === item.label && "bg-[#23272D] text-[#ECEFF1] ring-1 ring-[#31363D]"
            )}
          >
            <item.icon className="h-5 w-5" />
            {item.label}
          </button>
        ))}
      </nav>
      <div className="mt-8 rounded-lg border border-[#31363D] bg-[#1E2328] p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span className="h-2.5 w-2.5 rounded-full bg-[#7A8F6B]" />
          Backend Connected
        </div>
        <p className="mt-3 text-xs leading-5 text-[#A8B0B8]">Evidence, risk flags, structured report, and Q&A are backed by FastAPI.</p>
      </div>
    </aside>
  );
}

function Topbar({ onCreate, selectedCase }: { onCreate: () => void; selectedCase: CaseReport }) {
  return (
    <header className="sticky top-4 z-30 flex flex-col gap-3 rounded-lg border border-[#2A3138] bg-[#171A1D]/95 px-4 py-3 backdrop-blur md:flex-row md:items-center md:justify-between">
      <div className="flex min-w-0 flex-1 items-center gap-3 rounded-lg border border-[#31363D] bg-[#111315] px-3 py-2">
        <Search className="h-4 w-4 text-[#C9D4C0]" />
        <input className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#7D8790]" placeholder="Search case ID, evidence, timeline event..." />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone={selectedCase.risk_level === "HIGH" ? "red" : "green"}>{selectedCase.case_id}</Badge>
        <Button onClick={onCreate}><UploadCloud className="h-4 w-4" /> New Case</Button>
      </div>
    </header>
  );
}

function Dashboard({ cases, selectedCase, onCreate, onSelect, onDelete }: {
  cases: CaseRecord[];
  selectedCase: CaseReport;
  onCreate: () => void;
  onSelect: (caseId: string) => void;
  onDelete: (caseId: string) => void;
}) {
  const metrics = useMemo(() => {
    const active = cases.filter((item) => !["completed", "archived"].includes(item.status.toLowerCase())).length;
    const high = cases.filter((item) => item.risk_level === "HIGH").length;
    return [
      { label: "Cases", value: cases.length, icon: Database },
      { label: "Active", value: active, icon: Activity },
      { label: "High Risk", value: high, icon: AlertTriangle },
      { label: "Selected Score", value: Math.round(selectedCase.risk_score || 0), icon: ShieldAlert }
    ];
  }, [cases, selectedCase.risk_score]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-4 rounded-lg border border-[#2A3138] bg-[#171A1D] p-5 md:flex-row md:items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#C9D4C0]">Operations Queue</p>
          <h1 className="mt-2 text-2xl font-semibold">Dashboard</h1>
          <p className="mt-1 text-sm text-[#A8B0B8]">Open a case, upload evidence, run analysis, and ask report-grounded questions.</p>
        </div>
        <Button onClick={onCreate}><Sparkles className="h-4 w-4" /> Launch Investigation Flow</Button>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        {metrics.map((metric) => (
          <Card key={metric.label}>
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="text-2xl font-semibold">{metric.value}</p>
                <p className="mt-1 text-xs uppercase tracking-[0.14em] text-[#A8B0B8]">{metric.label}</p>
              </div>
              <metric.icon className="h-5 w-5 text-[#C9D4C0]" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader><CardTitle>Investigations</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-y border-[#2A3138] bg-[#1E2328] text-xs uppercase tracking-[0.12em] text-[#A8B0B8]">
                <tr>
                  <th className="px-4 py-3">Case</th>
                  <th className="px-4 py-3">Victim / Location</th>
                  <th className="px-4 py-3">Risk</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2A3138]">
                {cases.map((item) => (
                  <tr key={item.case_id} className="cursor-pointer hover:bg-[#1E2328]" onClick={() => onSelect(item.case_id)}>
                    <td className="px-4 py-3 font-mono text-xs font-semibold">{item.case_id}</td>
                    <td className="px-4 py-3">
                      <p>{item.victim_name}</p>
                      <p className="text-xs text-[#A8B0B8]">{item.incident_location}</p>
                    </td>
                    <td className="px-4 py-3"><RiskBadge level={item.risk_level} /></td>
                    <td className="px-4 py-3"><Badge tone="slate">{item.status}</Badge></td>
                    <td className="px-4 py-3 text-[#A8B0B8]">{formatDate(item.created_at || item.incident_date)}</td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" className="h-9 w-9 px-0" onClick={(event) => { event.stopPropagation(); onDelete(item.case_id); }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function CaseDetails({ report, timeline, intelligence, onOpenReport, onReportReady }: {
  report: CaseReport;
  timeline: TimelineEvent[];
  intelligence?: CaseReport["investigative_intelligence"];
  onOpenReport: () => void;
  onReportReady: (report: CaseReport) => void;
}) {
  const [cctvFile, setCctvFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  async function uploadCctvVideo() {
    if (!cctvFile) return;
    setUploading(true);
    setStatusMessage("");
    try {
      await uploadEvidence(report.case_id, "cctv", cctvFile, setUploadProgress);
      setStatusMessage(`Uploaded CCTV evidence: ${cctvFile.name}`);
      setCctvFile(null);
      setUploadProgress(0);
    } catch (error) {
      console.error("CCTV upload failed", error);
      setStatusMessage("CCTV upload failed. Check the backend and try again.");
    } finally {
      setUploading(false);
    }
  }

  async function generateReport() {
    setGenerating(true);
    setStatusMessage("Generating investigation report...");
    try {
      if (report.status !== "completed") {
        await analyzeCase(report.case_id);
        for (let index = 0; index < 30; index += 1) {
          const result = await getAnalysisResults(report.case_id);
          if (result.status === "failed") throw new Error(result.message || "Analysis failed");
          if (result.status === "complete") break;
          await delay(1500);
        }
      }
      const refreshed = await getReport(report.case_id);
      onReportReady(refreshed);
      setStatusMessage("Report generated and refreshed.");
    } catch (error) {
      console.error("Report generation failed", error);
      setStatusMessage(error instanceof Error ? error.message : "Report generation failed.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="grid gap-5 p-5 lg:grid-cols-[1.2fr_.8fr]">
          <div>
            <Badge tone={report.risk_level === "HIGH" ? "red" : "green"}>Risk {report.risk_score}/100</Badge>
            <h1 className="mt-4 text-3xl font-semibold">{report.victim_name}</h1>
            <p className="mt-2 text-[#A8B0B8]">{report.case_id} at {report.incident_location} on {report.incident_date}</p>
            <p className="mt-4 leading-7 text-[#C9CED3]">{intelligence?.crime_story || report.summary || "Run analysis to generate a structured investigation summary."}</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button disabled={generating} onClick={generateReport}>
                <Sparkles className="h-4 w-4" /> {generating ? "Generating..." : "Generate Report"}
              </Button>
              <Button variant="secondary" onClick={onOpenReport}>
                <FileScan className="h-4 w-4" /> Open Report
              </Button>
              <Button variant="secondary" onClick={() => window.open(getReportMarkdownUrl(report.case_id), "_blank")}>
                <Download className="h-4 w-4" /> Download Report
              </Button>
            </div>
            {statusMessage ? <p className="mt-3 text-sm text-[#C9D4C0]">{statusMessage}</p> : null}
          </div>
          <div className="rounded-lg border border-[#31363D] bg-[#111315] p-4">
            <p className="text-sm font-semibold">Priority Leads</p>
            <List items={intelligence?.priority_leads || report.recommendations || []} empty="No leads generated yet." />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Add CCTV Video</CardTitle>
          <p className="mt-1 text-sm text-[#A8B0B8]">Attach CCTV footage directly to this case, then generate the report from the same screen.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <Field label="CCTV video file">
              <Input type="file" accept=".mp4,.mov,.avi,.mkv,.webm,.csv,.txt,.log" onChange={(event) => setCctvFile(event.target.files?.[0] || null)} />
            </Field>
            <Button disabled={!cctvFile || uploading} onClick={uploadCctvVideo}>
              <UploadCloud className="h-4 w-4" /> {uploading ? "Uploading..." : "Upload CCTV"}
            </Button>
          </div>
          {uploadProgress ? <Progress value={uploadProgress} /> : null}
          <p className="text-xs leading-5 text-[#A8B0B8]">Uploaded CCTV files appear in the Evidence tab and are included when the analysis pipeline runs.</p>
        </CardContent>
      </Card>
      <TimelinePanel events={timeline} />
    </div>
  );
}

function EvidenceTab({ caseId, onChanged }: { caseId: string; onChanged: () => void }) {
  const [items, setItems] = useState<EvidenceRecord[]>([]);
  const [fileType, setFileType] = useState("autopsy");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  useEffect(() => {
    refreshEvidence();
  }, [caseId]);

  async function refreshEvidence() {
    try {
      setItems(await getEvidence(caseId));
    } catch (error) {
      console.error("Failed to load evidence", error);
      setItems([]);
    }
  }

  async function handleUpload() {
    if (!file) return;
    setBusy(true);
    try {
      await uploadEvidence(caseId, fileType, file, setUploadProgress);
      setFile(null);
      setUploadProgress(0);
      await refreshEvidence();
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(fileId: number) {
    if (!confirm("Delete this evidence file?")) return;
    await deleteEvidence(caseId, fileId);
    await refreshEvidence();
    onChanged();
  }

  return (
    <div className="space-y-5">
      <SectionTitle title="Evidence" subtitle="Files are fetched from the backend and can be downloaded or removed from the case." />
      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-[220px_1fr_auto] md:items-end">
          <Field label="Evidence Type">
            <select value={fileType} onChange={(event) => setFileType(event.target.value)} className="h-11 w-full rounded-xl border border-[#31363D] bg-[#1A1D21] px-3 text-sm">
              {evidenceTypes.map((type) => <option key={type.key} value={type.key}>{type.label}</option>)}
            </select>
          </Field>
          <Field label="File">
            <Input type="file" accept={evidenceTypes.find((type) => type.key === fileType)?.accept} onChange={(event) => setFile(event.target.files?.[0] || null)} />
          </Field>
          <Button disabled={!file || busy} onClick={handleUpload}><UploadCloud className="h-4 w-4" /> Upload</Button>
          {uploadProgress ? <div className="md:col-span-3"><Progress value={uploadProgress} /></div> : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Case Files</CardTitle>
          <Button variant="ghost" onClick={refreshEvidence}><RefreshCw className="h-4 w-4" /> Refresh</Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="flex flex-col gap-3 rounded-lg border border-[#31363D] bg-[#111315] p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-semibold">{item.file_name}</p>
                <p className="mt-1 text-xs text-[#A8B0B8]">{item.file_type} · uploaded {formatDate(item.uploaded_at)} · {item.processed ? "processed" : "pending"}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => downloadEvidence(caseId, item.id, item.file_name)}><Download className="h-4 w-4" /> Download</Button>
                <Button variant="danger" onClick={() => handleDelete(item.id)}><Trash2 className="h-4 w-4" /> Delete</Button>
              </div>
            </div>
          ))}
          {!items.length ? <EmptyState text="No evidence files uploaded for this case yet." /> : null}
        </CardContent>
      </Card>
    </div>
  );
}

function AIAnalysisTab({ report, timeline }: { report: CaseReport; timeline: TimelineEvent[] }) {
  const structured = report.structured_report;
  const autopsy = structured?.autopsy_findings;
  const correlation = structured?.correlation_analysis;
  const summary = structured?.investigation_summary;
  return (
    <div className="space-y-5">
      <SectionTitle title="AI Analysis" subtitle="Autopsy findings, timeline reconstruction, and correlation signals from the structured report." />
      <div className="grid gap-5 xl:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Autopsy Findings</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Fact label="Cause" value={autopsy?.cause_of_death || report.cause_of_death || "Under investigation"} />
            <Fact label="Manner" value={autopsy?.manner_of_death || report.manner_of_death || "Not determined"} />
            <Fact label="Confidence" value={`${Math.round((autopsy?.confidence || 0) * 100)}%`} />
            <List items={autopsy?.injuries || report.injuries || []} empty="No structured injuries available." />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Correlation</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <List title="Anomalies" items={correlation?.anomalies || report.anomalies || []} empty="No anomalies recorded." />
            <List title="Suspicious Patterns" items={correlation?.suspicious_patterns || report.suspicious_patterns || []} empty="No suspicious patterns recorded." />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Investigation Summary</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm leading-6 text-[#C9CED3]">{summary?.summary || report.summary || "Run analysis to generate summary."}</p>
            <List title="Recommendations" items={summary?.recommendations || report.recommendations || []} empty="No recommendations generated." />
          </CardContent>
        </Card>
      </div>
      <TimelinePanel events={timeline} />
    </div>
  );
}

function RiskEngineTab({ report }: { report: CaseReport }) {
  const [flags, setFlags] = useState<ApiRiskFlag[]>([]);
  const risk = report.structured_report?.risk_assessment;
  const score = Math.round(risk?.risk_score || report.risk_score || 0);
  const recommendations = report.structured_report?.investigation_summary?.recommendations || report.recommendations || [];

  useEffect(() => {
    getRiskFlags(report.case_id).then(setFlags).catch(() => setFlags([]));
  }, [report.case_id]);

  const displayedFlags = flags.length ? flags.map((flag) => ({
    name: flag.flag_name,
    description: flag.description,
    score: flag.score
  })) : (risk?.flags || report.flags || []);

  return (
    <div className="space-y-5">
      <SectionTitle title="Risk Engine" subtitle="Risk score, triggered flags, and investigator recommendations from deterministic and AI-assisted analysis." />
      <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
        <Card>
          <CardContent className="p-6">
            <div className="mx-auto grid h-56 w-56 place-items-center rounded-full border-[14px] border-[#31363D]" style={{ borderTopColor: riskColor(score), borderRightColor: riskColor(score) }}>
              <div className="text-center">
                <p className="text-5xl font-semibold">{score}</p>
                <p className="mt-1 text-xs uppercase tracking-[0.16em] text-[#A8B0B8]">{risk?.risk_level || report.risk_level}</p>
              </div>
            </div>
            <div className="mt-6">
              <Progress value={score} tone={score >= 75 ? "red" : "cyan"} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Triggered Flags</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {displayedFlags.map((flag) => (
              <div key={`${flag.name}-${flag.score}`} className="rounded-lg border border-[#31363D] bg-[#111315] p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold">{flag.name}</p>
                  <Badge tone="red">+{Math.round(flag.score)}</Badge>
                </div>
                <p className="mt-2 text-sm leading-6 text-[#A8B0B8]">{flag.description}</p>
              </div>
            ))}
            {!displayedFlags.length ? <EmptyState text="No risk flags have been triggered yet." /> : null}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle>Recommendations</CardTitle></CardHeader>
        <CardContent><List items={recommendations} empty="No recommendations available." /></CardContent>
      </Card>
    </div>
  );
}

function QAPage({ caseId, report }: { caseId: string; report: CaseReport }) {
  const [messages, setMessages] = useState<QAMessage[]>([
    { role: "assistant", content: `Ask about ${report.case_id}: autopsy findings, risk flags, timeline, anomalies, or recommendations.` }
  ]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);

  async function submitQuestion() {
    const trimmed = question.trim();
    if (!trimmed) return;
    setQuestion("");
    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setBusy(true);
    try {
      const response = await askQuestion(caseId, trimmed);
      setMessages((prev) => [...prev, { role: "assistant", content: `${response.answer}\n\nSources: ${response.sources.join(", ") || "case data"}` }]);
    } catch (error) {
      setMessages((prev) => [...prev, { role: "assistant", content: "I could not reach the Q&A endpoint for this case." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <SectionTitle title="AI Q&A" subtitle="Grounded chat over the selected case report. Responses are advisory and should be checked against source evidence." />
      <Card>
        <CardContent className="space-y-4">
          <div className="h-[52vh] space-y-3 overflow-y-auto rounded-lg border border-[#31363D] bg-[#111315] p-4">
            {messages.map((message, index) => (
              <div key={index} className={cn("max-w-3xl rounded-lg p-3 text-sm leading-6", message.role === "user" ? "ml-auto bg-[#7A8F6B] text-[#111315]" : "bg-[#23272D] text-[#ECEFF1]")}>
                {message.content}
              </div>
            ))}
          </div>
          <div className="flex gap-3">
            <Input value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") submitQuestion(); }} placeholder="Ask about risk, timeline, autopsy findings, or next actions..." />
            <Button disabled={busy} onClick={submitQuestion}><Send className="h-4 w-4" /> Ask</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function TimelinePanel({ events }: { events: TimelineEvent[] }) {
  return (
    <Card>
      <CardHeader><CardTitle>Timeline</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {events.map((event, index) => (
          <div key={`${event.timestamp}-${index}`} className="border-l border-[#7A8F6B]/45 pl-4">
            <div className="rounded-lg border border-[#31363D] bg-[#111315] p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={event.severity === "high" ? "red" : "cyan"}>{event.source}</Badge>
                <span className="text-xs text-[#A8B0B8]">{formatDate(event.timestamp)}</span>
              </div>
              <p className="mt-2 text-sm">{event.event}</p>
            </div>
          </div>
        ))}
        {!events.length ? <EmptyState text="No timeline events available yet." /> : null}
      </CardContent>
    </Card>
  );
}

function CaseFlowDialog({ open, step, setStep, logs, progress, onClose, onComplete, runLogs }: {
  open: boolean;
  step: FlowStep;
  setStep: (step: FlowStep) => void;
  logs: string[];
  progress: number;
  onClose: () => void;
  onComplete: (report: CaseReport, created: CaseRecord) => void;
  runLogs: () => Promise<void>;
}) {
  const [form, setForm] = useState({ victim_name: "", incident_location: "", incident_date: new Date().toISOString().slice(0, 10), notes: "" });
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [busy, setBusy] = useState(false);

  async function createAndAnalyze() {
    setBusy(true);
    try {
      const created = await createCase(form);
      for (const type of evidenceTypes) {
        const file = files[type.key];
        if (file) await uploadEvidence(created.case_id, type.key, file);
      }
      setStep("analysis");
      await analyzeCase(created.case_id);
      await runLogs();
      for (let index = 0; index < 20; index += 1) {
        const result = await getAnalysisResults(created.case_id);
        if (result.status === "failed") throw new Error(result.message || "Analysis failed");
        if (result.status === "complete") break;
        await delay(1500);
      }
      const report = await getReport(created.case_id);
      onComplete(report, { ...created, status: "completed", risk_level: report.risk_level, risk_score: report.risk_score });
      setStep("results");
    } catch (error) {
      alert(error instanceof Error ? error.message : "Investigation flow failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/70 p-4">
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-lg border border-[#31363D] bg-[#171A1D] p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Badge tone="green">Investigation Workflow</Badge>
            <h2 className="mt-3 text-2xl font-semibold">Create case and run analysis</h2>
          </div>
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-4">
          {(["case", "upload", "analysis", "results"] as FlowStep[]).map((item) => <Badge key={item} tone={step === item ? "green" : "slate"}>{item}</Badge>)}
        </div>
        {step === "case" ? (
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Field label="Victim Name"><Input value={form.victim_name} onChange={(event) => setForm({ ...form, victim_name: event.target.value })} /></Field>
            <Field label="Incident Location"><Input value={form.incident_location} onChange={(event) => setForm({ ...form, incident_location: event.target.value })} /></Field>
            <Field label="Incident Date"><Input type="date" value={form.incident_date} onChange={(event) => setForm({ ...form, incident_date: event.target.value })} /></Field>
            <Field label="Notes" className="md:col-span-2"><Textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></Field>
            <div className="md:col-span-2 flex justify-end"><Button onClick={() => setStep("upload")}>Next</Button></div>
          </div>
        ) : null}
        {step === "upload" ? (
          <div className="mt-5 space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              {evidenceTypes.map((type) => (
                <Field key={type.key} label={type.label}>
                  <Input type="file" accept={type.accept} onChange={(event) => setFiles((prev) => ({ ...prev, [type.key]: event.target.files?.[0] || null }))} />
                </Field>
              ))}
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setStep("case")}>Back</Button>
              <Button disabled={busy} onClick={createAndAnalyze}>{busy ? "Running..." : "Upload & Analyze"}</Button>
            </div>
          </div>
        ) : null}
        {step === "analysis" ? (
          <div className="mt-5 space-y-3">
            <Progress value={progress} />
            {logs.map((log) => <div key={log} className="rounded-lg border border-[#31363D] bg-[#111315] p-3 text-sm">{log}</div>)}
          </div>
        ) : null}
        {step === "results" ? (
          <Card className="mt-5 border-[#7A8F6B]/45"><CardContent><p className="text-lg font-semibold">Analysis complete. The case is loaded in AI Analysis.</p><Button className="mt-4" onClick={onClose}>Close</Button></CardContent></Card>
        ) : null}
      </div>
    </div>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="rounded-lg border border-[#2A3138] bg-[#171A1D] p-5">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-1 text-sm text-[#A8B0B8]">{subtitle}</p>
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return <label className={className}><span className="mb-2 block text-sm font-semibold">{label}</span>{children}</label>;
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-[#31363D] bg-[#111315] p-3"><p className="text-xs uppercase tracking-[0.14em] text-[#A8B0B8]">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div>;
}

function List({ title, items, empty }: { title?: string; items: string[]; empty: string }) {
  return (
    <div className="mt-3">
      {title ? <p className="mb-2 text-sm font-semibold">{title}</p> : null}
      <div className="space-y-2">
        {items.map((item) => <div key={item} className="rounded-lg border border-[#31363D] bg-[#111315] p-3 text-sm leading-6 text-[#C9CED3]">{item}</div>)}
        {!items.length ? <p className="text-sm text-[#A8B0B8]">{empty}</p> : null}
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-lg border border-dashed border-[#31363D] bg-[#111315] p-6 text-center text-sm text-[#A8B0B8]">{text}</div>;
}

function RiskBadge({ level }: { level: string }) {
  return <Badge tone={level === "HIGH" ? "red" : level === "MEDIUM" ? "yellow" : "green"}>{level || "LOW"}</Badge>;
}

function riskColor(score: number) {
  if (score >= 75) return "#A35D5D";
  if (score >= 45) return "#B08D57";
  return "#7A8F6B";
}

function reportFromCase(item: CaseRecord): CaseReport {
  return {
    case_id: item.case_id,
    victim_name: item.victim_name,
    incident_location: item.incident_location,
    incident_date: item.incident_date,
    status: item.status,
    risk_level: item.risk_level,
    risk_score: item.risk_score,
    case_notes: item.notes,
    timeline: [],
    flags: [],
    recommendations: []
  };
}
