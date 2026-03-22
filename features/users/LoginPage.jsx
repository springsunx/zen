import { h, useState, useEffect, Fragment } from "../../assets/preact.esm.js"
import Input from "../../commons/components/Input.jsx";
import Button from "../../commons/components/Button.jsx";
import { ArrowRightIcon } from "../../commons/components/Icon.jsx";
import navigateTo from "../../commons/utils/navigateTo.js";
import ApiClient from "../../commons/http/ApiClient.js";
import "./LoginPage.css";
import { t, setLang, getPrefLang } from "../../commons/i18n/index.js";


function LanguageSelect() {
  const [lang, setState] = useState(getPrefLang());
  function change(e) {
    const v = e.target.value;
    setLang(v);
    setState(v);
  }
  return (
    <div className="login-lang" style="margin-top:12px; display:flex; gap:8px; align-items:center; justify-content:center;">
      <label style="color:var(--text-secondary); font: var(--sm);">{t('settings.language')}</label>
      <select value={lang} onChange={change}>
        <option value="auto">{t('settings.language.auto')}</option>
        <option value="zh-CN">{t('settings.language.zh')}</option>
        <option value="en">{t('settings.language.en')}</option>
      </select>
    </div>
  );
}

export default function LoginPage({ isOnboarding = false }) {
  const [langVersion, setLangVersion] = useState(0);
  useEffect(() => {
    const onChange = () => setLangVersion(v => v + 1);
    window.addEventListener("i18n:change", onChange);
    return () => window.removeEventListener("i18n:change", onChange);
  }, []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");

  function handleEmailChange(e) {
    setEmail(e.target.value);
  }

  function handlePasswordChange(e) {
    setPassword(e.target.value);
  }

  function handleLoginClick() {
    event.preventDefault();
    
    setEmailError("");
    setPasswordError("");

    const payload = {
      email: email,
      password: password
    };

    const promise = isOnboarding ? ApiClient.createUser(payload) : ApiClient.login(payload);

    promise
      .then(() => {
        navigateTo("/notes/");
        window.location.reload();
      })
      .catch(e => {
        switch (e.code) {
          case "INVALID_EMAIL":
            setEmailError(t("login.error.invalidEmail"));
            break;
          case "INVALID_PASSWORD":
            setPasswordError(t("login.error.invalidPassword"));
            break;
          case "INCORRECT_EMAIL":
            setEmailError(t("login.error.incorrectEmail"));
            break;
          case "INCORRECT_PASSWORD":
            setPasswordError(t("login.error.incorrectPassword"));
            break;
        }
      });
  }

  let header = null;
  let buttonText = t("login.button.login");

  if (isOnboarding) {
    header = (
      <div>
        <div className="login-title">Let's get started!</div>
        <div className="login-subtitle">{t("login.subtitle")}</div>
      </div>
    );
    buttonText = t("login.button.continue");
  } else {
    header = (
      <div>
        <div className="login-title">{t("login.title")}</div>
      </div>
    );
  }

  return (
    <>
      <div className="login-topbar"><LanguageSelect /></div>
      <form className="login-container" onSubmit={handleLoginClick}>
        {header}
        <Input id="email" label={t("login.email")} type="email" placeholder={t("login.ph.email")} value={email} hint="" error={emailError} isDisabled={false} onChange={handleEmailChange} />
        <Input id="password" label={t("login.password")} type="password" placeholder={t("login.ph.password")} value={password} hint="" error={passwordError} isDisabled={false} onChange={handlePasswordChange} />
        <Button variant="primary" type="submit" onClick={handleLoginClick}>{buttonText}<ArrowRightIcon /></Button>
      </form>
      <div className="toast-root"></div>
    </>
  );
}