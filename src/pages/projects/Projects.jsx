import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { readListParams } from "@/lib/listLinks";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, MapPin, Calendar, Users, FolderOpen, LayoutGrid, List } from "lucide-react";
import ProjectFormModal from "@/components/projects/ProjectFormModal";
import { format } from "date-fns";
import { useL } from "@/lib/translations";
import { useLang } from "@/lib/LanguageContext";
import { pageTitle } from "@/lib/pageTitles";
import { projectAddress } from "@/lib/projectSite";
import { workersByProject } from "@/lib/assignments";

const STATUS_LABELS = {
  active: { en: "Active", rs: "Aktivan", sk: "Aktívny" },
  paused: { en: "Paused", rs: "Pauziran", sk: "Pozastavený" },
  completed: { en: "Completed", rs: "Završen", sk: "Dokončený" },
};
const STATUS_COLORS = {
  active: "bg-green-100 text-green-700 border-green-200",
  paused: "bg-yellow-100 text-yellow-700 border-yellow-200",
  completed: "bg-slate-100 text-slate-600 border-slate-200",
};

export default function Projects() {
  const L = useL();
  const { lang } = useLang();
  const statusLabel = (s) => (STATUS_LABELS[s] ? L(STATUS_LABELS[s].en, STATUS_LABELS[s].rs, STATUS_LABELS[s].sk) : s);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // Dashboard vodi ovde sa ?status=active (src/lib/listLinks.js).
  const [searchParams] = useSearchParams();
  const [statusFilter, setStatusFilter] = useState(() => readListParams(searchParams).status || "all");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [view, setView] = useState("grid");
  const [sort, setSort] = useState("name_asc");

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list("-created_date"),
  });

  // Broj radnika iz jedine evidencije angažmana (važeći i predstojeći, svaki radnik jednom) — ne iz JSON keša (W2-K).
  const { data: assignments = [] } = useQuery({
    queryKey: ["project-assignments"],
    queryFn: () => base44.entities.ProjectAssignment.list("-start_date"),
  });
  const workerCount = useMemo(() => workersByProject(assignments, new Date().toISOString().slice(0, 10)), [assignments]);

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Project.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["projects"] }),
  });

  const filtered = projects
    .filter((p) => statusFilter === "all" || p.status === statusFilter)
    .filter((p) =>
      p.name?.toLowerCase().includes(search.toLowerCase()) ||
      p.client_name?.toLowerCase().includes(search.toLowerCase()) ||
      projectAddress(p).toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      if (sort === "name_asc") return (a.name || "").localeCompare(b.name || "");
      if (sort === "name_desc") return (b.name || "").localeCompare(a.name || "");
      return 0;
    });

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{pageTitle("Projects", lang)}</h1>
          <p className="text-muted-foreground text-sm mt-1">{L("Manage projects and employees", "Upravljanje projektima i zaposlenima", "Správa projektov a zamestnancov")}</p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="w-4 h-4" />
          {L("New project", "Novi projekat", "Nový projekt")}
        </Button>
      </div>

      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={L("Search projects...", "Pretraži projekte...", "Hľadať projekty...")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]" aria-label={L("Status", "Status", "Stav")}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{L("All statuses", "Svi statusi", "Všetky stavy")}</SelectItem>
            {Object.keys(STATUS_LABELS).map((s) => <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex items-center border rounded-lg overflow-hidden">
          <button
            onClick={() => setView("grid")}
            className={`p-2 transition-colors ${view === "grid" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"}`}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setView("list")}
            className={`p-2 transition-colors ${view === "list" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"}`}
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-48 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <FolderOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">{L("No projects", "Nema projekata", "Žiadne projekty")}</p>
          <p className="text-sm mt-1">{L("Add your first project with the button above", "Dodajte prvi projekat klikom na dugme gore", "Pridajte prvý projekt tlačidlom hore")}</p>
        </div>
      ) : view === "list" && filtered.length > 0 ? (
       <div className="flex items-center justify-end mb-4 gap-2">
         <Select value={sort} onValueChange={setSort}>
           <SelectTrigger className="w-40">
             <SelectValue placeholder={L("Sort", "Sortiraj", "Zoradiť")} />
           </SelectTrigger>
           <SelectContent>
             <SelectItem value="name_asc">{L("Name A → Z", "Naziv A → Z", "Názov A → Z")}</SelectItem>
             <SelectItem value="name_desc">{L("Name Z → A", "Naziv Z → A", "Názov Z → A")}</SelectItem>
           </SelectContent>
         </Select>
       </div>
      ) : null}

      {view === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((project) => (
            <div
              key={project.id}
              onClick={() => navigate(`/projects/${project.id}`)}
              className="bg-card border rounded-xl p-5 cursor-pointer hover:shadow-md transition-all hover:border-primary/40 group"
            >
              <div className="flex items-start justify-between mb-3">
                 <div className="min-w-0 flex-1">
                   <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-1">
                     {project.project_number && <span className="text-muted-foreground">[{project.project_number}]</span>} {project.name}
                   </h3>
                 </div>
                <Badge className={`text-xs border shrink-0 ml-2 ${STATUS_COLORS[project.status] || STATUS_COLORS.active}`}>
                  {statusLabel(project.status)}
                </Badge>
              </div>
              {project.client_name && (
                <p className="text-sm text-muted-foreground mb-2 font-medium">{project.client_name}</p>
              )}
              {projectAddress(project) && (
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-2">
                  <MapPin className="w-3.5 h-3.5 shrink-0" />
                  <span className="line-clamp-1">{projectAddress(project)}</span>
                </div>
              )}
              {(project.start_date || project.end_date) && (
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-3">
                  <Calendar className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {project.start_date ? format(new Date(project.start_date), "dd.MM.yyyy") : "—"}
                    {" → "}
                    {project.end_date ? format(new Date(project.end_date), "dd.MM.yyyy") : "—"}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground border-t pt-3 mt-2">
                <Users className="w-3.5 h-3.5" />
                <span>{workerCount.get(project.id) || 0} {L("employees", "zaposlenih", "zamestnancov")}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-card border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-4 py-3 font-medium">{L("Number", "Broj", "Číslo")}</th>
                  <th className="text-left px-4 py-3 font-medium">{L("Name", "Naziv", "Názov")}</th>
                  <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">{L("Client", "Klijent", "Klient")}</th>
                  <th className="text-left px-4 py-3 font-medium hidden md:table-cell">{L("Location", "Lokacija", "Miesto")}</th>
                  <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">{L("Dates", "Datumi", "Dátumy")}</th>
                  <th className="text-left px-4 py-3 font-medium">{L("Employees", "Zaposleni", "Zamestnanci")}</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((project) => (
                  <tr key={project.id} className="border-b hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => navigate(`/projects/${project.id}`)}>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{project.project_number || "—"}</td>
                    <td className="px-4 py-3 font-medium text-foreground group hover:text-primary transition-colors">{project.name}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{project.client_name || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                      {projectAddress(project) ? (
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5" />
                          <span>{projectAddress(project)}</span>
                        </div>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell">
                      {project.start_date || project.end_date ? (
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>
                            {project.start_date ? format(new Date(project.start_date), "dd.MM.yyyy") : "—"}
                            {" → "}
                            {project.end_date ? format(new Date(project.end_date), "dd.MM.yyyy") : "—"}
                          </span>
                        </div>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Users className="w-3.5 h-3.5" />
                        <span>{workerCount.get(project.id) || 0}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={`text-xs border ${STATUS_COLORS[project.status] || STATUS_COLORS.active}`}>
                        {statusLabel(project.status)}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
       )}

      {showForm && (
        <ProjectFormModal
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            queryClient.invalidateQueries({ queryKey: ["projects"] });
          }}
        />
      )}
    </div>
  );
}