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

  const run = db.transaction(() => {
    for (const change of changes) {
      switch (change.type) {
        case 'createElement': {
          const created = elementsDb.createElement({
            ...change.data,
            panel_id: panelId,
          });
          idMap.set(change.tempId, created.id);
          break;
        }
        case 'createArticle': {
          const elementId = resolveId(change.data.element_id, idMap);
          const created = elementsDb.createArticle({
            ...change.data,
            element_id: elementId,
          });
          articleIdMap.set(change.tempId, created.id);
          break;
        }
        case 'updateElement': {
          elementsDb.updateElement({
            id: resolveId(change.id, idMap),
            ...change.data,
          });
          break;
        }
        case 'updateArticle': {
          elementsDb.updateArticle({
            id: resolveArticleId(change.id, articleIdMap),
            ...change.data,
          });
          break;
        }
        case 'deleteArticle': {
          elementsDb.deleteArticle(resolveArticleId(change.id, articleIdMap));
          break;
        }
        case 'deleteElement': {
          elementsDb.deleteElement(resolveId(change.id, idMap));
          break;
        }
        case 'reorderElements': {
          const orderedIds = change.orderedIds.map((id) => resolveId(id, idMap));
          elementsDb.reorderElements(panelId, orderedIds);
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
