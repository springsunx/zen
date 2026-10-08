import { h, useState } from "../../assets/preact.esm.js";
import Toggle from "../../commons/components/Toggle.jsx";
import SidebarPreferences, { SIDEBAR_ITEMS, SIDEBAR_POSITIONS } from "../../commons/preferences/SidebarPreferences.js";
import { t } from "../../commons/i18n/index.js";

const itemKeys = {
  canvas: "settings.sidebar.items.canvas",
  templates: "settings.sidebar.items.templates",
  clipboard: "settings.sidebar.items.clipboard",
  files: "settings.sidebar.items.files",
  archives: "settings.sidebar.items.archives",
  trash: "settings.sidebar.items.trash",
  shares: "settings.sidebar.items.shares",
};

export default function SidebarPane() {
  const [preferences, setPreferences] = useState(() => SidebarPreferences.getPreferences());
  const { visibility, positions } = preferences;

  function handlePlacementChange(item, position, isEnabled) {
    const next = {
      ...preferences,
      visibility: { ...visibility, [item]: isEnabled },
      positions: { ...positions, [item]: position },
    };
    setPreferences(next);
    if (isEnabled) {
      SidebarPreferences.setPosition(item, position);
      SidebarPreferences.setVisible(item, true);
    } else {
      SidebarPreferences.setVisible(item, false);
    }
  }

  return (
    <div className="settings-tab-content">
      <h3>{t("settings.sidebar.title")}</h3>
      <p>{t("settings.sidebar.desc")}</p>
      <div className="settings-sidebar-options-header" aria-hidden="true">
        <span />
        <span>{t("settings.sidebar.left")}</span>
        <span>{t("settings.sidebar.right")}</span>
      </div>
      {SIDEBAR_ITEMS.map((item) => (
        <div className="settings-toggle-option" key={item}>
          <div className="settings-toggle-info">
            <div className="settings-toggle-label">{t(itemKeys[item])}</div>
          </div>
          <Toggle isEnabled={visibility[item] === true && positions[item] === SIDEBAR_POSITIONS.PRIMARY} onChange={(value) => handlePlacementChange(item, SIDEBAR_POSITIONS.PRIMARY, value)} />
          <Toggle isEnabled={visibility[item] === true && positions[item] === SIDEBAR_POSITIONS.RAIL} onChange={(value) => handlePlacementChange(item, SIDEBAR_POSITIONS.RAIL, value)} />
        </div>
      ))}
    </div>
  );
}
