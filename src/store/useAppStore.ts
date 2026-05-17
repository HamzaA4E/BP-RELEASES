import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  Project,
  ProjectWithStats,
  LocationWithStats,
  PanelWithStats,
  Element,
  Favorite,
  AppSelection,
  CompanySettings,
  UpdateCompanySettingsInput,
} from '@/types';

interface AppState {
  darkMode: boolean;
  infoPanelCollapsed: boolean;
  projects: ProjectWithStats[];
  currentProject: Project | null;
  locations: LocationWithStats[];
  panels: PanelWithStats[];
  elements: Element[];
  favorites: Favorite[];
  selection: AppSelection;
  sidebarExpanded: Record<string, boolean>;
  searchQuery: string;
  company: CompanySettings | null;

  setDarkMode: (value: boolean) => void;
  toggleInfoPanel: () => void;
  setProjects: (projects: ProjectWithStats[]) => void;
  setCurrentProject: (project: Project | null) => void;
  setLocations: (locations: LocationWithStats[]) => void;
  setPanels: (panels: PanelWithStats[]) => void;
  setElements: (elements: Element[]) => void;
  setFavorites: (favorites: Favorite[]) => void;
  setSelection: (selection: Partial<AppSelection>) => void;
  setSidebarExpanded: (key: string, expanded: boolean) => void;
  setSearchQuery: (query: string) => void;
  resetViewData: () => void;
  loadCompanySettings: () => Promise<void>;
  updateCompany: (data: UpdateCompanySettingsInput) => void;
}

const defaultSelection: AppSelection = {
  type: null,
  projectId: null,
  locationId: null,
  panelId: null,
};

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      darkMode: false,
      infoPanelCollapsed: false,
      projects: [],
      currentProject: null,
      locations: [],
      panels: [],
      elements: [],
      favorites: [],
      selection: defaultSelection,
      sidebarExpanded: {},
      searchQuery: '',
      company: null,

      setDarkMode: (value) => {
        document.documentElement.classList.toggle('dark', value);
        void window.bilpow?.app.setNativeTheme(value ? 'dark' : 'light');
        set({ darkMode: value });
      },
      toggleInfoPanel: () =>
        set((s) => ({ infoPanelCollapsed: !s.infoPanelCollapsed })),
      setProjects: (projects) => set({ projects }),
      setCurrentProject: (project) => set({ currentProject: project }),
      setLocations: (locations) => set({ locations }),
      setPanels: (panels) => set({ panels }),
      setElements: (elements) => set({ elements }),
      setFavorites: (favorites) => set({ favorites }),
      setSelection: (selection) =>
        set((s) => ({
          selection: { ...s.selection, ...selection },
        })),
      setSidebarExpanded: (key, expanded) =>
        set((s) => ({
          sidebarExpanded: { ...s.sidebarExpanded, [key]: expanded },
        })),
      setSearchQuery: (query) => set({ searchQuery: query }),
      resetViewData: () =>
        set({
          locations: [],
          panels: [],
          elements: [],
        }),
      loadCompanySettings: async () => {
        const company = await window.bilpow.settings.get();
        set({ company });
      },
      updateCompany: (data) =>
        set((state) => ({
          company: state.company ? { ...state.company, ...data } : null,
        })),
    }),
    {
      name: 'bilpow-settings',
      partialize: (state) => ({
        darkMode: state.darkMode,
        infoPanelCollapsed: state.infoPanelCollapsed,
        sidebarExpanded: state.sidebarExpanded,
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.darkMode) {
          document.documentElement.classList.add('dark');
        }
      },
    }
  )
);
