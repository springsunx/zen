import { h, useState } from "../../assets/preact.esm.js";
import Toggle from "../../commons/components/Toggle.jsx";
import SidebarPreferences, { SIDEBAR_ITEMS } from "../../commons/preferences/SidebarPreferences.js";
import { t } from "../../commons/i18n/index.js";

const itemKeys = {
  canvas: "settings.sidebar.items.canvas",
  templates: "settings.sidebar.items.templates",
  clipboard: "settings.sidebar.items.clipboard",
  archives: "settings.sidebar.items.archives",
  trash: "settings.sidebar.items.trash",
  shares: "settings.sidebar.items.shares",
};

export default function SidebarPane() {
  const [visibility, setVisibility] = useState(() => SidebarPreferences.getVisibility());

  function handleChange(item, isVisible) {
    const next = { ...visibility, [item]: isVisible };
    setVisibility(next);
    SidebarPreferences.setVisible(item, isVisible);
  }

  return (
    <div className="settings-tab-content">
      <h3>{t("settings.sidebar.title")}</h3>
      <p>{t("settings.sidebar.desc")}</p>
      {SIDEBAR_ITEMS.map((item) => (
        <div className="settings-toggle-option" key={item}>
          <div className="settings-toggle-info">
            <div className="settings-toggle-label">{t(itemKeys[item])}</div>
          </div>
          <Toggle isEnabled={visibility[item] === true} onChange={(value) => handleChange(item, value)} />
        </div>
      ))}
    </div>
  );
}
