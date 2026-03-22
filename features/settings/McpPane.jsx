import { h, useState, useEffect } from "../../assets/preact.esm.js";
import Input from "../../commons/components/Input.jsx";
import Button from "../../commons/components/Button.jsx";
import ApiClient from "../../commons/http/ApiClient.js";
import formatDate from "../../commons/utils/formatDate.js";
import { t } from "../../commons/i18n/index.js";

export default function McpPane() {
  const [tokens, setTokens] = useState([]);
  const [isTokensLoading, setIsTokensLoading] = useState(true);
  const [newTokenName, setNewTokenName] = useState("");
  const [newlyCreatedToken, setNewlyCreatedToken] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    loadTokens();
  }, []);

  async function loadTokens() {
    try {
      const response = await ApiClient.getTokens();
      setTokens(response);
    } catch (err) {
      console.error('Load token error:', err);
    } finally {
      setIsTokensLoading(false);
    }
  }

  function handleNameChange(e) {
    setNewTokenName(e.target.value);
    setError("");
  }

  async function handleCreateToken() {
    if (!newTokenName.trim()) {
      setError(t('settings.mcp.err.nameRequired'));

      return;
    }

    setIsCreating(true);
    setError("");

    try {
      const response = await ApiClient.createToken({
        name: newTokenName.trim()
      });
      
      setNewlyCreatedToken(response.token);
      setNewTokenName("");
      setTokens([response.tokenInfo, ...tokens]);
    } catch (err) {
      console.error('Create token error:', err);
    } finally {
      setIsCreating(false);
    }
  }

  async function revokeToken(tokenId, tokenName) {
    try {
      await ApiClient.deleteToken(tokenId);
      setTokens(tokens.filter(token => token.tokenId !== tokenId));
    } catch (err) {
      console.error('Revoke token error:', err);
    }
  }

  const tokenItems = tokens.map(token => (
    <div key={token.tokenId} className="mcp-token-item">
      <div className="mcp-token-info">
        <div className="mcp-token-name">{token.name}</div>
        <div className="mcp-token-date" title={token.createdAt}>{formatDate(new Date(token.createdAt))}</div>
      </div>
      <Button variant="danger" onClick={() => revokeToken(token.tokenId, token.name)}>{t('settings.mcp.btn.revoke')}</Button>
    </div>
  ));

  const buttonText = isCreating ? t('settings.mcp.btn.generating') : t('settings.mcp.btn.generate');
  
  let tokenDisplay = null;
  if (newlyCreatedToken) {
    tokenDisplay = (
      <div className="mcp-token-display">
        <div className="mcp-token-display-header">
          <strong>{t('settings.mcp.newToken.title')}</strong>
        </div>
        <div className="mcp-token-value">
          <code>{newlyCreatedToken}</code>
        </div>
      </div>
    );
  }

  let tokensContent = null;
  if (tokens.length === 0 && isTokensLoading === false) {
    tokensContent = <p className="mcp-no-tokens">{t('settings.mcp.tokens.none')}</p>;
  } else {
    tokensContent = (
      <div className="mcp-tokens-list">
        {tokenItems}
      </div>
    );
  }

  return (
    <div className="settings-tab-content">
      <h3>{t('settings.mcp.title')}</h3>
      <p>{t('settings.mcp.desc')}</p>
      
      <div className="mcp-token-creator">
        <Input
          id="mcp-token-name"
          label={t('settings.mcp.input.label')}
          type="text"
          placeholder={t('settings.mcp.input.placeholder')}
          value={newTokenName}
          error={error}
          isDisabled={isCreating}
          onChange={handleNameChange}
        />
        <Button variant="primary" onClick={handleCreateToken} isDisabled={isCreating || !newTokenName.trim()}>
          {buttonText}
        </Button>
      </div>

      {tokenDisplay}

      <hr/>

      <div className="mcp-tokens-section">
        <h4>{t('settings.mcp.tokens.title')}</h4>
        {tokensContent}
      </div>
    </div>
  );
}