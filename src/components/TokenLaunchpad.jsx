import { useCallback, useEffect, useState } from 'react';
import {
  AuthorityType,
  createAssociatedTokenAccountInstruction,
  createInitializeMintInstruction,
  createMintToInstruction,
  createSetAuthorityInstruction,
  createTransferInstruction,
  getAssociatedTokenAddress,
  getMint,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';

export function TokenLaunchpad() {
  const { connection } = useConnection();
  const wallet = useWallet();

  // Form State
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [supply, setSupply] = useState('');
  const [decimals, setDecimals] = useState(9);
  const [enableFreezeAuthority, setEnableFreezeAuthority] = useState(false);
  const [revokeMintAuthority, setRevokeMintAuthority] = useState(false);

  // Status State
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);

  // Token Balances & Transfer State
  const [tokens, setTokens] = useState([]);
  const [isTokensLoading, setIsTokensLoading] = useState(false);
  const [selectedToken, setSelectedToken] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [recipientAddress, setRecipientAddress] = useState('');

  // Fetch parsed user tokens (using getParsedTokenAccountsByOwner for accurate decimal formatting)
  const fetchUserTokens = useCallback(async () => {
    if (!wallet.publicKey) {
      setTokens([]);
      return;
    }

    setIsTokensLoading(true);
    try {
      const response = await connection.getParsedTokenAccountsByOwner(wallet.publicKey, {
        programId: TOKEN_PROGRAM_ID,
      });

      const nextTokens = response.value
        .map(({ pubkey, account }) => {
          const info = account.data.parsed.info;
          return {
            account: pubkey.toBase58(),
            mint: info.mint,
            amount: info.tokenAmount.uiAmountString || String(info.tokenAmount.uiAmount || 0),
            decimals: info.tokenAmount.decimals,
          };
        })
        .filter((item) => Number(item.amount) > 0);

      setTokens(nextTokens);
    } catch (fetchError) {
      setError(`Could not load token balances: ${fetchError.message}`);
    } finally {
      setIsTokensLoading(false);
    }
  }, [connection, wallet.publicKey]);

  useEffect(() => {
    fetchUserTokens();
  }, [fetchUserTokens]);

  function validateWallet() {
    if (!wallet.publicKey || !wallet.signTransaction) {
      throw new Error('Please connect your Solana wallet first.');
    }
  }

  // CREATE TOKEN (Standard SPL Token Program)
  async function createToken(event) {
    event.preventDefault();
    setIsLoading(true);
    setError('');
    setSuccess(null);

    try {
      validateWallet();

      if (!name.trim() || !symbol.trim()) {
        throw new Error('Enter a token name and symbol.');
      }

      const wholeSupply = BigInt(supply);
      if (wholeSupply <= 0n || decimals < 0 || decimals > 9) {
        throw new Error('Enter a positive supply and decimals between 0 and 9.');
      }

      const mintKeypair = Keypair.generate();
      const mintRent = await connection.getMinimumBalanceForRentExemption(MINT_SIZE);
      const associatedTokenAccount = await getAssociatedTokenAddress(
        mintKeypair.publicKey,
        wallet.publicKey,
      );
      const baseUnitSupply = wholeSupply * (10n ** BigInt(decimals));

      const transaction = new Transaction().add(
        // 1. Create Account for Mint
        SystemProgram.createAccount({
          fromPubkey: wallet.publicKey,
          newAccountPubkey: mintKeypair.publicKey,
          space: MINT_SIZE,
          lamports: mintRent,
          programId: TOKEN_PROGRAM_ID,
        }),
        // 2. Initialize Mint
        createInitializeMintInstruction(
          mintKeypair.publicKey,
          decimals,
          wallet.publicKey,
          enableFreezeAuthority ? wallet.publicKey : null,
          TOKEN_PROGRAM_ID,
        ),
        // 3. Create ATA for Creator
        createAssociatedTokenAccountInstruction(
          wallet.publicKey,
          associatedTokenAccount,
          wallet.publicKey,
          mintKeypair.publicKey,
        ),
        // 4. Mint Initial Supply
        createMintToInstruction(
          mintKeypair.publicKey,
          associatedTokenAccount,
          wallet.publicKey,
          baseUnitSupply,
          [],
          TOKEN_PROGRAM_ID,
        ),
      );

      // 5. Optional: Revoke Mint Authority to lock supply (Fixed Supply)
      if (revokeMintAuthority) {
        transaction.add(
          createSetAuthorityInstruction(
            mintKeypair.publicKey,
            wallet.publicKey,
            AuthorityType.MintTokens,
            null,
            [],
            TOKEN_PROGRAM_ID,
          ),
        );
      }

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.lastValidBlockHeight = lastValidBlockHeight;
      transaction.feePayer = wallet.publicKey;

      const signature = await wallet.sendTransaction(transaction, connection, {
        signers: [mintKeypair],
      });

      const confirmation = await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        'confirmed',
      );

      if (confirmation.value.err) {
        throw new Error('Token creation transaction failed to confirm.');
      }

      setSuccess({
        name: name.trim(),
        symbol: symbol.trim().toUpperCase(),
        address: mintKeypair.publicKey.toBase58(),
        signature,
        explorerUrl: `https://explorer.solana.com/address/${mintKeypair.publicKey.toBase58()}?cluster=devnet`,
      });

      await fetchUserTokens();
    } catch (createError) {
      setError(`Could not create token: ${createError.message}`);
    } finally {
      setIsLoading(false);
    }
  }

  // TRANSFER TOKEN
  async function transferToken(event) {
    event.preventDefault();
    setIsLoading(true);
    setError('');
    setSuccess(null);

    try {
      validateWallet();
      if (!selectedToken || !transferAmount || Number(transferAmount) <= 0) {
        throw new Error('Select a token and enter a positive transfer amount.');
      }

      const recipient = new PublicKey(recipientAddress.trim());
      const mint = new PublicKey(selectedToken);
      const mintInfo = await getMint(connection, mint);

      const [whole = '0', fraction = ''] = transferAmount.split('.');
      if (!/^\d+$/.test(whole) || !/^\d*$/.test(fraction) || fraction.length > mintInfo.decimals) {
        throw new Error(`Amount supports up to ${mintInfo.decimals} decimal places.`);
      }

      const scale = 10n ** BigInt(mintInfo.decimals);
      const amount =
        BigInt(whole) * scale +
        BigInt((fraction + '0'.repeat(mintInfo.decimals)).slice(0, mintInfo.decimals));

      const senderAta = await getAssociatedTokenAddress(mint, wallet.publicKey);
      const recipientAta = await getAssociatedTokenAddress(mint, recipient);

      const transaction = new Transaction();
      const recipientAccount = await connection.getAccountInfo(recipientAta);

      if (!recipientAccount) {
        transaction.add(
          createAssociatedTokenAccountInstruction(
            wallet.publicKey,
            recipientAta,
            recipient,
            mint,
          ),
        );
      }

      transaction.add(
        createTransferInstruction(
          senderAta,
          recipientAta,
          wallet.publicKey,
          amount,
          [],
          TOKEN_PROGRAM_ID,
        ),
      );

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.lastValidBlockHeight = lastValidBlockHeight;
      transaction.feePayer = wallet.publicKey;

      const signature = await wallet.sendTransaction(transaction, connection);
      const confirmation = await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        'confirmed',
      );

      if (confirmation.value.err) {
        throw new Error('Transfer transaction failed to confirm.');
      }

      setTransferAmount('');
      setRecipientAddress('');
      setSelectedToken('');
      await fetchUserTokens();
    } catch (transferError) {
      setError(`Could not transfer token: ${transferError.message}`);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="launchpad-container">
      <div className="launchpad-content">
        {/* Create Token Card */}
        <div className="card">
          <h1 className="card-title">Create Token</h1>
          <p className="card-subtitle">Deploy an SPL Token on Solana Devnet</p>

          <form className="form-group" onSubmit={createToken}>
            <div className="input-row">
              <div className="input-col">
                <label className="field-label">Token Name</label>
                <input
                  className="input-field"
                  type="text"
                  placeholder="e.g. Solana Diamond"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={32}
                  required
                />
              </div>
              <div className="input-col">
                <label className="field-label">Symbol</label>
                <input
                  className="input-field"
                  type="text"
                  placeholder="e.g. SLD"
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                  maxLength={8}
                  required
                />
              </div>
            </div>

            <div className="input-row">
              <div className="input-col">
                <label className="field-label">Initial Supply</label>
                <input
                  className="input-field"
                  type="number"
                  min="1"
                  placeholder="1000000"
                  value={supply}
                  onChange={(e) => setSupply(e.target.value)}
                  required
                />
              </div>
              <div className="input-col">
                <label className="field-label">Decimals</label>
                <input
                  className="input-field"
                  type="number"
                  min="0"
                  max="9"
                  placeholder="9"
                  value={decimals}
                  onChange={(e) => setDecimals(Number(e.target.value))}
                  required
                />
              </div>
            </div>

            <div className="checkbox-row">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={enableFreezeAuthority}
                  onChange={(e) => setEnableFreezeAuthority(e.target.checked)}
                />
                Enable Freeze Authority
              </label>

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={revokeMintAuthority}
                  onChange={(e) => setRevokeMintAuthority(e.target.checked)}
                />
                Revoke Mint Authority (Fixed Supply)
              </label>
            </div>

            <button
              type="submit"
              className="btn-primary"
              disabled={isLoading || !wallet.publicKey}
            >
              {isLoading ? 'Processing...' : 'Deploy Token'}
            </button>
          </form>
        </div>

        {/* Status Messages */}
        {error && <div className="alert alert-error">{error}</div>}

        {!wallet.publicKey && (
          <div className="alert alert-info">
            Connect your wallet to create and transfer tokens.
          </div>
        )}

        {success && (
          <div className="alert alert-success">
            <h3>Token Created Successfully</h3>
            <p><strong>Token:</strong> {success.name} (${success.symbol})</p>
            <p><strong>Mint:</strong> {success.address}</p>
            <p><strong>Signature:</strong> {success.signature}</p>
            <a
              href={success.explorerUrl}
              target="_blank"
              rel="noreferrer"
              className="explorer-link"
            >
              View on Solana Explorer &rarr;
            </a>
          </div>
        )}

        {/* Token Management Card */}
        {wallet.publicKey && (
          <div className="card">
            <h2 className="card-title">Your Token Balances</h2>
            {isTokensLoading ? (
              <p className="loading-text">Loading token balances...</p>
            ) : tokens.length === 0 ? (
              <p className="empty-text">No SPL tokens found in this wallet.</p>
            ) : (
              <ul className="token-list">
                {tokens.map((token) => (
                  <li key={token.account} className="token-list-item">
                    <span className="token-address">{token.mint}</span>
                    <strong className="token-amount">
                      {Number(token.amount).toLocaleString()}
                    </strong>
                  </li>
                ))}
              </ul>
            )}

            <h2 className="card-title" style={{ marginTop: '2rem' }}>
              Transfer Tokens
            </h2>
            <form className="form-group" onSubmit={transferToken}>
              <div className="input-col">
                <label className="field-label">Select Token</label>
                <select
                  className="input-field"
                  value={selectedToken}
                  onChange={(e) => setSelectedToken(e.target.value)}
                  required
                >
                  <option value="">Select a token</option>
                  {tokens.map((token) => (
                    <option key={token.account} value={token.mint}>
                      {token.mint.slice(0, 8)}... (Balance: {Number(token.amount).toLocaleString()})
                    </option>
                  ))}
                </select>
              </div>

              <div className="input-col">
                <label className="field-label">Amount</label>
                <input
                  className="input-field"
                  type="number"
                  min="0"
                  step="any"
                  placeholder="Amount"
                  value={transferAmount}
                  onChange={(e) => setTransferAmount(e.target.value)}
                  required
                />
              </div>

              <div className="input-col">
                <label className="field-label">Recipient Wallet Address</label>
                <input
                  className="input-field"
                  type="text"
                  placeholder="Solana address (base58)"
                  value={recipientAddress}
                  onChange={(e) => setRecipientAddress(e.target.value)}
                  required
                />
              </div>

              <button
                type="submit"
                className="btn-primary"
                disabled={isLoading || tokens.length === 0}
              >
                {isLoading ? 'Processing...' : 'Transfer Tokens'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
