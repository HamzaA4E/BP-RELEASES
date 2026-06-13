import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAppStore } from '@/store/useAppStore';
import { ElementTable } from '@/components/ElementTable';
import { AddElementModal } from '@/components/AddElementModal';
import { AddJdbModal } from '@/components/AddJdbModal';
import {
  elementToArticleDesignation,
  elementToArticleTypeLabel,
  payloadToArticleDesignation,
} from '@/utils/multiDepartHelpers';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import {
  normalizeElement,
  isJeuDeBarres,
  getInsertIndexAfterJdbSection,
  getJeuDeBarresForElement,
  departCategoryOf,
  findElementByRepereAndCategory,
  getInsertIndexAfterRepereGroup,
} from '@/utils/elementHelpers';
import {
  panelTotalPower,
  calculationCurrent,
} from '@/utils/calculations';
import { LoadGauge } from '@/components/LoadGauge';
import type { Article, Element, Panel, PhaseType } from '@/types';

type ElementFormType = Exclude<Element['type'], 'jeu_de_barres'>;

const DEFAULT_PANEL: Panel = {
  id: 0,
  location_id: 0,
  name: '',
  description: null,
  general_breaker_ampere: 0,
  order_index: 0,
};

type ElementSavePayload = {
  type: ElementFormType;
  repere: string;
  type_label: string;
  emplacement: string;
  power_w: number;
  quantity: number;
  phase_type: PhaseType;
  coef_ks: number;
  coef_ku: number;
  notes?: string;
};

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

  const [panel, setPanel] = useState<Panel>(DEFAULT_PANEL);
  const [showAddElement, setShowAddElement] = useState(false);
  const [showAddJdb, setShowAddJdb] = useState(false);
  const [editElement, setEditElement] = useState<Element | null>(null);
  const [articlesByElement, setArticlesByElement] = useState<Record<number, Article[]>>({});
  const [departForNewType, setDepartForNewType] = useState<Element | null>(null);
  const [contextJdb, setContextJdb] = useState<Element | null>(null);
  const [deleteElementId, setDeleteElementId] = useState<number | null>(null);

  const loadArticlesForElements = useCallback(async (els: Element[]) => {
    const multiElements = els.filter((e) => e.is_multi);
    const entries = await Promise.all(
      multiElements.map(async (el) => {
        const articles = await window.bilpow.elements.getArticles(el.id);
        return [el.id, articles] as const;
      })
    );
    const map: Record<number, Article[]> = {};
    for (const [id, articles] of entries) {
      map[id] = articles;
    }
    setArticlesByElement(map);
  }, []);

  const refreshElements = useCallback(async () => {
    const els = await window.bilpow.elements.getByPanel(panId);
    const normalized = els.map((e) => normalizeElement(e));
    setElements(normalized);
    await loadArticlesForElements(normalized);
  }, [panId, setElements, loadArticlesForElements]);

  const loadData = useCallback(async () => {
    try {
      const pnl = await window.bilpow.panels.getByLocation(lId);
      setPanels(pnl);
      const panelData = pnl.find((p) => p.id === panId);
      if (panelData) {
        setPanel(panelData);
      }
      await refreshElements();
      setSelection({ type: 'panel', projectId: pId, locationId: lId, panelId: panId });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur');
    }
  }, [lId, panId, pId, refreshElements, setPanels, setSelection]);

  useEffect(() => {
    void loadData();
    void window.bilpow.favorites.getAll().then(setFavorites);
  }, [loadData, setFavorites]);

  const totalPower = useMemo(
    () => panelTotalPower(elements, articlesByElement),
    [elements, articlesByElement]
  );
  const calcCurrent = useMemo(() => calculationCurrent(totalPower), [totalPower]);

  const savePanelName = async (name: string) => {
    try {
      await window.bilpow.panels.update({ id: panId, name });
      setPanel((p) => ({ ...p, name }));
      const pnl = await window.bilpow.panels.getByLocation(lId);
      setPanels(pnl);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur');
    }
  };

  const createElementFromPayload = async (data: ElementSavePayload) => {
    return window.bilpow.elements.create({
      panel_id: panId,
      type: data.type,
      repere: data.repere,
      type_label: data.type_label,
      emplacement: data.emplacement,
      phase_type: data.phase_type,
      power_w: data.power_w,
      quantity: data.quantity,
      coef_ks: data.coef_ks,
      coef_ku: data.coef_ku,
      notes: data.notes,
    });
  };

  const insertElementInSection = async (
    created: Element,
    jdb: Element | null
  ) => {
    if (!jdb) return;
    const insertAt = getInsertIndexAfterJdbSection(elements, jdb.id);
    const ids = elements.map((e) => e.id);
    const withoutNew = ids.filter((id) => id !== created.id);
    withoutNew.splice(insertAt, 0, created.id);
    await window.bilpow.elements.reorder(panId, withoutNew);
  };

  const handleSaveElement = async (data: ElementSavePayload) => {
    if (departForNewType) {
      const parentCategory = departCategoryOf(departForNewType);
      const formCategory = departCategoryOf({
        type: data.type,
        phase_type: data.phase_type,
      });

      if (formCategory !== parentCategory) {
        const existingSameCategory = findElementByRepereAndCategory(
          elements,
          departForNewType.repere,
          formCategory
        );
        if (existingSameCategory) {
          toast.error(
            'Ce repère existe déjà pour cette catégorie — utilisez + sur la ligne correspondante'
          );
          return;
        }

        const created = await createElementFromPayload({
          ...data,
          repere: departForNewType.repere,
        });
        const insertAt = getInsertIndexAfterRepereGroup(
          elements,
          departForNewType.repere,
          departForNewType.id
        );
        const ids = elements.map((e) => e.id);
        ids.splice(insertAt, 0, created.id);
        await window.bilpow.elements.reorder(panId, ids);
        toast.success('Élément ajouté au repère');
        setDepartForNewType(null);
        setContextJdb(null);
        await refreshElements();
        const pnl = await window.bilpow.panels.getByLocation(lId);
        setPanels(pnl);
        return;
      }

      const articleTypeLabel = data.type_label.trim();
      const articleDesignation = payloadToArticleDesignation(data);
      const articleCoefs = { coef_ks: data.coef_ks, coef_ku: data.coef_ku };
      if (!departForNewType.is_multi) {
        await window.bilpow.elements.update({
          id: departForNewType.id,
          is_multi: true,
          power_w: 0,
          quantity: 1,
          notes: data.notes,
        });
        await window.bilpow.elements.createArticle({
          element_id: departForNewType.id,
          type_label: elementToArticleTypeLabel(departForNewType),
          designation: elementToArticleDesignation(departForNewType),
          power_w: departForNewType.power_w,
          quantity: departForNewType.quantity,
          coef_ks: departForNewType.coef_ks,
          coef_ku: departForNewType.coef_ku,
          order_index: 0,
        });
        await window.bilpow.elements.createArticle({
          element_id: departForNewType.id,
          designation: articleDesignation,
          power_w: data.power_w,
          quantity: data.quantity,
          ...articleCoefs,
          order_index: 1,
          type_label: articleTypeLabel,
        });
      } else {
        const existing = articlesByElement[departForNewType.id] ?? [];
        await window.bilpow.elements.createArticle({
          element_id: departForNewType.id,
          designation: articleDesignation,
          power_w: data.power_w,
          quantity: data.quantity,
          ...articleCoefs,
          order_index: existing.length,
          type_label: articleTypeLabel,
        });
      }
      toast.success('Type ajouté au départ');
      setDepartForNewType(null);
      setContextJdb(null);
      await refreshElements();
      const pnl = await window.bilpow.panels.getByLocation(lId);
      setPanels(pnl);
      return;
    }

    if (editElement && editElement.type !== 'jeu_de_barres') {
      const formCategory = departCategoryOf({
        type: data.type,
        phase_type: data.phase_type,
      });
      const existing = findElementByRepereAndCategory(
        elements,
        data.repere,
        formCategory,
        editElement.id
      );
      if (existing) {
        toast.error('Ce repère est déjà utilisé pour cette catégorie');
        return;
      }
      await window.bilpow.elements.update({ id: editElement.id, ...data });
      toast.success('Élément mis à jour');
    } else {
      const formCategory = departCategoryOf({
        type: data.type,
        phase_type: data.phase_type,
      });
      const existing = findElementByRepereAndCategory(elements, data.repere, formCategory);
      if (existing) {
        toast.error(
          'Ce repère existe déjà pour cette catégorie — utilisez + sur la ligne pour ajouter un autre type'
        );
        return;
      }
      const created = await createElementFromPayload(data);
      await insertElementInSection(created, contextJdb);
      toast.success('Élément ajouté');
    }
    setContextJdb(null);
    await refreshElements();
    const pnl = await window.bilpow.panels.getByLocation(lId);
    setPanels(pnl);
  };

  const handleSaveMultiple = async (items: ElementSavePayload[]) => {
    const batchKeys = items.map(
      (i) =>
        `${i.repere.trim().toUpperCase()}|${departCategoryOf({ type: i.type, phase_type: i.phase_type })}`
    );
    if (batchKeys.some((key, idx) => batchKeys.indexOf(key) !== idx)) {
      toast.error('Des repères en double sont présents dans la sélection');
      return;
    }
    for (const item of items) {
      const category = departCategoryOf({
        type: item.type,
        phase_type: item.phase_type,
      });
      const existing = findElementByRepereAndCategory(elements, item.repere, category);
      if (existing) {
        toast.error(`Le repère ${item.repere} existe déjà pour cette catégorie`);
        return;
      }
    }

    let insertAt = contextJdb
      ? getInsertIndexAfterJdbSection(elements, contextJdb.id)
      : elements.length;
    const orderedIds = elements.map((e) => e.id);

    for (const item of items) {
      const created = await createElementFromPayload(item);
      orderedIds.splice(insertAt, 0, created.id);
      insertAt++;
    }

    if (contextJdb) {
      await window.bilpow.elements.reorder(panId, orderedIds);
    }
    setContextJdb(null);
    toast.success(`${items.length} éléments ajoutés avec succès`);
    await refreshElements();
    const pnl = await window.bilpow.panels.getByLocation(lId);
    setPanels(pnl);
  };

  const handleAddElementUnderJdb = (jdb: Element) => {
    setEditElement(null);
    setContextJdb(jdb);
    setShowAddElement(true);
  };

  const handleFieldUpdate = async (
    id: number,
    field:
      | 'emplacement'
      | 'type_label'
      | 'power_w'
      | 'repere'
      | 'quantity'
      | 'coef_ks'
      | 'coef_ku',
    value: number | string
  ) => {
    setElements(
      elements.map((el) => (el.id === id ? { ...el, [field]: value } : el))
    );
    try {
      await window.bilpow.elements.update({ id, [field]: value });
      const pnl = await window.bilpow.panels.getByLocation(lId);
      setPanels(pnl);
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
      await refreshElements();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur');
    }
    setDeleteElementId(null);
  };

  const handleReorder = async (orderedIds: number[]) => {
    try {
      await window.bilpow.elements.reorder(panId, orderedIds);
      await refreshElements();
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

  const handleJdbSuccess = async () => {
    await refreshElements();
    const pnl = await window.bilpow.panels.getByLocation(lId);
    setPanels(pnl);
  };

  const handleAddTypeToDepart = (element: Element) => {
    if (element.type === 'jeu_de_barres') return;
    const jdb = getJeuDeBarresForElement(elements, element.id);
    setEditElement(null);
    setContextJdb(jdb);
    setDepartForNewType(element);
    setShowAddElement(true);
  };

  const handleArticleUpdate = async (
    articleId: number,
    field: 'designation' | 'type_label' | 'power_w' | 'quantity' | 'coef_ks' | 'coef_ku',
    value: string | number
  ) => {
    try {
      await window.bilpow.elements.updateArticle({ id: articleId, [field]: value });
      await refreshElements();
      const pnl = await window.bilpow.panels.getByLocation(lId);
      setPanels(pnl);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur');
    }
  };

  const handleArticleDelete = async (articleId: number, _elementId: number) => {
    try {
      await window.bilpow.elements.deleteArticle(articleId);
      await refreshElements();
      const pnl = await window.bilpow.panels.getByLocation(lId);
      setPanels(pnl);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur');
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-full mx-auto space-y-6">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Nom du tableau
          </label>
          <input
            type="text"
            value={panel.name}
            onChange={(e) => setPanel((p) => ({ ...p, name: e.target.value }))}
            onBlur={(e) => void savePanelName(e.target.value)}
            className="input-field text-xl font-bold max-w-md"
          />
        </div>

        <div className="flex flex-wrap justify-between items-center gap-3">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white">
            Lignes ({elements.filter((e) => !isJeuDeBarres(e)).length})
          </h2>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowAddJdb(true)}
              className="flex items-center gap-2 px-4 py-2 bg-[#1E3A5F] hover:bg-[#162d4a] active:scale-95 text-white rounded-lg text-sm font-medium transition-all shadow-sm"
            >
              <span className="text-lg leading-none">⚡</span>
              Ajouter jeu de barres
            </button>
            <button
              type="button"
              onClick={() => {
                setEditElement(null);
                setContextJdb(null);
                setDepartForNewType(null);
                setShowAddElement(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-lg text-sm font-medium transition-all shadow-sm"
            >
              <span className="text-lg leading-none">+</span>
              Ajouter un élément
            </button>
          </div>
        </div>

        <LoadGauge totalPowerW={totalPower} calcCurrentA={calcCurrent} />

        <ElementTable
          elements={elements}
          articlesByElement={articlesByElement}
          onEdit={(el) => {
            if (el.type === 'jeu_de_barres' || el.is_multi) return;
            setContextJdb(null);
            setEditElement(el);
            setShowAddElement(true);
          }}
          onAddTypeToDepart={handleAddTypeToDepart}
          onDelete={setDeleteElementId}
          onAddElementUnderJdb={handleAddElementUnderJdb}
          onReorder={handleReorder}
          onFieldUpdate={handleFieldUpdate}
          onArticleUpdate={handleArticleUpdate}
          onArticleDelete={handleArticleDelete}
        />

        
      </div>

      <AddElementModal
        isOpen={showAddElement}
        existingElements={elements}
        favorites={favorites}
        editElement={editElement}
        contextJdb={contextJdb}
        addTypeToDepart={departForNewType}
        onClose={() => {
          setShowAddElement(false);
          setEditElement(null);
          setContextJdb(null);
          setDepartForNewType(null);
        }}
        onSave={handleSaveElement}
        onSaveMultiple={handleSaveMultiple}
        onDeleteFavorite={handleDeleteFavorite}
      />

      {showAddJdb && (
        <AddJdbModal
          panelId={panId}
          onClose={() => setShowAddJdb(false)}
          onSuccess={() => void handleJdbSuccess()}
        />
      )}

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
