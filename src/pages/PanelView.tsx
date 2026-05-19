import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAppStore } from '@/store/useAppStore';
import { ElementTable } from '@/components/ElementTable';
import { AddElementModal } from '@/components/AddElementModal';
import { AddBarSetModal } from '@/components/AddBarSetModal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import {
  barSetLabel,
  nextBarSetIndex,
  normalizeElement,
} from '@/utils/elementHelpers';
import type { Element, ElementType } from '@/types';

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
  const [showModal, setShowModal] = useState(false);
  const [showBarSetModal, setShowBarSetModal] = useState(false);
  const [editElement, setEditElement] = useState<Element | null>(null);
  const [deleteElementId, setDeleteElementId] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    try {
      const pnl = await window.bilpow.panels.getByLocation(lId);
      setPanels(pnl);
      const panel = pnl.find((p) => p.id === panId);
      if (panel) {
        setPanelName(panel.name);
      }
      const els = await window.bilpow.elements.getByPanel(panId);
      setElements(els.map((e) => normalizeElement(e)));
      setSelection({ type: 'panel', projectId: pId, locationId: lId, panelId: panId });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur');
    }
  }, [lId, panId, pId, setElements, setPanels, setSelection]);

  useEffect(() => {
    void loadData();
    void window.bilpow.favorites.getAll().then(setFavorites);
  }, [loadData, setFavorites]);

  const savePanelName = async (name: string) => {
    try {
      await window.bilpow.panels.update({ id: panId, name });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur');
    }
  };

  const handleSaveElement = async (data: {
    type: ElementType;
    repere: string;
    type_label: string;
    emplacement: string;
    power_w: number;
    quantity: number;
    ku: number;
    ks: number;
    fp: number;
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

  const handleAddBarSet = async (type: ElementType) => {
    setShowBarSetModal(false);
    try {
      const index = nextBarSetIndex(elements, type);
      const type_label = barSetLabel(type, index);
      const reperePrefix = type === 'eclairage' ? 'JB-E' : 'JB-P';
      await window.bilpow.elements.create({
        panel_id: panId,
        type,
        row_kind: 'bar_set',
        bar_set_index: index,
        type_label,
        emplacement: '',
        repere: `${reperePrefix}${index}`,
        power_w: 0,
        quantity: 1,
        ku: 1,
        ks: 1,
        fp: 1,
      });
      toast.success(type_label);
      await loadData();
      const pnl = await window.bilpow.panels.getByLocation(lId);
      setPanels(pnl);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur');
    }
  };

  const handleFieldUpdate = async (
    id: number,
    field: 'ku' | 'ks' | 'fp' | 'emplacement' | 'type_label',
    value: number | string
  ) => {
    try {
      await window.bilpow.elements.update({ id, [field]: value });
      const els = await window.bilpow.elements.getByPanel(panId);
      setElements(els.map((e) => normalizeElement(e)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur de mise à jour');
      await loadData();
    }
  };

  const handleDeleteElement = async () => {
    if (deleteElementId === null) return;
    try {
      await window.bilpow.elements.delete(deleteElementId);
      toast.success('Ligne supprimée');
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
      setElements(els.map((e) => normalizeElement(e)));
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

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-full mx-auto">
        <div className="mb-6">
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Nom du tableau
          </label>
          <input
            type="text"
            value={panelName}
            onChange={(e) => setPanelName(e.target.value)}
            onBlur={(e) => void savePanelName(e.target.value)}
            className="input-field text-xl font-bold max-w-md"
          />
        </div>

        <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white">
            Lignes ({elements.length})
          </h2>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowBarSetModal(true)}
              className="btn-secondary"
            >
              + Ajouter jeu de barre
            </button>
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
        </div>

        <ElementTable
          elements={elements}
          onEdit={(el) => {
            setEditElement(el);
            setShowModal(true);
          }}
          onDelete={setDeleteElementId}
          onReorder={handleReorder}
          onFieldUpdate={handleFieldUpdate}
        />
      </div>

      <AddElementModal
        isOpen={showModal}
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

      <AddBarSetModal
        isOpen={showBarSetModal}
        onClose={() => setShowBarSetModal(false)}
        onConfirm={(type) => void handleAddBarSet(type)}
      />

      <ConfirmDialog
        isOpen={deleteElementId !== null}
        title="Supprimer la ligne"
        message="Êtes-vous sûr de vouloir supprimer cette ligne ?"
        onConfirm={() => void handleDeleteElement()}
        onCancel={() => setDeleteElementId(null)}
      />
    </div>
  );
}
