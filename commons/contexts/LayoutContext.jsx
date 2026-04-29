import { h, createContext, useContext, useState, useCallback, useEffect } from '../../assets/preact.esm.js';
import isMobile from '../utils/isMobile.js';

const defaultValue = {
  isSidebarOpen: false,
  isEditorExpanded: false,
  toggleSidebar: () => {},
  closeSidebar: () => {},
  toggleEditorExpanded: () => {},
};

const LayoutContext = createContext(defaultValue);

export function LayoutProvider({ children }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(!isMobile());
  const [isEditorExpanded, setIsEditorExpanded] = useState(() => {
    try { return localStorage.getItem('zen.editorExpanded') === 'true'; } catch { return false; }
  });

  const toggleSidebar = useCallback(() => {
    setIsSidebarOpen(prev => !prev);
  }, []);

  const closeSidebar = useCallback(() => {
    setIsSidebarOpen(false);
  }, []);

  const toggleEditorExpanded = useCallback(() => {
    setIsEditorExpanded(prev => {
      const next = !prev;
      try { localStorage.setItem('zen.editorExpanded', String(next)); } catch {}
      return next;
    });
  }, []);

  useEffect(() => {
    function handleNavigationChange() {
      queueMicrotask(() => setIsSidebarOpen(false));
    }

    window.addEventListener('navigate', handleNavigationChange);

    return () => {
      window.removeEventListener('navigate', handleNavigationChange);
    };
  }, []);

  return (
    <LayoutContext.Provider value={{
      isSidebarOpen,
      isEditorExpanded,
      toggleSidebar,
      closeSidebar,
      toggleEditorExpanded,
    }}>
      {children}
    </LayoutContext.Provider>
  );
}

export function useLayout() {
  return useContext(LayoutContext);
}
