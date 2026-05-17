import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAppStore } from '@/store/useAppStore';
import { formatPower } from '@/utils/calculations';
import { exportLocationToExcel } from '@/utils/export';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';

export function LocationView() {
  const { projectId, locationId } = useParams<{ projectId: string; locationId: string }>();
  const navigate = useNavigate();
  const pId = Number(projectId);
  const lId = Number(locationId);
  const { panels, setPanels, setSelection, setLocations } = useAppStore();
  const [locationName, setLocationName] = useState('');
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [newPanelName, setNewPanelName] = useState('');
  const [exporting, setExporting] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const locs = await window.bilpow.locations.getByProject(pId);
      setLocations(locs);
      const loc = locs.find((l) => l.id === lId);
      if (loc) setLocationName(loc.name);
      const pnl = await window.bilpow.panels.getByLocation(lId);
      setPanels(pnl);
      setSelection({ type: 'location', projectId: pId, locationId: lId, panelId: null });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur');
    }
  }, [pId, lId, setLocations, setPanels, setSelection]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useKeyboardShortcuts({
    onExport: () => void handleExport(),
  });

  const saveLocationName = async (name: string) => {
    try {
      await window.bilpow.locations.update({ id: lId, name });
      toast.success('Localisation mise à jour');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur');
    }
  };

  const handleAddPanel = async () => {
    if (!newPanelName.trim()) {
      toast.error('Le nom est requis');
      return;
    }
    try {
      await window.bilpow.panels.create({ location_id: lId, name: newPanelName.trim() });
      setNewPanelName('');
      setShowAddPanel(false);
      await loadData();
      toast.success('Tableau ajouté');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur');
    }
  };

  const openPanel = (panelId: number) => {
    setSelection({ type: 'panel', projectId: pId, locationId: lId, panelId });
    navigate(`/project/${pId}/location/${lId}/panel/${panelId}`);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const filePath = await exportLocationToExcel(lId);
      if (filePath) {
        toast.success(`Export réussi: ${filePath}`);
        await window.bilpow.shell.openPath(filePath);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur d\'export');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex-1">
            <input
              type="text"
              value={locationName}
              onChange={(e) => setLocationName(e.target.value)}
              onBlur={(e) => void saveLocationName(e.target.value)}
              className="text-2xl font-bold text-primary dark:text-white bg-transparent border-b-2 border-transparent hover:border-gray-300 focus:border-accent outline-none w-full max-w-md"
            />
            <p className="text-sm text-gray-500 mt-1">
              {panels.length} tableau{panels.length !== 1 ? 'x' : ''}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void handleExport()}
              disabled={exporting || panels.length === 0}
              className="btn-secondary text-sm"
            >
              {exporting ? 'Export...' : '📊 Exporter Excel'}
            </button>
            <button
              type="button"
              onClick={() => setShowAddPanel(true)}
              className="btn-primary text-sm"
            >
              + Ajouter un tableau
            </button>
          </div>
        </div>

        {panels.length === 0 ? (
          <div className="card p-12 text-center text-gray-400">
            Aucun tableau. Ajoutez un tableau pour commencer le bilan.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {panels.map((panel) => (
              <div
                key={panel.id}
                className="card p-5 hover:shadow-md transition-all cursor-pointer border-2 border-transparent hover:border-accent/30"
                onClick={() => openPanel(panel.id)}
              >
                <h3 className="font-semibold text-primary dark:text-white mb-2">
                  ⚡ {panel.name}
                </h3>
                <div className="space-y-1 text-sm text-gray-500 dark:text-gray-400">
                  <p>{panel.element_count} élément{panel.element_count !== 1 ? 's' : ''}</p>
                  <p>P. installée: {formatPower(panel.installed_power_w)}</p>
                  <p>P. absorbée: {formatPower(panel.absorbed_power_w)}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {showAddPanel && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="card p-6 w-full max-w-sm mx-4">
              <h3 className="font-semibold mb-3">Nouveau tableau</h3>
              <input
                type="text"
                value={newPanelName}
                onChange={(e) => setNewPanelName(e.target.value)}
                className="input-field mb-4"
                placeholder="Ex: TGBT, TD01..."
                autoFocus
              />
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowAddPanel(false)}
                  className="btn-secondary"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={() => void handleAddPanel()}
                  className="btn-primary"
                >
                  Ajouter
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
