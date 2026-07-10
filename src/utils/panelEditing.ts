import type {
  Article,
  Element,
  ElementType,
  JdbCategory,
  PanelChange,
  PhaseType,
} from "@/types";

export type LocalMutation =
  | { op: "setElements"; elements: Element[] }
  | { op: "setArticles"; articlesByElement: Record<number, Article[]> }
  | { op: "patchElement"; id: number; patch: Partial<Element> }
  | { op: "insertElement"; element: Element; index: number }
  | { op: "removeElement"; id: number }
  | { op: "reorderElements"; orderedIds: number[] }
  | { op: "setArticlesForElement"; elementId: number; articles: Article[] }
  | {
      op: "patchArticle";
      elementId: number;
      articleId: number;
      patch: Partial<Article>;
    }
  | { op: "insertArticle"; elementId: number; article: Article; index: number }
  | { op: "removeArticle"; elementId: number; articleId: number };

export interface EditOperation {
  inverse: LocalMutation[];
  redo: LocalMutation[];
  pending: PanelChange[];
  undoPending?: PanelChange[];
  redoPending?: PanelChange[];
}

export function applyLocalMutations(
  elements: Element[],
  articlesByElement: Record<number, Article[]>,
  mutations: LocalMutation[],
): { elements: Element[]; articlesByElement: Record<number, Article[]> } {
  let nextElements = elements;
  let nextArticles = { ...articlesByElement };

  for (const mutation of mutations) {
    switch (mutation.op) {
      case "setElements":
        nextElements = mutation.elements;
        break;
      case "setArticles":
        nextArticles = mutation.articlesByElement;
        break;
      case "patchElement":
        nextElements = nextElements.map((el) =>
          el.id === mutation.id ? { ...el, ...mutation.patch } : el,
        );
        break;
      case "insertElement": {
        const copy = [...nextElements];
        copy.splice(mutation.index, 0, mutation.element);
        nextElements = copy.map((el, i) => ({ ...el, order_index: i }));
        break;
      }
      case "removeElement": {
        const { [mutation.id]: _removed, ...restArticles } = nextArticles;
        nextArticles = restArticles;
        nextElements = nextElements
          .filter((el) => el.id !== mutation.id)
          .map((el, i) => ({ ...el, order_index: i }));
        break;
      }
      case "reorderElements": {
        const byId = new Map(nextElements.map((el) => [el.id, el]));
        nextElements = mutation.orderedIds
          .map((id, i) => {
            const el = byId.get(id);
            return el ? { ...el, order_index: i } : null;
          })
          .filter((el): el is Element => el != null);
        break;
      }
      case "setArticlesForElement":
        nextArticles = {
          ...nextArticles,
          [mutation.elementId]: mutation.articles,
        };
        break;
      case "patchArticle": {
        const list = nextArticles[mutation.elementId] ?? [];
        nextArticles = {
          ...nextArticles,
          [mutation.elementId]: list.map((a) =>
            a.id === mutation.articleId ? { ...a, ...mutation.patch } : a,
          ),
        };
        break;
      }
      case "insertArticle": {
        const list = [...(nextArticles[mutation.elementId] ?? [])];
        list.splice(mutation.index, 0, mutation.article);
        nextArticles = { ...nextArticles, [mutation.elementId]: list };
        break;
      }
      case "removeArticle": {
        const list = (nextArticles[mutation.elementId] ?? []).filter(
          (a) => a.id !== mutation.articleId,
        );
        if (list.length === 0) {
          const { [mutation.elementId]: _, ...rest } = nextArticles;
          nextArticles = rest;
        } else {
          nextArticles = { ...nextArticles, [mutation.elementId]: list };
        }
        break;
      }
      default: {
        const _exhaustive: never = mutation;
        throw new Error(
          `Unknown mutation: ${(_exhaustive as LocalMutation).op}`,
        );
      }
    }
  }

  return { elements: nextElements, articlesByElement: nextArticles };
}

export function reorderElementsList(
  elements: Element[],
  orderedIds: number[],
): Element[] {
  const byId = new Map(elements.map((el) => [el.id, el]));
  return orderedIds
    .map((id, i) => {
      const el = byId.get(id);
      return el ? { ...el, order_index: i } : null;
    })
    .filter((el): el is Element => el != null);
}

type ElementFormType = Exclude<ElementType, "jeu_de_barres">;

export function buildLocalElement(
  tempId: number,
  panelId: number,
  data: {
    type: ElementFormType | "jeu_de_barres";
    repere: string;
    type_label: string;
    emplacement?: string;
    phase_type?: PhaseType;
    jdb_category?: JdbCategory | null;
    power_w: number;
    quantity: number;
    coef_ks: number;
    coef_ku: number;
    use_coefs?: boolean;
    notes?: string | null;
    is_multi?: boolean;
  },
  orderIndex: number,
): Element {
  const isJdb = data.type === "jeu_de_barres";
  return {
    id: tempId,
    panel_id: panelId,
    type: data.type,
    repere: data.repere,
    type_label: data.type_label,
    designation: data.type_label,
    emplacement: data.emplacement ?? "",
    row_kind: isJdb ? "bar_set" : "element",
    bar_set_index: 0,
    phase_type: data.phase_type ?? "mono",
    jdb_category: isJdb ? (data.jdb_category ?? "eclairage") : null,
    power_w: data.power_w,
    quantity: data.quantity,
    distance_m: 0,
    ku: 1,
    ks: 1,
    coef_ks: data.coef_ks,
    coef_ku: data.coef_ku,
    use_coefs: data.use_coefs ?? false,
    circuit: null,
    notes: data.notes ?? null,
    is_multi: data.is_multi ?? false,
    order_index: orderIndex,
  };
}

export function buildLocalArticle(
  tempId: number,
  elementId: number,
  data: {
    type_label: string;
    designation: string;
    power_w: number;
    quantity: number;
    coef_ks: number;
    coef_ku: number;
    order_index: number;
  },
): Article {
  return {
    id: tempId,
    element_id: elementId,
    type_label: data.type_label,
    designation: data.designation,
    power_w: data.power_w,
    quantity: data.quantity,
    coef_ks: data.coef_ks,
    coef_ku: data.coef_ku,
    order_index: data.order_index,
  };
}

export function createElementPending(
  tempId: number,
  data: Parameters<typeof buildLocalElement>[2],
  orderIndex?: number,
): PanelChange {
  return {
    type: "createElement",
    tempId,
    data: {
      type: data.type,
      repere: data.repere,
      type_label: data.type_label,
      emplacement: data.emplacement,
      phase_type: data.phase_type,
      jdb_category: data.jdb_category,
      power_w: data.power_w,
      quantity: data.quantity,
      coef_ks: data.coef_ks,
      coef_ku: data.coef_ku,
      use_coefs: data.use_coefs,
      notes: data.notes ?? undefined,
      is_multi: data.is_multi,
      order_index: orderIndex,
    },
  };
}
