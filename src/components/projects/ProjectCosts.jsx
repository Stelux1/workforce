import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Plus, Trash2, DollarSign } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

const CATEGORIES = {
  materials: "Materijali",
  equipment: "Oprema",
  subcontractor: "Podizvođač",
  travel: "Putovanje",
  accommodation: "Smeštaj",
  utilities: "Komunalne usluge",
  other: "Ostalo"
};

export default function ProjectCosts({ projectId }) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({ description: "", amount: "", category: "materials", notes: "" });

  const { data: costs = [], isLoading } = useQuery({
    queryKey: ["project-costs", projectId],
    queryFn: () => base44.entities.ProjectCost.filter({ project_id: projectId }),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.ProjectCost.create({ ...data, project_id: projectId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-costs", projectId] });
      setFormData({ description: "", amount: "", category: "materials", notes: "" });
      setDialogOpen(false);
      toast.success("Trošak je dodan");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.ProjectCost.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-costs", projectId] });
      toast.success("Trošak je obrisan");
    },
  });

  const handleAddCost = async () => {
    if (!formData.description || !formData.amount) {
      toast.error("Popunite sve obavezne polje");
      return;
    }
    createMutation.mutate({
      description: formData.description,
      amount: parseFloat(formData.amount),
      category: formData.category,
      notes: formData.notes,
    });
  };

  const totalCosts = costs.reduce((sum, cost) => sum + (cost.amount || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-primary" /> Projektni Troškovi
          </h3>
          <p className="text-sm text-muted-foreground">Upravljajte troškovima projekta</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Dodaj Trošak
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
        </div>
      ) : costs.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">Nema unetih troškova</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {costs.map((cost) => (
            <Card key={cost.id} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-medium">{cost.description}</h4>
                    <span className="text-xs px-2 py-1 rounded bg-secondary text-secondary-foreground">
                      {CATEGORIES[cost.category] || cost.category}
                    </span>
                  </div>
                  {cost.notes && <p className="text-sm text-muted-foreground">{cost.notes}</p>}
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <div className="text-right">
                    <p className="text-lg font-semibold text-primary">{cost.amount.toFixed(2)}€</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteMutation.mutate(cost.id)}
                    disabled={deleteMutation.isPending}
                    className="text-destructive hover:text-destructive/80"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
          <Card className="p-4 bg-primary/5 border-primary/20">
            <div className="flex items-center justify-between">
              <span className="font-semibold">Ukupno Projektnih Troškova:</span>
              <span className="text-2xl font-bold text-primary">{totalCosts.toFixed(2)}€</span>
            </div>
          </Card>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Dodaj Projektni Trošak</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Opis *</Label>
              <Input
                placeholder="npr. Kupovina materijala"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Iznos (€) *</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Kategorija</Label>
              <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORIES).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Napomene</Label>
              <Input
                placeholder="Dodatne napomene (opciono)"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Otkaži</Button>
            <Button onClick={handleAddCost} disabled={createMutation.isPending}>Dodaj</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}