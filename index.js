import { h, render, useState, useEffect } from './assets/preact.esm.js';
import Router from './commons/components/Router.jsx';
import Route from './commons/components/Route.jsx';
import useAuth from './commons/auth/useAuth.jsx';
import LoadingPage from './commons/components/LoadingPage.jsx';
import NotesPage from "./features/notes/NotesPage.jsx";
import TemplatesPage from "./features/templates/TemplatesPage.jsx";
import CanvasPage from "./features/canvas/CanvasPage.jsx";
import CanvasesPage from "./features/canvas/CanvasesPage.jsx";
import LoginPage from './features/users/LoginPage.jsx';
import navigateTo from './commons/utils/navigateTo.js';
import SearchMenu from './features/search/SearchMenu.jsx';
import OfflineIndicator from './commons/components/OfflineIndicator.jsx';
import Tooltip from './commons/components/Tooltip.js';
//import { initI18n } from './commons/i18n/index.js';

import { AppProvider } from './commons/contexts/AppContext.jsx';
import ThemePreferences from './commons/preferences/ThemePreferences.js';


function Shell() {
  const [langVersion, setLangVersion] = useState(0);
  useEffect(() => {
    const onChange = () => setLangVersion(v => v + 1);
    window.addEventListener('i18n:change', onChange);
    return () => window.removeEventListener('i18n:change', onChange);
  }, []);
  return <App langVersion={langVersion} />;
}

document.addEventListener('DOMContentLoaded', () => {
  ThemePreferences.applyTheme();
  Tooltip.init();
  //initI18n();
  render(
    <Shell />,
    document.body
  );
});

document.addEventListener("keydown", e => {
  if (e.ctrlKey && e.key === 'n') {
    e.preventDefault();
    navigateTo("/notes/new");
    return;
  }

  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    render(<SearchMenu />, document.querySelector('.modal-root'));
  }

  if (e.key === 'Escape') {
    if (document.querySelector('.modal-root').firstChild) {
      e.preventDefault();
      render(null, document.querySelector('.modal-root'));
    }
  }
});

function App() {
  const { isLoading, shouldShowLogin, shouldShowOnboarding } = useAuth();

  if (isLoading) {
    return <LoadingPage />;
  }

  if (shouldShowLogin) {
    return <LoginPage />;
  }

  if (shouldShowOnboarding) {
    return <LoginPage isOnboarding />;
  }

  return (
    <AppProvider>
      <OfflineIndicator />
      <Router>
        <Route path="/" component={NotesPage} />
        <Route path="/notes/" component={NotesPage} />
        <Route path="/notes/:noteId" component={NotesPage} />
        <Route path="/templates/" component={TemplatesPage} />
        <Route path="/templates/:templateId" component={TemplatesPage} />
        <Route path="/canvases/" component={CanvasesPage} />
        <Route path="/canvases/:canvasId" component={CanvasPage} />
      </Router>
    </AppProvider>
  );
}