import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Plus, Save, Settings, Zap, Tag } from "lucide-react";

interface QuickActionsMenuProps {
  onAddJdb?: () => void;
  onConfigurePrefix?: () => void;
  onSave?: () => void;
  canSave?: boolean;
}

export function QuickActionsMenu({
  onAddJdb,
  onConfigurePrefix,
  onSave,
  canSave = true,
}: QuickActionsMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  // Close menu when route changes
  useEffect(() => {
    setIsOpen(false);
  }, [location.pathname]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const menu = document.getElementById("quick-actions-menu");
      const fab = document.getElementById("quick-actions-fab");
      
      if (menu && !menu.contains(target) && fab && !fab.contains(target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  const isPanelView = location.pathname.includes("/panel/");
  const isSettingsView = location.pathname === "/settings";

  const actions = [
    {
      icon: Zap,
      label: "Ajouter Jeu de Barres",
      onClick: onAddJdb,
      visible: isPanelView && !!onAddJdb,
      color: "bg-amber-500 hover:bg-amber-600",
    },
    {
      icon: Tag,
      label: "Configurer Préfixe",
      onClick: onConfigurePrefix,
      visible: isPanelView && !!onConfigurePrefix,
      color: "bg-purple-500 hover:bg-purple-600",
    },
    {
      icon: Save,
      label: "Enregistrer",
      onClick: onSave,
      visible: isPanelView && !!onSave && canSave,
      color: "bg-green-500 hover:bg-green-600",
    },
    {
      icon: Settings,
      label: "Paramètres rapides",
      onClick: () => navigate("/settings"),
      visible: !isSettingsView,
      color: "bg-gray-500 hover:bg-gray-600",
    },
  ].filter((action) => action.visible);

  const visibleActions = actions.slice(0, 4);

  if (visibleActions.length === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {/* Circular Menu */}
      {isOpen && (
        <div
          id="quick-actions-menu"
          className="absolute bottom-16 right-0 flex items-center justify-center"
        >
          <div className="relative w-48 h-48">
            {visibleActions.map((action, index) => {
              const Icon = action.icon;
              // Calculate position in a semi-circle above the FAB
              const angle = 180 - (index * (180 / (visibleActions.length - 1 || 1)));
              const radius = 70;
              const x = radius * Math.cos((angle * Math.PI) / 180);
              const y = -radius * Math.sin((angle * Math.PI) / 180);

              return (
                <button
                  key={action.label}
                  type="button"
                  onClick={() => {
                    action.onClick?.();
                    setIsOpen(false);
                  }}
                  className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 
                    ${action.color} text-white p-3 rounded-full shadow-lg 
                    transition-all duration-300 hover:scale-110 active:scale-95
                    ${isOpen ? "opacity-100 scale-100" : "opacity-0 scale-0"}`}
                  style={{
                    transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`,
                  }}
                  title={action.label}
                >
                  <Icon size={20} />
                  <span className="sr-only">{action.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* FAB Button */}
      <button
        id="quick-actions-fab"
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-14 h-14 rounded-full shadow-lg flex items-center justify-center 
          transition-all duration-300 hover:scale-110 active:scale-95
          ${isOpen ? "bg-red-500 hover:bg-red-600 rotate-45" : "bg-blue-600 hover:bg-blue-700"}`}
        title="Actions rapides"
      >
        <Plus size={28} className="text-white transition-transform duration-300" />
      </button>
    </div>
  );
}
