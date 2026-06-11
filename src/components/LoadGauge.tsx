import { formatNumber, formatPower } from '@/utils/calculations';

interface LoadGaugeProps {
  totalPowerW: number;
  calcCurrentA: number;
}

export function LoadGauge({ totalPowerW, calcCurrentA }: LoadGaugeProps) {
  return (
    <div className="card p-4">
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
          </p>
        </div>
      </div>
    </div>
  );
}
