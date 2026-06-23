import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { useAppStore } from "@/store/useAppStore";
import { usePanelEditingStore } from "@/store/panelEditingStore";
import { usePanelEditing } from "@/hooks/usePanelEditing";
import { ElementTable } from "@/components/ElementTable";
import { AddElementModal } from "@/components/AddElementModal";
import { AddJdbModal } from "@/components/AddJdbModal";
import {
  elementToArticleDesignation,
  elementToArticleTypeLabel,
  payloadToArticleDesignation,
} from "@/utils/multiDepartHelpers";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  normalizeElement,
  isJeuDeBarres,
  getInsertIndexAfterJdbSection,
  getJeuDeBarresForElement,
  getElementsInJdbSection,
  departCategoryOf,
  findElementByRepereAndCategory,
  getInsertIndexAfterRepereGroup,
} from "@/utils/elementHelpers";
import {
  panelTotalPower,
  calculationCurrent,
  formatPower,
  PREFIX_MAP,
  parseRepereNumber,
} from "@/utils/calculations";
import {
  buildLocalArticle,
  buildLocalElement,
  createElementPending,
  reorderElementsList,
  type LocalMutation,
} from "@/utils/panelEditing";
import { LoadGauge } from "@/components/LoadGauge";
import type { Article, Element, JdbCategory, Panel, PhaseType, PanelChange } from "@/types";

type ElementFormType = Exclude<Element["type"], "jeu_de_barres">;

const DEFAULT_PANEL: Panel = {
  id: 0,
  location_id: 0,
  name: "",
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

function KsGlobalPanel({
  totalPowerW,
  ks,
  onKsChange,
}: {
  totalPowerW: number;
  ks: number;
  onKsChange: (ks: number) => void;
}) {
  const [localKs, setLocalKs] = useState(ks);

  useEffect(() => {
    setLocalKs(ks);
  }, [ks]);

  const corrected = totalPowerW * localKs;

  const commitKs = () => {
    const clamped = Math.min(1, Math.max(0, localKs));
    setLocalKs(clamped);
    if (clamped !== ks) {
      onKsChange(clamped);
    }
  };

  return (
    <div className="card p-4 border border-blue-100 dark:border-blue-900">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
        Puissance globale
      </h3>
      <div className="flex flex-wrap items-center gap-6">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
            Ks global :
          </label>
          <input
            type="number"
            min={0}
            max={1}
            step={0.01}
            value={localKs}
            onChange={(e) =>
              setLocalKs(
                Math.min(1, Math.max(0, parseFloat(e.target.value) || 0)),
              )
            }
            onBlur={commitKs}
            className="input-field w-24 text-center font-mono"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600 dark:text-gray-400">
            Puissance installée :
          </span>
          <span className="font-semibold text-gray-800 dark:text-white">
            {formatPower(totalPowerW)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600 dark:text-gray-400">
            Puissance globale :
          </span>
          <span className="text-lg font-bold text-blue-700 dark:text-blue-400">
            {formatPower(corrected)}
          </span>
        </div>
      </div>
    </div>
  );
}

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

  const nextTempId = usePanelEditingStore((s) => s.nextTempId);
  const getPendingChanges = usePanelEditingStore((s) => s.getPendingChanges);
  const removePendingForTempElement = usePanelEditingStore(
    (s) => s.removePendingForTempElement,
  );
  const unsaved = usePanelEditingStore((s) => s.pendingChanges.length > 0);

  const [panel, setPanel] = useState<Panel>(DEFAULT_PANEL);
  const [showAddElement, setShowAddElement] = useState(false);
  const [showAddJdb, setShowAddJdb] = useState(false);
  const [editElement, setEditElement] = useState<Element | null>(null);
  const [articlesByElement, setArticlesByElement] = useState<
    Record<number, Article[]>
  >({});
  const [departForNewType, setDepartForNewType] = useState<Element | null>(
    null,
  );
  const [contextJdb, setContextJdb] = useState<Element | null>(null);
  const [deleteElementId, setDeleteElementId] = useState<number | null>(null);
  const [pendingReperePrefix, setPendingReperePrefix] = useState<string | null>(null);

  const loadArticlesForElements = useCallback(async (els: Element[]) => {
    const multiElements = els.filter((e) => e.is_multi && e.id > 0);
    const entries = await Promise.all(
      multiElements.map(async (el) => {
        const articles = await window.bilpow.elements.getArticles(el.id);
        return [el.id, articles] as const;
      }),
    );
    const map: Record<number, Article[]> = {};
    for (const [id, articles] of entries) {
      map[id] = articles;
    }
    setArticlesByElement((prev) => {
      const tempArticles: Record<number, Article[]> = {};
      for (const el of els) {
        const tempList = prev[el.id];
        if (el.id < 0 && tempList) {
          tempArticles[el.id] = tempList;
        }
      }
      return { ...map, ...tempArticles };
    });
  }, []);

  const refreshElements = useCallback(async () => {
    const els = await window.bilpow.elements.getByPanel(panId);
    const normalized = els.map((e) => normalizeElement(e));
    setElements(normalized);
    await loadArticlesForElements(normalized);
  }, [panId, setElements, loadArticlesForElements]);

  const refreshPanels = useCallback(async () => {
    const pnl = await window.bilpow.panels.getByLocation(lId);
    setPanels(pnl);
  }, [lId, setPanels]);

  const {
    recordOperation,
    applyMutations,
    undo,
    redo,
    save,
    canUndo,
    canRedo,
    initPanel,
    reset,
  } = usePanelEditing({
    panelId: panId,
    elements,
    articlesByElement,
    setElements,
    setArticlesByElement,
    refreshElements,
    refreshPanels,
  });

  const loadData = useCallback(async () => {
    try {
      const pnl = await window.bilpow.panels.getByLocation(lId);
      setPanels(pnl);
      const panelData = pnl.find((p) => p.id === panId);
      if (panelData) {
        setPanel(panelData);
      }
      await refreshElements();
      setSelection({
        type: "panel",
        projectId: pId,
        locationId: lId,
        panelId: panId,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    }
  }, [lId, panId, pId, refreshElements, setPanels, setSelection]);

  useEffect(() => {
    initPanel(panId);
    void loadData();
    void window.bilpow.favorites.getAll().then(setFavorites);
    return () => reset();
  }, [panId, loadData, setFavorites, initPanel, reset]);

  // Notify Layout about available quick actions
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("quick-actions-update", {
        detail: {
          onAddJdb: () => setShowAddJdb(true),
          onConfigurePrefix: () => void toggleReperePrefix(),
          onSave: () => void save(),
          canSave: unsaved,
          prefixEnabled: !!panel.repere_prefix,
        },
      }),
    );
  }, [unsaved, save, panel.repere_prefix]);

  // Notify Layout about modal state to hide FAB
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("modal-state-change", {
        detail: { open: showAddElement || showAddJdb || !!editElement },
      }),
    );
  }, [showAddElement, showAddJdb, editElement]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target;
      const isInput =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
        return;
      }

      if (isInput) return;

      if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() === "z" && !e.shiftKey) {
          e.preventDefault();
          if (canUndo()) undo();
          return;
        }
        if (
          e.key.toLowerCase() === "y" ||
          (e.key.toLowerCase() === "z" && e.shiftKey)
        ) {
          e.preventDefault();
          if (canRedo()) redo();
          return;
        }
      }
    };

    const handleRequestSave = async () => {
      await save();
      window.dispatchEvent(new CustomEvent('panel-save-complete'));
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("panel-request-save", handleRequestSave);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("panel-request-save", handleRequestSave);
    };
  }, [undo, redo, save, canUndo, canRedo]);

  const totalPower = useMemo(
    () => panelTotalPower(elements, articlesByElement),
    [elements, articlesByElement],
  );
  const calcCurrent = useMemo(
    () => calculationCurrent(totalPower),
    [totalPower],
  );

  const savePanelName = async (name: string) => {
    try {
      await window.bilpow.panels.update({ id: panId, name });
      setPanel((p) => ({ ...p, name }));
      await refreshPanels();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    }
  };

  const saveKsGlobal = async (coef_ks: number) => {
    setPanel((p) => ({ ...p, coef_ks }));
    try {
      await window.bilpow.panels.update({ id: panId, coef_ks });
      await refreshPanels();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
      await loadData();
    }
  };

  const toggleReperePrefix = async () => {
    const newValue = panel.repere_prefix ? null : `${panel.name}/`;

    // Only show confirmation dialog when enabling prefix and there are existing repères
    if (newValue && elements.some((e) => !isJeuDeBarres(e) && e.repere.trim())) {
      setPendingReperePrefix(newValue);
      return;
    }

    await applyReperePrefixChange(newValue);
  };

  const applyReperePrefixChange = async (
    newValue: string | null,
    renameExisting: boolean = true,
  ) => {
    console.log('[applyReperePrefixChange] Called with newValue:', newValue, 'renameExisting:', renameExisting);
    console.log('[applyReperePrefixChange] Current elements:', elements.length, elements.map(e => ({ id: e.id, repere: e.repere })));
    
    setPanel((p) => ({ ...p, repere_prefix: newValue }));
    try {
      let renamedUpdates: { id: number; oldRepere: string; newRepere: string }[] = [];
      if (newValue && renameExisting) {
        // Capture old repères BEFORE renaming (for both saved and temp elements)
        const oldReperes = new Map<number, string>();
        for (const e of elements) {
          if (!isJeuDeBarres(e) && e.id !== 0 && e.repere.trim()) {
            oldReperes.set(e.id, e.repere);
          }
        }
        
        console.log('[applyReperePrefixChange] Calling renameExistingReperes...');
        renamedUpdates = await renameExistingReperes(newValue);
        console.log('[applyReperePrefixChange] renameExistingReperes returned:', renamedUpdates.length, 'updates');
        
        // Apply the renames to local state and record in undo/redo history
        if (renamedUpdates.length > 0) {
          console.log('[applyReperePrefixChange] Processing', renamedUpdates.length, 'renames');
          
          // Separate saved vs temp elements
          const savedUpdates = renamedUpdates.filter(u => u.id > 0);
          const tempUpdates = renamedUpdates.filter(u => u.id < 0);

          console.log('[applyReperePrefixChange] Saved elements to update in DB:', savedUpdates.length);
          console.log('[applyReperePrefixChange] Temp elements to update in UI only:', tempUpdates.length);

          // Build inverse mutations (restore old repères)
          const inverseMutations = renamedUpdates.map(({ id, oldRepere }) => ({
            op: 'patchElement' as const,
            id,
            patch: { repere: oldRepere },
          }));

          // Build redo mutations (apply new repères)
          const redoMutations = renamedUpdates.map(({ id, newRepere }) => ({
            op: 'patchElement' as const,
            id,
            patch: { repere: newRepere },
          }));

          // Build pending changes
          const pendingChanges: PanelChange[] = savedUpdates.map(({ id, newRepere }) => ({
            type: 'updateElement' as const,
            id,
            data: { repere: newRepere },
          }));

          // For temp elements, we need to update their repère in the pending createElement changes
          // so they get created with the correct prefixed repère when saved
          if (tempUpdates.length > 0) {
            const currentPending = getPendingChanges();
            const updatedPending = currentPending.map((change: PanelChange) => {
              if (change.type === 'createElement') {
                const tempUpdate = tempUpdates.find(u => u.id === change.tempId);
                if (tempUpdate) {
                  return {
                    ...change,
                    data: {
                      ...change.data,
                      repere: tempUpdate.newRepere,
                    },
                  };
                }
              }
              return change;
            });
            // Update the pending changes in the store
            usePanelEditingStore.setState({ pendingChanges: updatedPending });
          }

          // Record the operation in undo/redo history
          recordOperation({
            inverse: inverseMutations,
            redo: redoMutations,
            pending: pendingChanges,
          });
          
          console.log('[applyReperePrefixChange] Applying mutations to local state');
          // Apply mutations to update local state (affects both saved and temp elements)
          applyMutations(redoMutations);
          
          // Only update database for SAVED elements (id > 0)
          if (savedUpdates.length > 0) {
            console.log('[applyReperePrefixChange] Updating database for', savedUpdates.length, 'saved elements...');
            for (const { id, newRepere } of savedUpdates) {
              await window.bilpow.elements.update({ id, repere: newRepere });
            }
            console.log('[applyReperePrefixChange] Database updated for saved elements');
          }
          
          // Show success notification
          toast.success(`${renamedUpdates.length} repère(s) renommé(s)`);
        } else {
          console.log('[applyReperePrefixChange] No elements to rename');
          toast('Aucun repère à renommer');
        }
      }
      // When disabling prefix (!newValue), we only update the panel setting
      // We do NOT strip the prefix from existing repères - they keep their names
      console.log('[applyReperePrefixChange] Updating panel prefix in database');
      await window.bilpow.panels.update({ id: panId, repere_prefix: newValue });
      await refreshPanels();
      
      // ONLY refresh elements if we updated saved elements in DB
      // If we only renamed temp elements, DON'T refresh or we'll lose them!
      const hasSavedUpdates = renamedUpdates.some(u => u.id > 0);
      if (hasSavedUpdates) {
        console.log('[applyReperePrefixChange] Refreshing elements (saved elements were updated)...');
        await refreshElements();
        console.log('[applyReperePrefixChange] Elements refreshed');
      } else if (renamedUpdates.length > 0) {
        console.log('[applyReperePrefixChange] Skipping refreshElements to preserve', renamedUpdates.length, 'temp element(s)');
      }
    } catch (err) {
      console.error('[applyReperePrefixChange] Error:', err);
      toast.error(err instanceof Error ? err.message : "Erreur");
      // Revert the panel prefix change but preserve pending element changes
      await refreshPanels();
    } finally {
      setPendingReperePrefix(null);
    }
  };

  const renameExistingReperes = async (prefix: string): Promise<{ id: number; oldRepere: string; newRepere: string }[]> => {
    const updates: { id: number; oldRepere: string; newRepere: string }[] = [];

    console.log('[renameExistingReperes] Starting with prefix:', prefix);
    console.log('[renameExistingReperes] Total elements:', elements.length);

    // Group elements by their JDB section (or null for elements not in any JDB)
    const sections = new Map<number | null, Element[]>();
    let currentJdbId: number | null = null;

    for (const e of elements) {
      if (isJeuDeBarres(e)) {
        currentJdbId = e.id;
        if (!sections.has(currentJdbId)) {
          sections.set(currentJdbId, []);
        }
        console.log('[renameExistingReperes] Found JDB:', e.repere, 'id:', e.id);
        continue;
      }
      
      const sectionKey = currentJdbId;
      if (!sections.has(sectionKey)) {
        sections.set(sectionKey, []);
      }
      sections.get(sectionKey)!.push(e);
    }

    // Process each section independently
    for (const [jdbId, sectionElements] of sections.entries()) {
      console.log('[renameExistingReperes] Processing section JDB:', jdbId, 'with', sectionElements.length, 'elements');
      const usedKeys = new Set<string>();

      for (const e of sectionElements) {
        const parsed = parseRepereNumber(e.repere);
        if (!parsed) {
          console.log('[renameExistingReperes] Skipping (no parse):', e.repere);
          continue;
        }

        // Skip if repère already has this prefix (case-insensitive)
        if (e.repere.toUpperCase().startsWith(prefix.toUpperCase())) {
          console.log('[renameExistingReperes] Already has prefix:', e.repere);
          const key = `${e.type}|${parsed.number}`;
          usedKeys.add(key);
          continue;
        }

        // For divers, check if it shares a repère with a parent departure (eclairage or prise)
        // If so, it should use the parent's type prefix instead of D
        let typePrefix = PREFIX_MAP[e.type];
        if (e.type === 'divers') {
          const parentElement = sectionElements.find(
            (other) => other.id !== e.id && other.repere === e.repere && (other.type === 'eclairage' || other.type === 'prise')
          );
          if (parentElement) {
            typePrefix = PREFIX_MAP[parentElement.type];
            console.log('[renameExistingReperes] Divers shares repère with parent, using parent prefix:', typePrefix);
          }
        }
        const newRepere = `${prefix}${typePrefix}${parsed.number}`;
        // Use type+number for conflict detection to avoid conflicts between different types (e.g., E1 vs D1)
        // But allow multi-phase departures (mono+tri) to share the same number
        const key = `${e.type}|${parsed.number}`;

        if (usedKeys.has(key)) {
          console.log('[renameExistingReperes] Conflict detected in section:', newRepere);
          toast.error(`Conflit de repère détecté pour ${newRepere}. Renommage annulé.`);
          throw new Error('Repere conflict');
        }

        console.log('[renameExistingReperes] Will rename:', e.repere, '->', newRepere, e.id < 0 ? '(temp ID)' : '(saved)');
        usedKeys.add(key);
        updates.push({ id: e.id, oldRepere: e.repere, newRepere });
      }
    }

    console.log('[renameExistingReperes] Total updates:', updates.length);
    
    // Do NOT update database here - let the caller do it after recording undo/redo
    return updates;
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
          formCategory,
          undefined,
          getJeuDeBarresForElement(elements, departForNewType.id),
        );
        if (existingSameCategory) {
          toast.error(
            "Ce repère existe déjà pour cette catégorie — utilisez + sur la ligne correspondante",
          );
          return;
        }

        const insertAt = getInsertIndexAfterRepereGroup(
          elements,
          departForNewType.repere,
          departForNewType.id,
        );
        const tempId = nextTempId();
        const element = buildLocalElement(
          tempId,
          panId,
          { ...data, repere: departForNewType.repere },
          insertAt,
        );
        const newIds = elements.map((e) => e.id);
        newIds.splice(insertAt, 0, tempId);
        const reordered = reorderElementsList([...elements, element], newIds);
        recordOperation({
          inverse: [{ op: "setElements", elements }],
          redo: [{ op: "setElements", elements: reordered }],
          pending: [
            createElementPending(tempId, {
              ...data,
              repere: departForNewType.repere,
            }),
            { type: "reorderElements", orderedIds: newIds },
          ],
        });
        applyMutations([{ op: "setElements", elements: reordered }]);
        toast.success("Élément ajouté au repère");
        setDepartForNewType(null);
        setContextJdb(null);
        return;
      }

      const articleTypeLabel = data.type_label.trim();
      const articleDesignation = payloadToArticleDesignation(data);
      const elementId = departForNewType.id;
      const prevArticles = [...(articlesByElement[elementId] ?? [])];
      const prevElement = { ...departForNewType };

      if (!departForNewType.is_multi) {
        const art1Temp = nextTempId();
        const art2Temp = nextTempId();
        const art1 = buildLocalArticle(art1Temp, elementId, {
          type_label: elementToArticleTypeLabel(departForNewType),
          designation: elementToArticleDesignation(departForNewType),
          power_w: departForNewType.power_w,
          quantity: departForNewType.quantity,
          coef_ks: departForNewType.coef_ks,
          coef_ku: departForNewType.coef_ku,
          order_index: 0,
        });
        const art2 = buildLocalArticle(art2Temp, elementId, {
          type_label: articleTypeLabel,
          designation: articleDesignation,
          power_w: data.power_w,
          quantity: data.quantity,
          coef_ks: data.coef_ks,
          coef_ku: data.coef_ku,
          order_index: 1,
        });
        const updatedElement = {
          ...departForNewType,
          is_multi: true,
          power_w: 0,
          quantity: 1,
          notes: data.notes ?? departForNewType.notes,
        };

        recordOperation({
          inverse: [
            { op: "patchElement", id: elementId, patch: prevElement },
            { op: "setArticlesForElement", elementId, articles: prevArticles },
          ],
          redo: [
            { op: "patchElement", id: elementId, patch: updatedElement },
            { op: "setArticlesForElement", elementId, articles: [art1, art2] },
          ],
          pending: [
            {
              type: "updateElement",
              id: elementId,
              data: {
                is_multi: true,
                power_w: 0,
                quantity: 1,
                notes: data.notes,
              },
            },
            {
              type: "createArticle",
              tempId: art1Temp,
              data: {
                element_id: elementId,
                type_label: art1.type_label,
                designation: art1.designation,
                power_w: art1.power_w,
                quantity: art1.quantity,
                coef_ks: art1.coef_ks,
                coef_ku: art1.coef_ku,
                order_index: 0,
              },
            },
            {
              type: "createArticle",
              tempId: art2Temp,
              data: {
                element_id: elementId,
                type_label: art2.type_label,
                designation: art2.designation,
                power_w: art2.power_w,
                quantity: art2.quantity,
                coef_ks: art2.coef_ks,
                coef_ku: art2.coef_ku,
                order_index: 1,
              },
            },
          ],
        });
        applyMutations([
          { op: "patchElement", id: elementId, patch: updatedElement },
          { op: "setArticlesForElement", elementId, articles: [art1, art2] },
        ]);
      } else {
        const artTemp = nextTempId();
        const newArticle = buildLocalArticle(artTemp, elementId, {
          type_label: articleTypeLabel,
          designation: articleDesignation,
          power_w: data.power_w,
          quantity: data.quantity,
          coef_ks: data.coef_ks,
          coef_ku: data.coef_ku,
          order_index: prevArticles.length,
        });
        const nextArticles = [...prevArticles, newArticle];

        recordOperation({
          inverse: [
            { op: "setArticlesForElement", elementId, articles: prevArticles },
          ],
          redo: [
            { op: "setArticlesForElement", elementId, articles: nextArticles },
          ],
          pending: [
            {
              type: "createArticle",
              tempId: artTemp,
              data: {
                element_id: elementId,
                type_label: newArticle.type_label,
                designation: newArticle.designation,
                power_w: newArticle.power_w,
                quantity: newArticle.quantity,
                coef_ks: newArticle.coef_ks,
                coef_ku: newArticle.coef_ku,
                order_index: newArticle.order_index,
              },
            },
          ],
        });
        applyMutations([
          { op: "setArticlesForElement", elementId, articles: nextArticles },
        ]);
      }
      toast.success("Type ajouté au départ");
      setDepartForNewType(null);
      setContextJdb(null);
      return;
    }

    if (editElement && editElement.type !== "jeu_de_barres") {
      const formCategory = departCategoryOf({
        type: data.type,
        phase_type: data.phase_type,
      });
      const existing = findElementByRepereAndCategory(
        elements,
        data.repere,
        formCategory,
        editElement.id,
        getJeuDeBarresForElement(elements, editElement.id),
      );
      if (existing) {
        toast.error("Ce repère est déjà utilisé pour cette catégorie");
        return;
      }
      const prev = { ...editElement };
      const patch = {
        type: data.type,
        repere: data.repere,
        type_label: data.type_label,
        designation: data.type_label,
        emplacement: data.emplacement,
        power_w: data.power_w,
        quantity: data.quantity,
        phase_type: data.phase_type,
        coef_ks: data.coef_ks,
        coef_ku: data.coef_ku,
        notes: data.notes ?? null,
      };
      recordOperation({
        inverse: [{ op: "patchElement", id: editElement.id, patch: prev }],
        redo: [{ op: "patchElement", id: editElement.id, patch }],
        pending: [{ type: "updateElement", id: editElement.id, data }],
        undoPending: [
          {
            type: "updateElement",
            id: editElement.id,
            data: {
              type: prev.type,
              repere: prev.repere,
              type_label: prev.type_label,
              emplacement: prev.emplacement,
              power_w: prev.power_w,
              quantity: prev.quantity,
              phase_type: prev.phase_type,
              coef_ks: prev.coef_ks,
              coef_ku: prev.coef_ku,
              notes: prev.notes ?? undefined,
            },
          },
        ],
      });
      applyMutations([{ op: "patchElement", id: editElement.id, patch }]);
      toast.success("Élément mis à jour");
    } else {
      const formCategory = departCategoryOf({
        type: data.type,
        phase_type: data.phase_type,
      });
      const existing = findElementByRepereAndCategory(
        elements,
        data.repere,
        formCategory,
        undefined,
        contextJdb,
      );
      if (existing) {
        toast.error(
          "Ce repère existe déjà pour cette catégorie — utilisez + sur la ligne pour ajouter un autre type",
        );
        return;
      }
      const insertAt = contextJdb
        ? getInsertIndexAfterJdbSection(elements, contextJdb.id)
        : elements.length;
      const tempId = nextTempId();
      const element = buildLocalElement(tempId, panId, data, insertAt);
      const newIds = elements.map((e) => e.id);
      newIds.splice(insertAt, 0, tempId);
      const reordered = reorderElementsList([...elements, element], newIds);
      const pending = [createElementPending(tempId, data)];
      if (contextJdb) {
        pending.push({ type: "reorderElements", orderedIds: newIds });
      }
      recordOperation({
        inverse: [{ op: "setElements", elements }],
        redo: [{ op: "setElements", elements: reordered }],
        pending,
      });
      applyMutations([{ op: "setElements", elements: reordered }]);
      toast.success("Élément ajouté");
    }
    setContextJdb(null);
  };

  const handleSaveMultiple = async (items: ElementSavePayload[]) => {
    const batchKeys = items.map(
      (i) =>
        `${i.repere.trim().toUpperCase()}|${departCategoryOf({ type: i.type, phase_type: i.phase_type })}`,
    );
    if (batchKeys.some((key, idx) => batchKeys.indexOf(key) !== idx)) {
      toast.error("Des repères en double sont présents dans la sélection");
      return;
    }
    for (const item of items) {
      const category = departCategoryOf({
        type: item.type,
        phase_type: item.phase_type,
      });
      const existing = findElementByRepereAndCategory(
        elements,
        item.repere,
        category,
        undefined,
        contextJdb,
      );
      if (existing) {
        toast.error(
          `Le repère ${item.repere} existe déjà pour cette catégorie`,
        );
        return;
      }
    }

    let insertAt = contextJdb
      ? getInsertIndexAfterJdbSection(elements, contextJdb.id)
      : elements.length;
    const prevElements = elements;
    const newElements = [...elements];
    const newIds = elements.map((e) => e.id);
    const pending: Parameters<typeof recordOperation>[0]["pending"] = [];

    for (const item of items) {
      const tempId = nextTempId();
      const element = buildLocalElement(tempId, panId, item, insertAt);
      newElements.push(element);
      newIds.splice(insertAt, 0, tempId);
      pending.push(createElementPending(tempId, item));
      insertAt++;
    }

    const reordered = reorderElementsList(newElements, newIds);
    if (contextJdb) {
      pending.push({ type: "reorderElements", orderedIds: newIds });
    }

    recordOperation({
      inverse: [{ op: "setElements", elements: prevElements }],
      redo: [{ op: "setElements", elements: reordered }],
      pending,
    });
    applyMutations([{ op: "setElements", elements: reordered }]);
    setContextJdb(null);
    toast.success(`${items.length} éléments ajoutés avec succès`);
  };

  const handleAddElementUnderJdb = (jdb: Element) => {
    setEditElement(null);
    setContextJdb(jdb);
    setShowAddElement(true);
  };

  const handleFieldUpdate = async (
    id: number,
    field:
      | "emplacement"
      | "type_label"
      | "power_w"
      | "repere"
      | "quantity"
      | "coef_ks"
      | "coef_ku",
    value: number | string,
  ) => {
    const el = elements.find((e) => e.id === id);
    if (!el) return;
    const oldValue = el[field];
    recordOperation({
      inverse: [{ op: "patchElement", id, patch: { [field]: oldValue } }],
      redo: [{ op: "patchElement", id, patch: { [field]: value } }],
      pending: [{ type: "updateElement", id, data: { [field]: value } }],
      undoPending: [{ type: "updateElement", id, data: { [field]: oldValue } }],
    });
    applyMutations([{ op: "patchElement", id, patch: { [field]: value } }]);
  };

  const handleDeleteElement = async () => {
    if (deleteElementId === null) return;
    const id = deleteElementId;
    const element = elements.find((e) => e.id === id);
    if (!element) {
      setDeleteElementId(null);
      return;
    }

    const isJdb = isJeuDeBarres(element);
    const childIds = isJdb
      ? getElementsInJdbSection(elements, element.id).map((e) => e.id)
      : [];
    const idsToDelete = [id, ...childIds];

    const prevElements = elements;
    const prevArticles = { ...articlesByElement };

    if (id < 0) {
      removePendingForTempElement(id);
      for (const childId of childIds) {
        if (childId < 0) {
          removePendingForTempElement(childId);
        }
      }
      recordOperation({
        inverse: [
          { op: "setElements", elements: prevElements },
          { op: "setArticles", articlesByElement: prevArticles },
        ],
        redo: idsToDelete.map((idToRemove) => ({
          op: "removeElement" as const,
          id: idToRemove,
        })),
        pending: [],
      });
      applyMutations(
        idsToDelete.map((idToRemove) => ({ op: "removeElement" as const, id: idToRemove })),
      );
    } else {
      const inverseInsertions: LocalMutation[] = [];
      for (let i = 0; i < prevElements.length; i++) {
        const el = prevElements[i]!;
        if (idsToDelete.includes(el.id)) {
          inverseInsertions.push({ op: "insertElement", element: el, index: i });
          const arts = prevArticles[el.id] ?? [];
          if (arts.length > 0) {
            inverseInsertions.push({
              op: "setArticlesForElement",
              elementId: el.id,
              articles: arts,
            });
          }
        }
      }

      recordOperation({
        inverse: inverseInsertions,
        redo: idsToDelete.map((idToRemove) => ({
          op: "removeElement" as const,
          id: idToRemove,
        })),
        pending: idsToDelete
          .filter((idToRemove) => idToRemove > 0)
          .map((idToRemove) => ({ type: "deleteElement" as const, id: idToRemove })),
      });
      applyMutations(
        idsToDelete.map((idToRemove) => ({ op: "removeElement" as const, id: idToRemove })),
      );
    }

    toast.success(
      isJdb && childIds.length > 0
        ? `Jeu de barres et ${childIds.length} élément(s) supprimé(s)`
        : "Ligne supprimée",
    );
    setDeleteElementId(null);
  };

  const handleReorder = async (orderedIds: number[]) => {
    const prevElements = elements;
    const reordered = reorderElementsList(elements, orderedIds);
    recordOperation({
      inverse: [{ op: "setElements", elements: prevElements }],
      redo: [{ op: "setElements", elements: reordered }],
      pending: [{ type: "reorderElements", orderedIds }],
      undoPending: [
        { type: "reorderElements", orderedIds: prevElements.map((e) => e.id) },
      ],
    });
    applyMutations([{ op: "setElements", elements: reordered }]);
  };

  const handleDeleteFavorite = async (id: number) => {
    try {
      await window.bilpow.favorites.delete(id);
      const favs = await window.bilpow.favorites.getAll();
      setFavorites(favs);
      toast.success("Favori supprimé");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    }
  };

  const handleJdbCreate = (typeLabel: string, category: JdbCategory) => {
    const insertAt = elements.length;
    const tempId = nextTempId();
    const element = buildLocalElement(
      tempId,
      panId,
      {
        type: "jeu_de_barres",
        repere: "",
        type_label: typeLabel,
        emplacement: "",
        power_w: 0,
        quantity: 1,
        phase_type: "mono",
        jdb_category: category,
        coef_ks: 1,
        coef_ku: 1,
      },
      insertAt,
    );
    const reordered = [...elements, element].map((el, i) => ({
      ...el,
      order_index: i,
    }));

    recordOperation({
      inverse: [{ op: "setElements", elements }],
      redo: [{ op: "setElements", elements: reordered }],
      pending: [
        createElementPending(tempId, {
          type: "jeu_de_barres",
          repere: "",
          type_label: typeLabel,
          emplacement: "",
          power_w: 0,
          quantity: 1,
          phase_type: "mono",
          jdb_category: category,
          coef_ks: 1,
          coef_ku: 1,
        }),
      ],
    });
    applyMutations([{ op: "setElements", elements: reordered }]);
    toast.success("Jeu de barres ajouté");
  };

  const handleAddTypeToDepart = (element: Element) => {
    if (element.type === "jeu_de_barres") return;
    const jdb = getJeuDeBarresForElement(elements, element.id);
    setEditElement(null);
    setContextJdb(jdb);
    setDepartForNewType(element);
    setShowAddElement(true);
  };

  const handleArticleUpdate = async (
    articleId: number,
    field:
      | "designation"
      | "type_label"
      | "power_w"
      | "quantity"
      | "coef_ks"
      | "coef_ku",
    value: string | number,
  ) => {
    const elementId = Object.keys(articlesByElement).find((eid) =>
      (articlesByElement[Number(eid)] ?? []).some((a) => a.id === articleId),
    );
    if (!elementId) return;
    const eid = Number(elementId);
    const article = (articlesByElement[eid] ?? []).find(
      (a) => a.id === articleId,
    );
    if (!article) return;
    const oldValue = article[field];

    recordOperation({
      inverse: [
        {
          op: "patchArticle",
          elementId: eid,
          articleId,
          patch: { [field]: oldValue },
        },
      ],
      redo: [
        {
          op: "patchArticle",
          elementId: eid,
          articleId,
          patch: { [field]: value },
        },
      ],
      pending: [
        { type: "updateArticle", id: articleId, data: { [field]: value } },
      ],
      undoPending: [
        { type: "updateArticle", id: articleId, data: { [field]: oldValue } },
      ],
    });
    applyMutations([
      {
        op: "patchArticle",
        elementId: eid,
        articleId,
        patch: { [field]: value },
      },
    ]);
  };

  const handleArticleDelete = async (articleId: number, elementId: number) => {
    const articles = articlesByElement[elementId] ?? [];
    const article = articles.find((a) => a.id === articleId);
    if (!article) return;
    const index = articles.findIndex((a) => a.id === articleId);

    if (articleId < 0) {
      usePanelEditingStore.setState((state) => ({
        pendingChanges: state.pendingChanges.filter(
          (c) => !(c.type === "createArticle" && c.tempId === articleId),
        ),
      }));
      recordOperation({
        inverse: [{ op: "insertArticle", elementId, article, index }],
        redo: [{ op: "removeArticle", elementId, articleId }],
        pending: [],
      });
    } else {
      recordOperation({
        inverse: [{ op: "insertArticle", elementId, article, index }],
        redo: [{ op: "removeArticle", elementId, articleId }],
        pending: [{ type: "deleteArticle", id: articleId }],
      });
    }
    applyMutations([{ op: "removeArticle", elementId, articleId }]);
  };

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-full mx-auto space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Nom du tableau
              {unsaved && (
                <span
                  className="ml-2 text-amber-600 dark:text-amber-400"
                  title="Modifications non enregistrées"
                >
                  ●
                </span>
              )}
            </label>
            <input
              type="text"
              value={panel.name}
              onChange={(e) =>
                setPanel((p) => ({ ...p, name: e.target.value }))
              }
              onBlur={(e) => void savePanelName(e.target.value)}
              className="input-field text-xl font-bold max-w-md"
            />
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 cursor-pointer mt-2 sm:mt-0">
              <input
                type="checkbox"
                checked={Boolean(panel.repere_prefix)}
                onChange={() => void toggleReperePrefix()}
                className="h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent"
              />
              Utiliser le nom du tableau comme préfixe des repères
              {panel.repere_prefix && (
                <span className="font-mono text-xs text-gray-400 ml-1">
                  ({panel.repere_prefix}E1, {panel.repere_prefix}E2…)
                </span>
              )}
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {unsaved && (
              <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                Modifications non enregistrées
              </span>
            )}
            <button
              type="button"
              onClick={() => void save()}
              disabled={!unsaved}
              className="btn-primary text-sm disabled:opacity-40"
              title="Ctrl+S"
            >
              Enregistrer
            </button>
            <button
              type="button"
              onClick={() => canUndo() && undo()}
              disabled={!canUndo()}
              className="btn-secondary text-sm disabled:opacity-40"
              title="Ctrl+Z"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={() => canRedo() && redo()}
              disabled={!canRedo()}
              className="btn-secondary text-sm disabled:opacity-40"
              title="Ctrl+Y"
            >
              Rétablir
            </button>
          </div>
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
            if (el.type === "jeu_de_barres" || el.is_multi) return;
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
        <KsGlobalPanel
          totalPowerW={totalPower}
          ks={panel.coef_ks ?? 1}
          onKsChange={(ks) => void saveKsGlobal(ks)}
        />
      </div>

      <AddElementModal
        isOpen={showAddElement}
        existingElements={elements}
        favorites={favorites}
        editElement={editElement}
        contextJdb={contextJdb}
        addTypeToDepart={departForNewType}
        reperePrefix={panel.repere_prefix}
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
          jdbCount={elements.filter((e) => e.type === "jeu_de_barres").length}
          onClose={() => setShowAddJdb(false)}
          onCreate={(typeLabel, category) => {
            handleJdbCreate(typeLabel, category);
            setShowAddJdb(false);
          }}
        />
      )}

      <ConfirmDialog
        isOpen={deleteElementId !== null}
        title="Supprimer la ligne"
        message={(() => {
          const el = elements.find((e) => e.id === deleteElementId);
          if (el && isJeuDeBarres(el)) {
            const count = getElementsInJdbSection(elements, el.id).length;
            return count > 0
              ? `Ce jeu de barres contient ${count} élément(s). La suppression supprimera également tous les éléments qu'il contient. Continuer ?`
              : "Êtes-vous sûr de vouloir supprimer ce jeu de barres ?";
          }
          return "Êtes-vous sûr de vouloir supprimer cette ligne ?";
        })()}
        onConfirm={() => void handleDeleteElement()}
        onCancel={() => setDeleteElementId(null)}
      />

      <ConfirmDialog
        isOpen={pendingReperePrefix !== null}
        title="Appliquer le préfixe aux repères existants"
        message={`Voulez-vous renommer tous les repères existants pour qu'ils commencent par « ${pendingReperePrefix ?? ''} » ? Les jeux de barres ne seront pas modifiés.`}
        confirmLabel="Renommer"
        onConfirm={() => {
          if (pendingReperePrefix) {
            void applyReperePrefixChange(pendingReperePrefix, true);
          }
        }}
        onCancel={() => {
          setPendingReperePrefix(null);
        }}
        tertiaryLabel="Garder"
        onTertiary={() => {
          if (pendingReperePrefix) {
            void applyReperePrefixChange(pendingReperePrefix, false);
          }
        }}
      />
    </div>
  );
}
