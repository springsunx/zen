import { h, useState } from "../../assets/preact.esm.js";
import Button from "../../commons/components/Button.jsx";
import Input from "../../commons/components/Input.jsx";
import ApiClient from "../../commons/http/ApiClient.js";
import { showToast } from "../../commons/components/Toast.jsx";
import { t } from "../../commons/i18n/index.js";

export default function SecurityPane() {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [oldPasswordError, setOldPasswordError] = useState("");
  const [newPasswordError, setNewPasswordError] = useState("");
  const [confirmPasswordError, setConfirmPasswordError] = useState("");
  const [isPasswordLoading, setIsPasswordLoading] = useState(false);
  const [isLogoutLoading, setIsLogoutLoading] = useState(false);

  function handlePasswordSubmit(e) {
    e.preventDefault();

    setOldPasswordError("");
    setNewPasswordError("");
    setConfirmPasswordError("");

    if (!oldPassword.trim()) {
      setOldPasswordError(t('settings.security.err.currentRequired'));
      return;
    }

    if (!newPassword.trim()) {
      setNewPasswordError(t('settings.security.err.newRequired'));
      return;
    }

    if (newPassword !== confirmPassword) {
      setConfirmPasswordError(t('settings.security.err.mismatch'));
      return;
    }

    if (oldPassword === newPassword) {
      setNewPasswordError(t('settings.security.err.newDifferent'));
      return;
    }

    setIsPasswordLoading(true);

    ApiClient.updatePassword({
      oldPassword: oldPassword,
      newPassword: newPassword
    })
      .then(() => {
        showToast(t('settings.security.toast.updated'));
        setOldPassword("");
        setNewPassword("");
        setConfirmPassword("");
      })
      .catch((error) => {
        if (error.code === "INCORRECT_OLD_PASSWORD") {
          setOldPasswordError(t('settings.security.err.currentRequired'));
        } else if (error.code === "INVALID_NEW_PASSWORD") {
          setNewPasswordError(t('settings.security.err.newDifferent'));
        } else {
          showToast(t('settings.security.toast.updateFailed'));
        }
      })
      .finally(() => {
        setIsPasswordLoading(false);
      });
  }

  function handleLogout() {
    setIsLogoutLoading(true);

    ApiClient.logout()
      .then(() => {
        showToast(t('settings.security.toast.logoutOk'));
        window.location.reload();
      })
      .catch(() => {
        showToast(t('settings.security.toast.logoutFailed'));
      })
      .finally(() => {
        setIsLogoutLoading(false);
      });
  }

  return (
    <div className="settings-tab-content">
      <h3>{t('settings.security.title')}</h3>
      <p>{t('settings.security.desc')}</p>

      <form className="settings-form" onSubmit={handlePasswordSubmit}>
        <Input
          id="current-password"
          label={t('settings.security.current')}
          type="password"
          placeholder={t('settings.security.ph.current')}
          value={oldPassword}
          error={oldPasswordError}
          isDisabled={isPasswordLoading}
          onChange={(e) => setOldPassword(e.target.value)}
        />

        <Input
          id="new-password"
          label={t('settings.security.new')}
          type="password"
          placeholder={t('settings.security.ph.new')}
          value={newPassword}
          error={newPasswordError}
          isDisabled={isPasswordLoading}
          onChange={(e) => setNewPassword(e.target.value)}
        />

        <Input
          id="confirm-password"
          label={t('settings.security.confirm')}
          type="password"
          placeholder={t('settings.security.ph.confirm')}
          value={confirmPassword}
          error={confirmPasswordError}
          isDisabled={isPasswordLoading}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />

        <Button type="submit" variant={`primary ${isPasswordLoading ? 'disabled' : ''}`} isDisabled={isPasswordLoading}>
          {isPasswordLoading ? t('settings.security.btn.updating') : t('settings.security.btn.update')}
        </Button>
      </form>

      <hr/>

      <h3>{t('settings.security.session.title')}</h3>
      <p>{t('settings.security.session.desc')}</p>

      <Button onClick={handleLogout} isDisabled={isLogoutLoading}>
        {isLogoutLoading ? t('settings.security.btn.loggingOut') : t('settings.security.btn.logout')}
      </Button>
    </div>
  );
}