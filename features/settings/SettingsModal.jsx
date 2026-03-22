import { h, useState, useEffect } from "../../assets/preact.esm.js"
import { ModalBackdrop, ModalContainer, ModalHeader, closeModal } from "../../commons/components/Modal.jsx";
import { UploadIcon, DownloadIcon, ThemeIcon, BrainCircuitIcon, SecurityIcon } from "../../commons/components/Icon.jsx";
import ImportPane from "./ImportPane.jsx";
import ExportPane from "./ExportPane.jsx";
import AppearancePane from "./AppearancePane.jsx";
import McpPane from "./McpPane.jsx";
import SecurityPane from "./SecurityPane.jsx";
import { t } from "../../commons/i18n/index.js";
import "./SettingsModal.css";

export default function SettingsModal() {
  const [activeTab, setActiveTab] = useState("appearance");
  const [langVersion, setLangVersion] = useState(0);
  useEffect(() => {
    const onChange = () => setLangVersion(v => v + 1);
    window.addEventListener("i18n:change", onChange);
    return () => window.removeEventListener("i18n:change", onChange);
  }, []);

  const tabs = [
    { id: "appearance", label: t("settings.tabs.appearance"), icon: <ThemeIcon className="settings-tab-icon" />, content: <AppearancePane /> },
    { id: "account", label: t("settings.tabs.security"), icon: <SecurityIcon className="settings-tab-icon" />, content: <SecurityPane /> },
    { id: "import", label: t("settings.tabs.import"), icon: <UploadIcon className="settings-tab-icon" />, content: <ImportPane /> },
    { id: "export", label: t("settings.tabs.export"), icon: <DownloadIcon className="settings-tab-icon" />, content: <ExportPane /> },
    { id: "mcp", label: t("settings.tabs.mcp"), icon: <BrainCircuitIcon className="settings-tab-icon" />, content: <McpPane /> }
  ];

  function handleCloseModal() {
    closeModal();
  }

  function handleTabClick(tabId) {
    setActiveTab(tabId);
  }

  const sidebar = tabs.map(tab => (
    <div key={tab.id} className={`settings-tab ${activeTab === tab.id ? 'is-active' : ''}`} onClick={() => handleTabClick(tab.id)}>
      {tab.icon}
      {tab.label}
    </div>
  ));

  const paneContent = tabs.find(tab => tab.id === activeTab).content || null;

  return (
    <ModalBackdrop onClose={handleCloseModal}>
      <ModalContainer className="settings-modal">
        <ModalHeader title={t("settings.title")} onClose={handleCloseModal} />
        <div className="settings-content">
          <div className="settings-sidebar">
            {sidebar}
          </div>
          <div className="settings-main">
            {paneContent}
          </div>
        </div>
      </ModalContainer>
    </ModalBackdrop>
  );
}
