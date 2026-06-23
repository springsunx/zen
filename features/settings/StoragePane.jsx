import { h, useState, useEffect } from "../../assets/preact.esm.js"
import ApiClient from '../../commons/http/ApiClient.js';
import { showToast } from '../../commons/components/Toast.jsx';
import Button from '../../commons/components/Button.jsx';
import { t } from "../../commons/i18n/index.js";
import "./StoragePane.css";

export default function StoragePane() {
  const [provider, setProvider] = useState("local");
  const [endpoint, setEndpoint] = useState("");
  const [bucket, setBucket] = useState("");
  const [accessKey, setAccessKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [region, setRegion] = useState("");
  const [publicUrl, setPublicUrl] = useState("");
  const [useSSL, setUseSSL] = useState(true);
  const [attachmentsBucket, setAttachmentsBucket] = useState("");
  const [attachmentsPublicUrl, setAttachmentsPublicUrl] = useState("");
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  function loadConfig() {
    ApiClient.getStorageConfig()
      .then(config => {
        setProvider(config.provider || "local");
        setEndpoint(config.endpoint || "");
        setBucket(config.bucket || "");
        setAccessKey(config.accessKey || "");
        setSecretKey(config.secretKey || "");
        setRegion(config.region || "");
        setPublicUrl(config.publicUrl || "");
        setUseSSL(config.useSSL !== false);
        setAttachmentsBucket(config.attachmentsBucket || "");
        setAttachmentsPublicUrl(config.attachmentsPublicUrl || "");
      })
      .catch(err => { console.error('Failed to load storage config:', err); });
  }

  function handleSave() {
    setIsSaving(true);
    const payload = { provider, endpoint, bucket, accessKey, secretKey, region, publicUrl, useSSL, attachmentsBucket, attachmentsPublicUrl };
    ApiClient.updateStorageConfig(payload)
      .then(() => { showToast(t('storage.toast.saved')); })
      .catch(() => { showToast(t('storage.toast.saveFailed')); })
      .finally(() => { setIsSaving(false); });
  }

  function handleTest() {
    setIsTesting(true);
    const payload = { provider, endpoint, bucket, accessKey, secretKey, region, publicUrl, useSSL };
    ApiClient.testStorageConnection(payload)
      .then(() => { showToast(t('storage.toast.testOk')); })
      .catch(() => { showToast(t('storage.toast.testFailed')); })
      .finally(() => { setIsTesting(false); });
  }

  let s3Form = null;
  if (provider === "s3") {
    s3Form = (
      <div className="storage-s3-form">
        <div className="storage-field">
          <label>{t('storage.endpoint')}</label>
          <input type="text" value={endpoint} onInput={e => setEndpoint(e.target.value)} placeholder="s3.amazonaws.com" />
        </div>
        <div className="storage-field">
          <label>{t('storage.bucket')}</label>
          <input type="text" value={bucket} onInput={e => setBucket(e.target.value)} placeholder="my-bucket" />
        </div>
        <div className="storage-field">
          <label>{t('storage.publicUrl')}</label>
          <input type="text" value={publicUrl} onInput={e => setPublicUrl(e.target.value)} placeholder={t('storage.publicUrl.placeholder')} />
        </div>
        <div className="storage-field">
          <label>{t('storage.attachmentsBucket')}</label>
          <input type="text" value={attachmentsBucket} onInput={e => setAttachmentsBucket(e.target.value)} placeholder={t('storage.attachmentsBucket.placeholder')} />
        </div>
        <div className="storage-field">
          <label>{t('storage.attachmentsPublicUrl')}</label>
          <input type="text" value={attachmentsPublicUrl} onInput={e => setAttachmentsPublicUrl(e.target.value)} placeholder={t('storage.attachmentsPublicUrl.placeholder')} />
        </div>
        <div className="storage-field">
          <label>{t('storage.accessKey')}</label>
          <input type="text" value={accessKey} onInput={e => setAccessKey(e.target.value)} placeholder="AKIAIOSFODNN7EXAMPLE" autoComplete="off" data-bwignore />
        </div>
        <div className="storage-field">
          <label>{t('storage.secretKey')}</label>
          <input type="password" value={secretKey} onInput={e => setSecretKey(e.target.value)} placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY" autoComplete="off" data-bwignore />
        </div>
        <div className="storage-field">
          <label>{t('storage.region')}</label>
          <input type="text" value={region} onInput={e => setRegion(e.target.value)} placeholder="us-east-1" />
        </div>
        <div className="storage-field storage-checkbox-row">
          <label className="storage-checkbox">
            <input type="checkbox" checked={useSSL} onChange={e => setUseSSL(e.target.checked)} />
            {t('storage.useSSL')}
          </label>
        </div>
        <div className="storage-actions">
          <Button onClick={handleTest} isDisabled={isTesting || !endpoint || !bucket || !accessKey}>
            {isTesting ? t('storage.testing') : t('storage.testConnection')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="storage-pane">
      <p className="storage-desc">{t('storage.desc')}</p>

      <div className="storage-field">
        <label>{t('storage.provider')}</label>
        <div className="storage-provider-options">
          <label className={`storage-provider-option ${provider === "local" ? "is-active" : ""}`}>
            <input type="radio" name="provider" value="local" checked={provider === "local"} onChange={() => setProvider("local")} />
            {t('storage.provider.local')}
          </label>
          <label className={`storage-provider-option ${provider === "s3" ? "is-active" : ""}`}>
            <input type="radio" name="provider" value="s3" checked={provider === "s3"} onChange={() => setProvider("s3")} />
            {t('storage.provider.s3')}
          </label>
        </div>
      </div>

      {s3Form}

      <div className="storage-actions">
        <Button variant="primary" onClick={handleSave} isDisabled={isSaving}>
          {isSaving ? t('common.saving') : t('common.save')}
        </Button>
      </div>
    </div>
  );
}
