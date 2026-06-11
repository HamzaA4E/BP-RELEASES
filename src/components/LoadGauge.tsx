import { formatNumber, formatPower } from '@/utils/calculations';

interface LoadGaugeProps {
  totalPowerW: number;
  calcCurrentA: number;
  breakerAmpere: number;
}

export function LoadGauge({ totalPowerW, calcCurrentA, breakerAmpere }: LoadGaugeProps) {
  const loadPercent =
    breakerAmpere > 0 ? Math.min(100, (calcCurrentA / breakerAmpere) * 100) : 0;
  const isWarning = loadPercent >= 80 && loadPercent < 100;
  const isDanger = loadPercent >= 100;

  const barColor = isDanger
    ? 'bg-red-500'
    : isWarning
      ? 'bg-amber-500'
      : 'bg-emerald-500';

  return (
    <div className="card p-4 space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Charge du tableau
          </p>
          <p className="text-lg font-bold text-primary dark:text-white mt-0.5">
            {formatPower(totalPowerW)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500">Intensité de calcul</p>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            {formatNumber(calcCurrentA, 2)} A
            {breakerAmpere > 0 && (
              <span className="text-gray-400 font-normal"> / {breakerAmpere} A</span>
            )}
          </p>
        </div>
      </div>

      {breakerAmpere > 0 && (
        <>
          <div className="h-2.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${barColor}`}
              style={{ width: `${loadPercent}%` }}
            />
          </div>
          {(isWarning || isDanger) && (
            <p
              className={`text-xs font-medium ${isDanger ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}
            >
              {isDanger
                ? '⚠ Charge supérieure au disjoncteur général'
                : '⚠ Charge proche de la limite du disjoncteur'}
            </p>
          )}
        </>
      )}
    </div>
  );
}
