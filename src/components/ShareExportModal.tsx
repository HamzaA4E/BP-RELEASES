import { useState } from 'react';
import {
  CheckCircle2,
  MessageCircle,
  Mail,
  Usb,
  Cloud,
  Copy,
  Check,
} from 'lucide-react';

interface ShareExportModalProps {
  isOpen: boolean;
  projectName: string;
  filePath: string;
  onClose: () => void;
}

const SHARE_METHODS = [
  {
    icon: MessageCircle,
    iconClass: 'text-green-600 bg-green-50 dark:bg-green-900/30',
    title: 'Via WhatsApp',
    getInstructions: (fileName: string) =>
      `Ouvrez WhatsApp → choisissez un contact → cliquez sur l'icône pièce jointe → sélectionnez le fichier ${fileName}`,
  },
  {
    icon: Mail,
    iconClass: 'text-blue-600 bg-blue-50 dark:bg-blue-900/30',
    title: 'Via Email',
    getInstructions: () =>
      'Créez un nouvel email → ajoutez le fichier .bilpow en pièce jointe → envoyez à votre collègue',
  },
  {
    icon: Usb,
    iconClass: 'text-slate-600 bg-slate-100 dark:bg-slate-700/50 dark:text-slate-300',
    title: 'Via Clé USB',
    getInstructions: () =>
      'Copiez le fichier .bilpow sur votre clé USB et donnez-la à votre collègue',
  },
  {
    icon: Cloud,
    iconClass: 'text-sky-600 bg-sky-50 dark:bg-sky-900/30',
    title: 'Via Cloud',
    getInstructions: () =>
      'Uploadez le fichier sur Google Drive, OneDrive ou Dropbox et partagez le lien',
  },
] as const;

export function ShareExportModal({
  isOpen,
  projectName,
  filePath,
  onClose,
}: ShareExportModalProps) {
  const [copied, setCopied] = useState(false);
  const fileName = `${projectName.replace(/[<>:"/\\|?*]/g, '_')}.bilpow`;

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(filePath);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="card w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-8 h-8 text-green-600 flex-shrink-0" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Projet exporté avec succès !
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Le dossier contenant le fichier s&apos;est ouvert. Partagez-le avec l&apos;une de
                ces méthodes :
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-3">
          {SHARE_METHODS.map(({ icon: Icon, iconClass, title, getInstructions }) => (
            <div
              key={title}
              className="flex gap-3 p-3 rounded-lg border border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30"
            >
              <div
                className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${iconClass}`}
              >
                <Icon className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-medium text-sm text-gray-900 dark:text-white">{title}</h3>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5 leading-relaxed">
                  {getInstructions(fileName)}
                </p>
              </div>
            </div>
          ))}

          <div className="pt-2">
            <p className="text-xs font-medium text-gray-500 mb-1.5">Emplacement du fichier</p>
            <div className="flex gap-2">
              <code className="flex-1 text-xs bg-gray-100 dark:bg-gray-900 px-3 py-2 rounded-lg break-all text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-600">
                {filePath}
              </code>
              <button
                type="button"
                onClick={() => void handleCopy()}
                className="btn-secondary px-3 flex-shrink-0"
                title="Copier le chemin"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        <div className="p-6 pt-0 flex justify-end">
          <button type="button" onClick={onClose} className="btn-primary">
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
