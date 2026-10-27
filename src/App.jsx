import './App.css';
import { TokenLaunchpad } from './components/TokenLaunchpad';

// Wallet adapter imports
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import {
  WalletModalProvider,
  WalletMultiButton,
  WalletDisconnectButton,
} from '@solana/wallet-adapter-react-ui';
import '@solana/wallet-adapter-react-ui/styles.css';

function App() {
  return (
    <div className="app-container">
      <ConnectionProvider endpoint="https://api.devnet.solana.com">
        <WalletProvider wallets={[]} autoConnect>
          <WalletModalProvider>
            {/* Header */}
            <header className="navbar">
              <div className="navbar-logo">
                <div className="logo-badge" />
                <span className="logo-title">NovaaMint</span>
                <span className="network-tag">Devnet</span>
              </div>
              <div className="wallet-actions">
                <WalletMultiButton />
                <WalletDisconnectButton />
              </div>
            </header>

            {/* Main Content */}
            <main className="main-layout">
              <TokenLaunchpad />
            </main>
          </WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    </div>
  );
}

export default App;
