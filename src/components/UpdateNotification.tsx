import { useEffect, useState } from 'react';
import { Download, X, Check, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';

interface UpdateProgressData {
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
  transferredFormatted: string;
  totalFormatted: string;
  speedFormatted: string;
}

interface UpdateAvailableData {
  version: string;
  releaseDate?: string;
  releaseNotes?: string;
}

export function UpdateNotification() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateDownloaded, setUpdateDownloaded] = useState(false);
  const [updateProgress, setUpdateProgress] = useState<UpdateProgressData | null>(null);
  const [updateInfo, setUpdateInfo] = useState<UpdateAvailableData | null>(null);
  const [showNotification, setShowNotification] = useState(false);

  useEffect(() => {
    // Listen for update available event
    const unsubscribeAvailable = window.bilpow.update.onUpdateAvailable((data) => {
      console.log('[UpdateNotification] Update available:', data);
      setUpdateInfo(data);
      setUpdateAvailable(true);
      // Don't show notification yet, wait for download
    });

    // Listen for update not available event
    const unsubscribeNotAvailable = window.bilpow.update.onUpdateNotAvailable((data) => {
      console.log('[UpdateNotification] No update available:', data);
      toast.success('BilPow est à jour', {
        id: 'update-check',
      });
    });

    // Listen for download progress
    const unsubscribeProgress = window.bilpow.update.onUpdateProgress((data) => {
      console.log('[UpdateNotification] Download progress:', data);
      setUpdateProgress(data);
      if (!showNotification && updateAvailable) {
        setShowNotification(true);
      }
    });

    // Listen for update downloaded
    const unsubscribeDownloaded = window.bilpow.update.onUpdateDownloaded((data) => {
      console.log('[UpdateNotification] Update downloaded:', data);
      setUpdateDownloaded(true);
      setUpdateProgress(null);
      setShowNotification(true);
      toast.success('Mise à jour téléchargée avec succès', {
        id: 'update-downloaded',
      });
    });

    // Listen for update errors
    const unsubscribeError = window.bilpow.update.onUpdateError((data) => {
      console.error('[UpdateNotification] Update error:', data);
      toast.error(`Erreur de mise à jour: ${data.message}`, {
        id: 'update-error',
        duration: 5000,
      });
      setUpdateAvailable(false);
      setUpdateDownloaded(false);
      setUpdateProgress(null);
      setShowNotification(false);
    });

    return () => {
      unsubscribeAvailable();
      unsubscribeNotAvailable();
      unsubscribeProgress();
      unsubscribeDownloaded();
      unsubscribeError();
    };
  }, [updateAvailable, showNotification]);

  const handleInstallNow = async () => {
    try {
      await window.bilpow.update.installUpdate();
      toast.success('Installation de la mise à jour...', {
        id: 'update-install',
      });
    } catch (error) {
      console.error('[UpdateNotification] Install error:', error);
      toast.error('Erreur lors de l\'installation', {
        id: 'update-install-error',
      });
    }
  };

  const handleInstallLater = () => {
    setShowNotification(false);
    toast('La mise à jour sera installée au prochain redémarrage', {
      id: 'update-later',
    });
  };

  const handleClose = () => {
    setShowNotification(false);
  };

  if (!showNotification) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-md">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            {updateDownloaded ? (
              <Check className="w-5 h-5 text-green-500" />
            ) : updateProgress ? (
              <Download className="w-5 h-5 text-blue-500 animate-pulse" />
            ) : (
              <AlertCircle className="w-5 h-5 text-orange-500" />
            )}
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">
              {updateDownloaded ? 'Mise à jour prête' : 'Mise à jour disponible'}
            </h3>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {updateInfo && (
          <div className="mb-3">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Version {updateInfo.version}
              {updateInfo.releaseDate && (
                <span className="ml-2">
                  ({new Date(updateInfo.releaseDate).toLocaleDateString('fr-FR')})
                </span>
              )}
            </p>
            {updateInfo.releaseNotes && (
              <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                {updateInfo.releaseNotes}
              </p>
            )}
          </div>
        )}

        {updateProgress && (
          <div className="mb-3">
            <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
              <span>Téléchargement...</span>
              <span>{updateProgress.percent.toFixed(1)}%</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${updateProgress.percent}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-gray-500 dark:text-gray-500 mt-1">
              <span>{updateProgress.transferredFormatted} / {updateProgress.totalFormatted}</span>
              <span>{updateProgress.speedFormatted}</span>
            </div>
          </div>
        )}

        {updateDownloaded && (
          <div className="mb-3">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Une nouvelle version de BilPow est prête à être installée.
            </p>
          </div>
        )}

        {updateDownloaded && (
          <div className="flex gap-2">
            <button
              onClick={handleInstallNow}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
            >
              Installer maintenant
            </button>
            <button
              onClick={handleInstallLater}
              className="flex-1 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 px-4 py-2 rounded-md text-sm font-medium transition-colors"
            >
              Plus tard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
