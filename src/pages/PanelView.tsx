import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAppStore } from '@/store/useAppStore';
import { ElementTable } from '@/components/ElementTable';
import { AddElementModal } from '@/components/AddElementModal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import {
  panelInstalledPower,
  panelAbsorbedPower,
  calculationCurrent,
  recommendedBreakerAmps,
  formatPower,
  formatNumber,
} from '@/utils/calculations';
import type { Element } from '@/types';

export function PanelView() {
  const { projectId, locationId, panelId } = useParams<{
    projectId: string;
    locationId: string;
    panelId: string;
  }>();
  const pId = Number(projectId);
  const lId = Number(locationId);
  const panId = Number(panelId);

  const {
    elements,
    setElements,
    favorites,
    setFavorites,
    setSelection,
    setPanels,
  } = useAppStore();

  const [panelName, setPanelName] = useState('');
  const [panelDescription, setPanelDescription] = useState('');
  const [generalBreaker, setGeneralBreaker] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [editElement, setEditElement] = useState<Element | null>(null);
  const [deleteElementId, setDeleteElementId] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    try {
      const pnl = await window.bilpow.panels.getByLocation(lId);
      setPanels(pnl);
      const panel = pnl.find((p) => p.id === panId);
      if (panel) {
        setPanelName(panel.name);
        setPanelDescription(panel.description ?? '');
        setGeneralBreaker(panel.general_breaker_ampere);
      }
      const els = await window.bilpow.elements.getByPanel(panId);
      setElements(els);
      setSelection({ type: 'panel', projectId: pId, locationId: lId, panelId: panId });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur');
    }
  }, [lId, panId, pId, setElements, setPanels, setSelection]);

  useEffect(() => {
    void loadData();
    void window.bilpow.favorites.getAll().then(setFavorites);
  }, [loadData, setFavorites]);

  const savePanelField = async (
    field: 'name' | 'description' | 'general_breaker_ampere',
    value: string | number
  ) => {
    try {
      await window.bilpow.panels.update({
        id: panId,
        [field]: value,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur');
    }
  };

  const handleSaveElement = async (data: {
    type: 'eclairage' | 'prise';
    repere: string;
    designation: string;
    power_w: number;
    quantity: number;
    distance_m: number;
    circuit?: string;
    notes?: string;
  }) => {
    if (editElement) {
      await window.bilpow.elements.update({ id: editElement.id, ...data });
      toast.success('Élément mis à jour');
    } else {
      await window.bilpow.elements.create({ panel_id: panId, ...data });
      toast.success('Élément ajouté');
    }
    await loadData();
    const pnl = await window.bilpow.panels.getByLocation(lId);
    setPanels(pnl);
  };

  const handleDeleteElement = async () => {
    if (deleteElementId === null) return;
    try {
      await window.bilpow.elements.delete(deleteElementId);
      toast.success('Élément supprimé');
      await loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur');
    }
    setDeleteElementId(null);
  };

  const handleReorder = async (orderedIds: number[]) => {
    try {
      await window.bilpow.elements.reorder(panId, orderedIds);
      const els = await window.bilpow.elements.getByPanel(panId);
      setElements(els);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur de réorganisation');
    }
  };

  const handleDeleteFavorite = async (id: number) => {
    try {
      await window.bilpow.favorites.delete(id);
      const favs = await window.bilpow.favorites.getAll();
      setFavorites(favs);
      toast.success('Favori supprimé');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur');
    }
  };

  const installed = panelInstalledPower(elements);
  const absorbed = panelAbsorbedPower(installed);
  const current = calculationCurrent(absorbed);
  const recommended = recommendedBreakerAmps(current);

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-full mx-auto">
        <div className="card p-5 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Nom du tableau
              </label>
              <input
                type="text"
                value={panelName}
                onChange={(e) => setPanelName(e.target.value)}
                onBlur={(e) => void savePanelField('name', e.target.value)}
                className="input-field font-semibold"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Disjoncteur général (A)
              </label>
              <input
                type="number"
                min={0}
                value={generalBreaker}
                onChange={(e) => setGeneralBreaker(Number(e.target.value))}
                onBlur={(e) =>
                  void savePanelField('general_breaker_ampere', Number(e.target.value))
                }
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Description
              </label>
              <input
                type="text"
                value={panelDescription}
                onChange={(e) => setPanelDescription(e.target.value)}
                onBlur={(e) => void savePanelField('description', e.target.value)}
                className="input-field"
                placeholder="Optionnel"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-gray-100 dark:border-gray-700 text-sm">
            <span className="text-gray-600 dark:text-gray-300">
              P. installée: <strong>{formatPower(installed)}</strong>
            </span>
            <span className="text-gray-600 dark:text-gray-300">
              P. absorbée: <strong>{formatPower(absorbed)}</strong>
            </span>
            <span className="text-gray-600 dark:text-gray-300">
              I. calcul: <strong>{formatNumber(current)} A</strong>
            </span>
            <span className="text-accent font-medium">
              DJ recommandé: {recommended} A
            </span>
          </div>
        </div>

        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white">
            Éléments ({elements.length})
          </h2>
          <button
            type="button"
            onClick={() => {
              setEditElement(null);
              setShowModal(true);
            }}
            className="btn-primary"
          >
            + Ajouter un élément
          </button>
        </div>

        <ElementTable
          elements={elements}
          onEdit={(el) => {
            setEditElement(el);
            setShowModal(true);
          }}
          onDelete={setDeleteElementId}
          onReorder={handleReorder}
        />
      </div>

      <AddElementModal
        isOpen={showModal}
        panelId={panId}
        existingElements={elements}
        favorites={favorites}
        editElement={editElement}
        onClose={() => {
          setShowModal(false);
          setEditElement(null);
        }}
        onSave={handleSaveElement}
        onDeleteFavorite={handleDeleteFavorite}
      />

      <ConfirmDialog
        isOpen={deleteElementId !== null}
        title="Supprimer l'élément"
        message="Êtes-vous sûr de vouloir supprimer cet élément ?"
        onConfirm={() => void handleDeleteElement()}
        onCancel={() => setDeleteElementId(null)}
      />
    </div>
  );
}
