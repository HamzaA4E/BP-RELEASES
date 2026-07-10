import { getDatabase } from './db';
import * as elementsDb from './elements';
import type { PanelChange, PanelSaveResult } from '../../shared/types';

function resolveId(id: number, idMap: Map<number, number>): number {
  if (id >= 0) return id;
  const mapped = idMap.get(id);
  if (mapped === undefined) {
    throw new Error(`Unresolved temporary element id: ${id}`);
  }
  return mapped;
}

function resolveArticleId(id: number, articleIdMap: Map<number, number>): number {
  if (id >= 0) return id;
  const mapped = articleIdMap.get(id);
  if (mapped === undefined) {
    throw new Error(`Unresolved temporary article id: ${id}`);
  }
  return mapped;
}

export function applyPanelChanges(
  panelId: number,
  changes: PanelChange[]
): PanelSaveResult {
  const db = getDatabase();
  const idMap = new Map<number, number>();
  const articleIdMap = new Map<number, number>();

  // Sort changes to ensure createElement comes before operations that reference it
  const sortedChanges = [...changes].sort((a, b) => {
    // createElement should come first
    if (a.type === 'createElement' && b.type !== 'createElement') return -1;
    if (b.type === 'createElement' && a.type !== 'createElement') return 1;
    // createArticle should come before operations that reference it
    if (a.type === 'createArticle' && b.type !== 'createArticle') return -1;
    if (b.type === 'createArticle' && a.type !== 'createArticle') return 1;
    return 0;
  });

  const run = db.transaction(() => {
    for (const change of sortedChanges) {
      switch (change.type) {
        case 'createElement': {
          const created = elementsDb.createElement({
            ...change.data,
            panel_id: panelId,
          });
          idMap.set(change.tempId, created.id);
          console.log(`[applyPanelChanges] Created element tempId=${change.tempId} -> realId=${created.id} at order_index=${created.order_index}`);
          break;
        }
        case 'createArticle': {
          const elementId = resolveId(change.data.element_id, idMap);
          const created = elementsDb.createArticle({
            ...change.data,
            element_id: elementId,
          });
          articleIdMap.set(change.tempId, created.id);
          console.log(`[applyPanelChanges] Created article tempId=${change.tempId} -> realId=${created.id}`);
          break;
        }
        case 'updateElement': {
          const resolvedId = resolveId(change.id, idMap);
          elementsDb.updateElement({
            id: resolvedId,
            ...change.data,
          });
          console.log(`[applyPanelChanges] Updated element id=${change.id} -> ${resolvedId}`);
          break;
        }
        case 'updateArticle': {
          const resolvedId = resolveArticleId(change.id, articleIdMap);
          elementsDb.updateArticle({
            id: resolvedId,
            ...change.data,
          });
          console.log(`[applyPanelChanges] Updated article id=${change.id} -> ${resolvedId}`);
          break;
        }
        case 'deleteArticle': {
          elementsDb.deleteArticle(resolveArticleId(change.id, articleIdMap));
          console.log(`[applyPanelChanges] Deleted article id=${change.id}`);
          break;
        }
        case 'deleteElement': {
          elementsDb.deleteElement(resolveId(change.id, idMap));
          console.log(`[applyPanelChanges] Deleted element id=${change.id}`);
          break;
        }
        case 'reorderElements': {
          const orderedIds = change.orderedIds.map((id) => resolveId(id, idMap));
          elementsDb.reorderElements(panelId, orderedIds);
          console.log(`[applyPanelChanges] Reordered elements`);
          break;
        }
        default: {
          const _exhaustive: never = change;
          throw new Error(`Unknown panel change type: ${(_exhaustive as PanelChange).type}`);
        }
      }
    }
  });

  run();

  return {
    idMap: Object.fromEntries(idMap),
    articleIdMap: Object.fromEntries(articleIdMap),
  };
}
