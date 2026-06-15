import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useAppStore } from '@/store/useAppStore';
import type { CompanySettings } from '@/types';

const defaultSettings: CompanySettings = {
  id: 1,
  company_name: '',
  address: '',
  phone: '',
  email: '',
  website: '',
  logo_path: '',
  logo_base64: '',
  logo_mime: '',
  client_logo_path: '',
  client_logo_base64: '',
  client_logo_mime: '',
  updated_at: '',
};

function logoDataUri(base64: string, mime: string): string | null {
  if (!base64 || !mime) return null;
  return `data:${mime};base64,${base64}`;
}

export function SettingsPage() {
  const { updateCompany } = useAppStore();
  const [settings, setSettings] = useState<CompanySettings>(defaultSettings);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void window.bilpow.settings.get().then((data) => {
      setSettings(data);
      updateCompany(data);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, []);

  const handleSave = async () => {
    if (!settings.company_name.trim()) {
      toast.error('Le nom de la société est requis');
      return;
    }
    setIsSaving(true);
    try {
      await window.bilpow.settings.save({
        company_name: settings.company_name,
        address: settings.address,
        phone: settings.phone,
        email: settings.email,
        website: settings.website,
      });
      updateCompany({
        company_name: settings.company_name,
        address: settings.address,
        phone: settings.phone,
        email: settings.email,
        website: settings.website,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      toast.success('Informations enregistrées');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUploadLogo = async () => {
    try {
      const result = await window.bilpow.settings.uploadLogo();
      if (!result) return;
      setSettings((prev) => ({
        ...prev,
        logo_base64: result.base64,
        logo_mime: result.mime,
        logo_path: result.path,
      }));
      updateCompany({
        logo_base64: result.base64,
        logo_mime: result.mime,
        logo_path: result.path,
      });
      toast.success('Logo enregistré avec succès');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur');
    }
  };

  const handleRemoveLogo = async () => {
    try {
      await window.bilpow.settings.removeLogo();
      setSettings((prev) => ({
        ...prev,
        logo_base64: '',
        logo_mime: '',
        logo_path: '',
      }));
      updateCompany({ logo_base64: '', logo_mime: '', logo_path: '' });
      toast.success('Logo supprimé');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur');
    }
  };

  const handleUploadClientLogo = async () => {
    try {
      const result = await window.bilpow.settings.uploadClientLogo();
      if (!result) return;
      setSettings((prev) => ({
        ...prev,
        client_logo_base64: result.base64,
        client_logo_mime: result.mime,
        client_logo_path: result.path,
      }));
      updateCompany({
        client_logo_base64: result.base64,
        client_logo_mime: result.mime,
        client_logo_path: result.path,
      });
      toast.success('Logo client enregistré avec succès');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur');
    }
  };

  const handleRemoveClientLogo = async () => {
    try {
      await window.bilpow.settings.removeClientLogo();
      setSettings((prev) => ({
        ...prev,
        client_logo_base64: '',
        client_logo_mime: '',
        client_logo_path: '',
      }));
      updateCompany({
        client_logo_base64: '',
        client_logo_mime: '',
        client_logo_path: '',
      });
      toast.success('Logo client supprimé');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur');
    }
  };

  const companyPreviewUri = logoDataUri(settings.logo_base64, settings.logo_mime);
  const clientPreviewUri = logoDataUri(settings.client_logo_base64, settings.client_logo_mime);

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold text-primary dark:text-white mb-2">
          Paramètres société
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          Les logos société et client apparaîtront sur tous les exports Excel (gauche et droite de
          l&apos;en-tête).
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left column — form */}
          <div className="lg:col-span-3 space-y-6">
            {/* <section className="card p-5">
              <h2 className="font-semibold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                <span>🏢</span> Informations de la société
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Nom de la société *
                  </label>
                  <input
                    type="text"
                    value={settings.company_name}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, company_name: e.target.value }))
                    }
                    className="input-field"
                    placeholder="Ex: Électricité Martin SARL"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Adresse
                  </label>
                  <textarea
                    value={settings.address}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, address: e.target.value }))
                    }
                    className="input-field resize-none"
                    rows={2}
                    placeholder="12 rue de la Paix, 75002 Paris"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Téléphone
                    </label>
                    <input
                      type="text"
                      value={settings.phone}
                      onChange={(e) =>
                        setSettings((s) => ({ ...s, phone: e.target.value }))
                      }
                      className="input-field"
                      placeholder="+33 1 23 45 67 89"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Email
                    </label>
                    <input
                      type="email"
                      value={settings.email}
                      onChange={(e) =>
                        setSettings((s) => ({ ...s, email: e.target.value }))
                      }
                      className="input-field"
                      placeholder="contact@societe.fr"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Site web
                  </label>
                  <input
                    type="url"
                    value={settings.website}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, website: e.target.value }))
                    }
                    className="input-field"
                    placeholder="https://"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={isSaving}
                className="btn-primary w-full mt-5"
              >
                {isSaving
                  ? 'Enregistrement...'
                  : saved
                    ? '✓ Enregistré'
                    : 'Enregistrer les informations'}
              </button>
            </section> */}

            <section className="card p-5">
              <h2 className="font-semibold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                <span>🖼️</span> Logo de la société
              </h2>

              {settings.logo_base64 ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-600">
                    <img
                      src={companyPreviewUri ?? undefined}
                      alt="Logo société"
                      className="max-h-16 max-w-[200px] object-contain"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-500 truncate">{settings.logo_path}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void handleUploadLogo()}
                      className="btn-secondary flex-1"
                    >
                      Changer le logo
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleRemoveLogo()}
                      className="btn-danger flex-1"
                    >
                      Supprimer
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleUploadLogo()}
                  className="w-full border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-8 text-center hover:border-accent hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-colors"
                >
                  <div className="text-4xl mb-2">📷</div>
                  <p className="font-medium text-gray-700 dark:text-gray-200">
                    Cliquez pour choisir votre logo
                  </p>
                  <p className="text-sm text-gray-500 mt-1">PNG, JPG ou SVG — 2 Mo maximum</p>
                  <p className="text-xs text-gray-400 mt-2">
                    Recommandé : fond transparent, ratio 3:1 ou 4:1
                  </p>
                </button>
              )}

              <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-xs text-gray-600 dark:text-gray-300 space-y-1">
                <p className="font-medium">ℹ️ Conseils pour un rendu optimal dans les exports :</p>
                <ul className="list-disc list-inside space-y-0.5 text-gray-500 dark:text-gray-400">
                  <li>Utilisez un logo sur fond transparent (PNG recommandé)</li>
                  <li>Résolution minimale recommandée : 300×100 px</li>
                  <li>
                    Le logo société apparaîtra en haut à gauche, le logo client en haut à droite de
                    chaque feuille Excel
                  </li>
                </ul>
              </div>
            </section>

            <section className="card p-5">
              <h2 className="font-semibold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                <span>🏢</span> Logo du client
              </h2>

              {settings.client_logo_base64 ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-600">
                    <img
                      src={clientPreviewUri ?? undefined}
                      alt="Logo client"
                      className="max-h-16 max-w-[200px] object-contain"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-500 truncate">{settings.client_logo_path}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void handleUploadClientLogo()}
                      className="btn-secondary flex-1"
                    >
                      Changer le logo
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleRemoveClientLogo()}
                      className="btn-danger flex-1"
                    >
                      Supprimer
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleUploadClientLogo()}
                  className="w-full border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-8 text-center hover:border-accent hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-colors"
                >
                  <div className="text-4xl mb-2">🏢</div>
                  <p className="font-medium text-gray-700 dark:text-gray-200">
                    Cliquez pour choisir le logo du client
                  </p>
                  <p className="text-sm text-gray-500 mt-1">PNG, JPG ou SVG — 2 Mo maximum</p>
                  <p className="text-xs text-gray-400 mt-2">
                    Recommandé : fond transparent, ratio 3:1 ou 4:1
                  </p>
                </button>
              )}

              <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-xs text-gray-600 dark:text-gray-300 space-y-1">
                <p className="font-medium">ℹ️ Ce logo remplace les informations société à droite :</p>
                <ul className="list-disc list-inside space-y-0.5 text-gray-500 dark:text-gray-400">
                  <li>Affiché en haut à droite de chaque export Excel</li>
                  <li>Sans logo client, le nom du client du projet sera affiché à la place</li>
                </ul>
              </div>
            </section>
          </div>

          {/* Right column — preview */}
          <div className="lg:col-span-2">
            <div className="card p-4 sticky top-4">
              <h2 className="font-semibold text-gray-800 dark:text-white mb-3 text-sm">
                Aperçu dans les exports
              </h2>

              <div className="rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600 shadow-sm">
                <div
                  className="flex items-stretch min-h-[72px]"
                  style={{ backgroundColor: '#1E3A5F' }}
                >
                  <div className="w-[28%] flex items-center justify-center p-2 border-r border-white/10">
                    {companyPreviewUri ? (
                      <img
                        src={companyPreviewUri}
                        alt="Logo société"
                        className="max-h-12 max-w-full object-contain"
                      />
                    ) : (
                      <span className="text-white/50 text-xs text-center px-1">Logo société</span>
                    )}
                  </div>
                  <div className="flex-1 flex items-center justify-center px-2">
                    <p className="text-white text-[10px] font-bold text-center leading-tight">
                      BILAN DE PUISSANCE — NOM DU PROJET — RDC
                    </p>
                  </div>
                  <div className="w-[28%] flex items-center justify-center p-2 border-l border-white/10">
                    {clientPreviewUri ? (
                      <img
                        src={clientPreviewUri}
                        alt="Logo client"
                        className="max-h-12 max-w-full object-contain"
                      />
                    ) : (
                      <span className="text-white/50 text-xs text-center px-1">Logo client</span>
                    )}
                  </div>
                </div>

                <div className="bg-blue-100 dark:bg-blue-900/30 px-2 py-1 text-center">
                  <p className="text-[9px] text-slate-600 dark:text-slate-300 italic">
                    Date : {new Date().toLocaleDateString('fr-FR')}
                  </p>
                </div>

                <table className="w-full text-[9px]">
                  <thead>
                    <tr className="bg-primary text-white">
                      {['N°', 'Type', 'Repère', 'Désignation', 'P.(W)', 'Qté', 'Total'].map(
                        (h) => (
                          <th key={h} className="px-1 py-1.5 font-semibold text-center">
                            {h}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ['1', 'Éclairage', 'E1', 'Panneau LED 36W', '36', '4', '144'],
                      ['2', 'Prise', 'P1', 'Prise 2P+T', '200', '6', '1200'],
                    ].map((row, ri) => (
                      <tr
                        key={ri}
                        className={ri % 2 === 1 ? 'bg-gray-50 dark:bg-gray-900/50' : ''}
                      >
                        {row.map((cell, ci) => (
                          <td
                            key={ci}
                            className="px-1 py-1 text-center border-t border-gray-100 dark:border-gray-700"
                          >
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="text-[10px] text-gray-400 mt-3 text-center italic">
                Aperçu non contractuel — rendu final dans le fichier exporté
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
