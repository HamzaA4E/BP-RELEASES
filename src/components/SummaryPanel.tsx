import { useAppStore } from '@/store/useAppStore';
import {
  panelInstalledPower,
  panelAbsorbedPower,
  calculationCurrent,
  recommendedBreakerAmps,
  formatPower,
  formatNumber,
} from '@/utils/calculations';
export function SummaryPanel() {
  const {
    selection,
    infoPanelCollapsed,
    toggleInfoPanel,
    currentProject,
    locations,
    panels,
    elements,
  } = useAppStore();

  if (infoPanelCollapsed) {
    return (
      <button
        type="button"
        onClick={toggleInfoPanel}
        className="w-8 flex-shrink-0 bg-white dark:bg-gray-800 border-l border-gray-200
          dark:border-gray-700 flex items-center justify-center hover:bg-gray-50
          dark:hover:bg-gray-750 transition-colors"
        title="Afficher le panneau résumé"
      >
        <span className="text-gray-400 text-xs rotate-180">◀</span>
      </button>
    );
  }

  const renderContent = () => {
    if (selection.type === 'panel' && selection.panelId) {
      const installed = panelInstalledPower(elements);
      const absorbed = panelAbsorbedPower(installed);
      const current = calculationCurrent(absorbed);
      const breaker = recommendedBreakerAmps(current);
      const panel = panels.find((p) => p.id === selection.panelId);

      return (
        <PanelSummary
          panelName={panel?.name ?? ''}
          elementCount={elements.length}
          installed={installed}
          absorbed={absorbed}
          current={current}
          breaker={breaker}
          generalBreaker={panel?.general_breaker_ampere ?? 0}
        />
      );
    }

    if (selection.type === 'location' && selection.locationId) {
      const location = locations.find((l) => l.id === selection.locationId);
      const locPanels = panels.filter((p) => p.location_id === selection.locationId);
      const totalInstalled = locPanels.reduce((s, p) => s + p.installed_power_w, 0);
      const totalAbsorbed = locPanels.reduce((s, p) => s + p.absorbed_power_w, 0);

      return (
        <LocationSummary
          name={location?.name ?? ''}
          panelCount={locPanels.length}
          installed={totalInstalled}
          absorbed={totalAbsorbed}
        />
      );
    }

    if (selection.type === 'project' && selection.projectId) {
      const totalInstalled = locations.reduce((s, l) => s + l.total_power_w, 0);
      return (
        <ProjectSummary
          name={currentProject?.name ?? ''}
          client={currentProject?.client}
          locationCount={locations.length}
          totalPower={totalInstalled}
        />
      );
    }

    return (
      <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
        Sélectionnez un élément pour voir le résumé
      </div>
    );
  };

  return (
    <aside className="w-infopanel flex-shrink-0 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-primary dark:text-accent-light">Résumé</h3>
        <button
          type="button"
          onClick={toggleInfoPanel}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xs"
          title="Masquer"
        >
          ▶
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">{renderContent()}</div>
    </aside>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-gray-100 dark:border-gray-700 last:border-0">
      <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
      <span className="text-sm font-semibold text-gray-900 dark:text-white">{value}</span>
    </div>
  );
}

function PanelSummary({
  panelName,
  elementCount,
  installed,
  absorbed,
  current,
  breaker,
  generalBreaker,
}: {
  panelName: string;
  elementCount: number;
  installed: number;
  absorbed: number;
  current: number;
  breaker: number;
  generalBreaker: number;
}) {
  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs text-gray-500 uppercase tracking-wide">Tableau</p>
        <p className="font-semibold text-primary dark:text-white">{panelName}</p>
      </div>
      <StatRow label="Éléments" value={String(elementCount)} />
      <StatRow label="P. installée" value={formatPower(installed)} />
      <StatRow label="P. absorbée (ks=0.8)" value={formatPower(absorbed)} />
      <StatRow label="I. calcul" value={`${formatNumber(current)} A`} />
      <StatRow label="DJ recommandé" value={`${breaker} A`} />
      {generalBreaker > 0 && (
        <StatRow label="DJ général" value={`${generalBreaker} A`} />
      )}
    </div>
  );
}

function LocationSummary({
  name,
  panelCount,
  installed,
  absorbed,
}: {
  name: string;
  panelCount: number;
  installed: number;
  absorbed: number;
}) {
  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs text-gray-500 uppercase tracking-wide">Localisation</p>
        <p className="font-semibold text-primary dark:text-white">{name}</p>
      </div>
      <StatRow label="Tableaux" value={String(panelCount)} />
      <StatRow label="P. installée totale" value={formatPower(installed)} />
      <StatRow label="P. absorbée totale" value={formatPower(absorbed)} />
    </div>
  );
}

function ProjectSummary({
  name,
  client,
  locationCount,
  totalPower,
}: {
  name: string;
  client: string | null | undefined;
  locationCount: number;
  totalPower: number;
}) {
  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs text-gray-500 uppercase tracking-wide">Projet</p>
        <p className="font-semibold text-primary dark:text-white">{name}</p>
        {client && (
          <p className="text-xs text-gray-500 mt-0.5">{client}</p>
        )}
      </div>
      <StatRow label="Localisations" value={String(locationCount)} />
      <StatRow label="Puissance totale" value={formatPower(totalPower)} />
    </div>
  );
}
