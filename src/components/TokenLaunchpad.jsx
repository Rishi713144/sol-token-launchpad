import { useCallback, useEffect, useState } from 'react';
import {
  AccountLayout,
  createAssociatedTokenAccountInstruction,
  createInitializeMintInstruction,
  createMintToInstruction,
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
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [supply, setSupply] = useState('');
  const [decimals, setDecimals] = useState(9);
  const [enableFreezeAuthority, setEnableFreezeAuthority] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);
  const [tokens, setTokens] = useState([]);
  const [isTokensLoading, setIsTokensLoading] = useState(false);
  const [selectedToken, setSelectedToken] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [recipientAddress, setRecipientAddress] = useState('');

  const fetchUserTokens = useCallback(async () => {
    if (!wallet.publicKey) {
      setTokens([]);
      return;
    }

    setIsTokensLoading(true);
    try {
      const accounts = await connection.getTokenAccountsByOwner(wallet.publicKey, {
        programId: TOKEN_PROGRAM_ID,
      });
      const nextTokens = accounts.value.map(({ pubkey, account }) => {
        const data = AccountLayout.decode(account.data);
        return {
          account: pubkey.toBase58(),
          mint: new PublicKey(data.mint).toBase58(),
          amount: data.amount.toString(),
        };
      });
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
      throw new Error('Please connect your wallet first.');
    }
  }

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
        SystemProgram.createAccount({
          fromPubkey: wallet.publicKey,
          newAccountPubkey: mintKeypair.publicKey,
          space: MINT_SIZE,
          lamports: mintRent,
          programId: TOKEN_PROGRAM_ID,
        }),
        createInitializeMintInstruction(
          mintKeypair.publicKey,
          decimals,
          wallet.publicKey,
          enableFreezeAuthority ? wallet.publicKey : null,
          TOKEN_PROGRAM_ID,
        ),
        createAssociatedTokenAccountInstruction(
          wallet.publicKey,
          associatedTokenAccount,
          wallet.publicKey,
          mintKeypair.publicKey,
        ),
        createMintToInstruction(
          mintKeypair.publicKey,
          associatedTokenAccount,
          wallet.publicKey,
          baseUnitSupply,
          [],
          TOKEN_PROGRAM_ID,
        ),
      );

      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash();
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
        throw new Error('Token transaction failed to confirm.');
      }

      setSuccess({
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

      const recipient = new PublicKey(recipientAddress);
      const mint = new PublicKey(selectedToken);
      const mintInfo = await getMint(connection, mint);
      const [whole = '0', fraction = ''] = transferAmount.split('.');
      if (!/^\d+$/.test(whole) || !/^\d*$/.test(fraction) || fraction.length > mintInfo.decimals) {
        throw new Error(`Amount supports up to ${mintInfo.decimals} decimal places.`);
      }
      const scale = 10n ** BigInt(mintInfo.decimals);
      const amount = (BigInt(whole) * scale) +
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

      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash();
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
      <div className="bg-glow-1" />
      <div className="bg-glow-2" />
      <div className="launchpad-content">
        <div className="glass-card improved-token-card">
          <h1 className="token-title">Create Token</h1>
          <p className="subtitle">Launch your Solana SPL Token on Devnet</p>
          <form className="form-group" onSubmit={createToken}>
            <div className="input-row">
              <input className="input-field" type="text" placeholder="Token Name" value={name} onChange={(event) => setName(event.target.value)} required />
              <input className="input-field" type="text" placeholder="Symbol" value={symbol} onChange={(event) => setSymbol(event.target.value)} maxLength={6} required />
            </div>
            <input className="input-field" type="number" min="1" placeholder="Initial Supply" value={supply} onChange={(event) => setSupply(event.target.value)} required />
            <input className="input-field" type="number" min="0" max="9" placeholder="Decimals" value={decimals} onChange={(event) => setDecimals(Number(event.target.value))} required />
            <label className="checkbox-field">
              <input type="checkbox" checked={enableFreezeAuthority} onChange={(event) => setEnableFreezeAuthority(event.target.checked)} />
              Enable Freeze Authority
            </label>
            <button type="submit" className="btn-generate" disabled={isLoading || !wallet.publicKey}>
              {isLoading ? 'Processing...' : 'Deploy Token'}
            </button>
          </form>
        </div>

        <div className="toast-region" role="status" aria-live="polite">
          {error && <div className="toast error-card">{error}</div>}
          {!wallet.publicKey && <div className="toast warning-card">Connect your wallet to create and transfer tokens.</div>}
        </div>
        {success && (
          <div className="toast-region">
            <div className="toast success-card">
            <h2>Token created successfully</h2>
            <p><strong>Mint:</strong> {success.address}</p>
            <p><strong>Transaction:</strong> {success.signature}</p>
            <a href={success.explorerUrl} target="_blank" rel="noreferrer">View on Solana Explorer</a>
            </div>
          </div>
        )}

        {wallet.publicKey && (
          <div className="glass-card token-tools">
            <h2>Your Token Balances</h2>
            {isTokensLoading ? (
              <div aria-label="Loading token balances">
                <div className="skeleton" />
                <div className="skeleton" />
                <div className="skeleton" />
              </div>
            ) : tokens.length === 0 ? <p>No classic SPL tokens found.</p> : (
              <ul className="token-list">
                {tokens.map((token) => <li key={token.account}><span>{token.mint}</span><strong>{token.amount}</strong></li>)}
              </ul>
            )}
            <h2>Transfer Tokens</h2>
            <form className="form-group" onSubmit={transferToken}>
              <select className="input-field" value={selectedToken} onChange={(event) => setSelectedToken(event.target.value)} required>
                <option value="">Select a token</option>
                {tokens.map((token) => <option key={token.account} value={token.mint}>{token.mint}</option>)}
              </select>
              <input className="input-field" type="number" min="0" step="any" placeholder="Amount" value={transferAmount} onChange={(event) => setTransferAmount(event.target.value)} required />
              <input className="input-field" type="text" placeholder="Recipient wallet address" value={recipientAddress} onChange={(event) => setRecipientAddress(event.target.value)} required />
              <button type="submit" className="btn-generate" disabled={isLoading}>Transfer Tokens</button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
