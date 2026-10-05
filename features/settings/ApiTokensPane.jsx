import { h, useState, useEffect, useRef } from "../../assets/preact.esm.js";
import Input from "../../commons/components/Input.jsx";
import Button from "../../commons/components/Button.jsx";
import SegmentedControl from "../../commons/components/SegmentedControl.jsx";
import { ArrowDownIcon, CloseIcon } from "../../commons/components/Icon.jsx";
import ApiClient from "../../commons/http/ApiClient.js";
import formatDate from "../../commons/utils/formatDate.js";
import { t } from "../../commons/i18n/index.js";

const ALL_TAGS = 0;

const ACCESS_OPTIONS = [
  { value: "read", labelKey: "settings.apiTokens.read" },
  { value: "write", labelKey: "settings.apiTokens.write" },
];

export default function ApiTokensPane() {
  const [tokens, setTokens] = useState([]);
  const [tags, setTags] = useState([]);
  const [isTokensLoading, setIsTokensLoading] = useState(true);
  const [newTokenName, setNewTokenName] = useState("");
  const [scopes, setScopes] = useState([newScope()]);
  const [newlyCreatedToken, setNewlyCreatedToken] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    loadTokens();
    loadTags();
  }, []);

  function loadTokens() {
    ApiClient.getTokens()
      .then(response => {
        setTokens(response);
      })
      .catch(() => { })
      .finally(() => {
        setIsTokensLoading(false);
      });
  }

  function loadTags() {
    ApiClient.getTags()
      .then(response => {
        setTags(response);
      })
      .catch(() => { });
  }

  function handleNameChange(e) {
    setNewTokenName(e.target.value);
    setError("");
  }

  function handleScopeTagChange(index, tagId) {
    setScopes(scopes.map((scope, i) => i === index ? { ...scope, tagId } : scope));
  }

  function handleScopeAccessChange(index, value) {
    const canWrite = value === "write";
    setScopes(scopes.map((scope, i) => i === index ? { ...scope, canWrite } : scope));
  }

  function handleAddScopeClick() {
    setScopes([...scopes, newScope()]);
  }

  function handleRemoveScopeClick(index) {
    setScopes(scopes.filter((_, i) => i !== index));
  }

  function handleCreateTokenClick() {
    if (!newTokenName.trim()) {
      setError(t('settings.apiTokens.name.required'));
      return;
    }

    setIsCreating(true);
    setError("");

    ApiClient.createToken({ name: newTokenName.trim(), scopes: scopes })
      .then(response => {
        setNewlyCreatedToken(response.token);
        setNewTokenName("");
        setScopes([newScope()]);
        setTokens(prevTokens => [response.tokenInfo, ...prevTokens]);
      })
      .catch(() => { })
      .finally(() => {
        setIsCreating(false);
      });
  }

  function handleRevokeClick(tokenId) {
    ApiClient.deleteToken(tokenId)
      .then(() => {
        setTokens(prevTokens => prevTokens.filter(token => token.tokenId !== tokenId));
      })
      .catch(() => { });
  }

  function tagNameFor(tagId) {
    if (tagId === ALL_TAGS) {
      return t('settings.apiTokens.allTags');
    }

    const tag = tags.find(tag => tag.tagId === tagId);
    if (tag) {
      return tag.name;
    }

    return t('settings.apiTokens.tagFallback', { id: tagId });
  }

  function grantsSummary(tokenScopes) {
    if (!tokenScopes || tokenScopes.length === 0) {
      return t('settings.apiTokens.noAccess');
    }

    return tokenScopes.map(scope => {
      const access = scope.canWrite ? t('settings.apiTokens.grant.write') : t('settings.apiTokens.grant.read');
      return `${tagNameFor(scope.tagId)}: ${access}`;
    }).join(" · ");
  }

  const hasDuplicateTags = new Set(scopes.map(scope => scope.tagId)).size !== scopes.length;
  const isFormValid = newTokenName.trim() !== "" && scopes.length > 0 && !hasDuplicateTags;

  // SegmentedControl renders option.label, so resolve the locale keys into labels here
  const accessOptions = ACCESS_OPTIONS.map(option => ({ value: option.value, label: t(option.labelKey) }));

  const tagOptions = [
    { value: ALL_TAGS, label: t('settings.apiTokens.allTags') },
    ...tags.map(tag => ({ value: tag.tagId, label: tag.name }))
  ];

  const scopeRows = scopes.map((scope, index) => {
    return (
      <div key={index} className="api-token-scope-row">
        <ScopeTagDropdown
          options={tagOptions}
          value={scope.tagId}
          onChange={tagId => handleScopeTagChange(index, tagId)}
        />
        <SegmentedControl
          options={accessOptions}
          value={scope.canWrite ? "write" : "read"}
          isDisabled={isCreating}
          onChange={value => handleScopeAccessChange(index, value)}
        />
        <Button variant="ghost" onClick={() => handleRemoveScopeClick(index)} title={t('settings.apiTokens.remove')}>
          <CloseIcon />
        </Button>
      </div>
    );
  });

  const tokenItems = tokens.map(token => (
    <div key={token.tokenId} className="api-token-item">
      <div className="api-token-info">
        <div className="api-token-name">{token.name}</div>
        <div className="api-token-grants">{grantsSummary(token.scopes)}</div>
        <div className="api-token-date" title={token.createdAt}>
          {formatDate(new Date(token.createdAt))}
        </div>
      </div>
      <Button variant="danger" onClick={() => handleRevokeClick(token.tokenId)}>
        {t('settings.apiTokens.revoke')}
      </Button>
    </div>
  ));

  const buttonText = isCreating ? t('settings.apiTokens.generating') : t('settings.apiTokens.generate');

  let tokenDisplay = null;
  if (newlyCreatedToken) {
    tokenDisplay = (
      <div className="api-token-display">
        <div className="api-token-display-header">
          <strong>{t('settings.apiTokens.created')}</strong>
        </div>
        <div className="api-token-value">
          <code>{newlyCreatedToken}</code>
        </div>
      </div>
    );
  }

  let scopeWarning = null;
  if (hasDuplicateTags) {
    scopeWarning = <p className="api-token-scope-warning">{t('settings.apiTokens.duplicate')}</p>;
  }

  let tokensContent = null;
  if (tokens.length === 0 && isTokensLoading === false) {
    tokensContent = <p className="api-no-tokens">{t('settings.apiTokens.empty')}</p>;
  } else {
    tokensContent = (
      <div className="api-tokens-list">
        {tokenItems}
      </div>
    );
  }

  return (
    <div className="settings-tab-content">
      <h3>{t('settings.apiTokens.title')}</h3>
      <p>{t('settings.apiTokens.desc')}</p>

      <div className="api-token-creator">
        <Input
          id="api-token-name"
          label={t('settings.apiTokens.name')}
          type="text"
          placeholder={t('settings.apiTokens.name.placeholder')}
          value={newTokenName}
          error={error}
          isDisabled={isCreating}
          onChange={handleNameChange}
        />

        <div className="api-token-scopes">
          <label className="api-token-field-label">{t('settings.apiTokens.access')}</label>
          {scopeRows}
          {scopeWarning}
          <Button variant="secondary" onClick={handleAddScopeClick} isDisabled={isCreating}>
            {t('settings.apiTokens.addTag')}
          </Button>
        </div>

        <Button variant="primary" onClick={handleCreateTokenClick} isDisabled={isCreating || !isFormValid}>
          {buttonText}
        </Button>
      </div>

      {tokenDisplay}

      <hr/>

      <div className="api-tokens-section">
        <h4>{t('settings.apiTokens.active')}</h4>
        {tokensContent}
      </div>
    </div>
  );
}

function newScope() {
  return { tagId: ALL_TAGS, canRead: true, canWrite: false };
}

function ScopeTagDropdown({ options, value, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("click", handleClickOutside);
    return () => {
      document.removeEventListener("click", handleClickOutside);
    };
  }, []);

  function handleOptionClick(optionValue) {
    setIsOpen(false);
    onChange(optionValue);
  }

  const selectedOption = options.find(option => option.value === value);

  let selectedLabel = "";
  if (selectedOption) {
    selectedLabel = selectedOption.label;
  }

  const items = options.map(option => {
    const className = option.value === value ? "dropdown-option is-selected" : "dropdown-option";
    return (
      <li key={option.value} className={className} onClick={() => handleOptionClick(option.value)}>
        {option.label}
      </li>
    );
  });

  return (
    <div ref={containerRef} className={`api-token-scope-tag dropdown-container ${isOpen ? "is-open" : ""}`}>
      <Button className="dropdown-button" onClick={() => setIsOpen(prevIsOpen => !prevIsOpen)}>
        {selectedLabel}
        <ArrowDownIcon />
      </Button>
      <ul className="dropdown-menu">
        {items}
      </ul>
    </div>
  );
}
