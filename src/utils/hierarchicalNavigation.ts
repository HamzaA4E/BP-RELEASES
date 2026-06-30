import { NavigateFunction } from 'react-router-dom';

/**
 * Navigation hiérarchique pour le bouton Retour
 * Ne dépend pas de l'historique du navigateur, mais suit la structure métier :
 * Tableau → Emplacement → Projet → Dashboard
 */

export interface NavigationContext {
  projectId?: string;
  locationId?: string;
  panelId?: string;
}

/**
 * Extrait les IDs de navigation depuis le pathname
 */
export function extractNavigationContext(pathname: string): NavigationContext {
  const parts = pathname.split('/').filter(Boolean);
  
  const context: NavigationContext = {};
  
  // Pattern: /project/:projectId/location/:locationId/panel/:panelId
  const projectIndex = parts.indexOf('project');
  if (projectIndex !== -1 && parts[projectIndex + 1]) {
    context.projectId = parts[projectIndex + 1];
  }
  
  const locationIndex = parts.indexOf('location');
  if (locationIndex !== -1 && parts[locationIndex + 1]) {
    context.locationId = parts[locationIndex + 1];
  }
  
  const panelIndex = parts.indexOf('panel');
  if (panelIndex !== -1 && parts[panelIndex + 1]) {
    context.panelId = parts[panelIndex + 1];
  }
  
  return context;
}

/**
 * Détermine la route parente selon la hiérarchie métier
 */
export function getParentRoute(context: NavigationContext): string {
  // Niveau Tableau → Emplacement
  if (context.panelId && context.locationId && context.projectId) {
    return `/project/${context.projectId}/location/${context.locationId}`;
  }
  
  // Niveau Emplacement → Projet
  if (context.locationId && context.projectId) {
    return `/project/${context.projectId}`;
  }
  
  // Niveau Projet → Dashboard
  if (context.projectId) {
    return '/';
  }
  
  // Dashboard ou autre → Dashboard (par défaut)
  return '/';
}

/**
 * Fonction de navigation hiérarchique
 * À utiliser à la place de navigate(-1) ou history.back()
 */
export function navigateHierarchically(navigate: NavigateFunction, pathname: string): void {
  const context = extractNavigationContext(pathname);
  const parentRoute = getParentRoute(context);
  navigate(parentRoute);
}

/**
 * Détermine si le bouton Retour doit être affiché
 * Le bouton est caché sur le Dashboard
 */
export function shouldShowBackButton(pathname: string): boolean {
  return pathname !== '/' && pathname !== '';
}
