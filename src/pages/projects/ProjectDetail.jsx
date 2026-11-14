import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, MapPin, Calendar, Edit, Trash2, Users, BarChart2 } from "lucide-react";
import { format } from "date-fns";
import { useT } from "@/lib/translations";
import { useLang } from "@/lib/LanguageContext";
import ProjectFormModal from "@/components/projects/ProjectFormModal";
import ProjectEmployees from "@/components/projects/ProjectEmployees";
import ProjectRoles from "@/components/projects/ProjectRoles";
import ProjectFinancialReport from "@/components/projects/ProjectFinancialReport";

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const STATUS_COLORS = {
  active: "bg-green-100 text-green-700 border-green-200",
  paused: "bg-yellow-100 text-yellow-700 border-yellow-200",
  completed: "bg-slate-100 text-slate-600 border-slate-200",
};

export default function ProjectDetail() {
  const t = useT();
  const { lang } = useLang();
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showEdit, setShowEdit] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  
  const getStatusLabel = () => {
    if (!project?.status) return "";
    const labels = { active: "Active", paused: "Paused", completed: "Completed" };
    const labelSr = { active: "Aktivan", paused: "Pauziran", completed: "Završen" };
    return (lang === "rs" ? labelSr : labels)[project.status] || project.status;
  };

  const validId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id || "");
  const { data: project, isLoading } = useQuery({
    queryKey: ["project", id],
    queryFn: () => base44.entities.Project.get(id),
    enabled: validId,
    retry: false,
  });

  const deleteMutation = useMutation({
    mutationFn: () => base44.entities.Project.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success(lang === "rs" ? "Projekat obrisan" : "Project deleted");
      navigate("/projects");
    },
  });

  if (validId && isLoading) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="h-8 w-48 bg-muted rounded animate-pulse mb-6" />
        <div className="h-40 bg-muted rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!project) {
    // Nepostojeći projekat (ranije: prazna stranica).
    return (
      <div className="max-w-md mx-auto text-center py-20 space-y-3">
        <h2 className="text-xl font-semibold">{lang === "rs" ? "Projekat nije pronađen" : "Project not found"}</h2>
        <p className="text-sm text-muted-foreground">{lang === "rs" ? "Projekat ne postoji ili je obrisan." : "The project does not exist or was deleted."}</p>
        <Button variant="outline" onClick={() => navigate("/projects")}>{lang === "rs" ? "Nazad na projekte" : "Back to projects"}</Button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate("/projects")}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-foreground">{project.name}</h1>
            <Badge className={`text-xs border ${STATUS_COLORS[project.status] || STATUS_COLORS.active}`}>
              {getStatusLabel()}
            </Badge>
          </div>
          {project.client_name && (
            <p className="text-muted-foreground text-sm mt-0.5">{project.client_name}</p>
          )}
        </div>
        <div className="flex gap-2">
           <Button variant="outline" size="sm" onClick={() => setShowEdit(true)}>
             <Edit className="w-4 h-4" />
             {t("Edit") || "Uredi"}
           </Button>
           <AlertDialog>
             <AlertDialogTrigger asChild>
               <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10">
                 <Trash2 className="w-4 h-4" />
               </Button>
             </AlertDialogTrigger>
             <AlertDialogContent>
               <AlertDialogHeader>
                 <AlertDialogTitle>{t("Delete project") || "Obriši projekat?"}</AlertDialogTitle>
                 <AlertDialogDescription>
                   {t("This action is irreversible. Project") || "Ova akcija je nepovratna."} "{project.name}" {t("will be permanently deleted") || "će biti trajno obrisan"}.
                 </AlertDialogDescription>
               </AlertDialogHeader>
               <AlertDialogFooter>
                 <AlertDialogCancel>{t("Cancel") || "Odustani"}</AlertDialogCancel>
                 <AlertDialogAction onClick={() => deleteMutation.mutate()} className="bg-destructive hover:bg-destructive/90">
                   {t("Delete") || "Obriši"}
                 </AlertDialogAction>
               </AlertDialogFooter>
             </AlertDialogContent>
           </AlertDialog>
         </div>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {project.location && (
          <div className="bg-card border rounded-xl p-4 flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <MapPin className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">{t("Location") || "Lokacija"}</p>
              <p className="font-medium text-sm">{project.location}</p>
            </div>
          </div>
        )}
        {project.start_date && (
          <div className="bg-card border rounded-xl p-4 flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Calendar className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">{t("Start Date") || "Datum početka"}</p>
              <p className="font-medium text-sm">{format(new Date(project.start_date), "dd.MM.yyyy")}</p>
            </div>
          </div>
        )}
        {project.end_date && (
          <div className="bg-card border rounded-xl p-4 flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Calendar className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">{t("Due Date") || "Rok završetka"}</p>
              <p className="font-medium text-sm">{format(new Date(project.end_date), "dd.MM.yyyy")}</p>
            </div>
          </div>
        )}
      </div>

      {/* Description */}
      {project.description && (
        <div className="bg-card border rounded-xl p-5 mb-6">
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-2">{t("Description") || "Opis radova"}</h2>
          <p className="text-sm text-foreground whitespace-pre-wrap">{project.description}</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b mb-6">
        {[
          { key: "overview", label: lang === "rs" ? "Pregled" : "Overview" },
          { key: "financials", label: lang === "rs" ? "Finansijski izveštaj" : "Financial Report", icon: BarChart2 },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.icon && <tab.icon className="w-4 h-4" />}
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <>
          {/* Job Roles / Tariffs */}
          <div className="mb-6">
            <ProjectRoles project={project} onUpdated={() => queryClient.invalidateQueries({ queryKey: ["project", id] })} />
          </div>
          {/* Employees section */}
          <ProjectEmployees project={project} onUpdated={() => queryClient.invalidateQueries({ queryKey: ["project", id] })} />
        </>
      )}

      {activeTab === "financials" && (
        <ProjectFinancialReport project={project} />
      )}

      {showEdit && (
        <ProjectFormModal
          project={project}
          onClose={() => setShowEdit(false)}
          onSaved={() => {
            setShowEdit(false);
            queryClient.invalidateQueries({ queryKey: ["project", id] });
            queryClient.invalidateQueries({ queryKey: ["projects"] });
          }}
        />
      )}
    </div>
  );
}