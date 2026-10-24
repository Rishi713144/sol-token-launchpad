import './App.css'
import { TokenLaunchpad } from './components/TokenLaunchpad'

// wallet adapter imports
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import {
    WalletModalProvider,
    WalletDisconnectButton,
    WalletMultiButton
} from '@solana/wallet-adapter-react-ui';
import '@solana/wallet-adapter-react-ui/styles.css';
import { useEffect, useState } from 'react';

function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem('novaa-theme') || 'dark');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('novaa-theme', theme);
  }, [theme]);

  return (
    <div className="app-wrapper">
      <ConnectionProvider endpoint={"https://api.devnet.solana.com"}>
        <WalletProvider wallets={[]} autoConnect>
            <WalletModalProvider>
              {/* Modern Glassmorphic Navbar */}
              <nav className="navbar">
                <div className="logo">
                  <div className="logo-icon"></div>
                  <h2 className="logo-text">NovaaMint</h2>
                </div>
                <div className="wallet-buttons">
                  <WalletMultiButton />
                  <WalletDisconnectButton />
                  <button
                    className="theme-toggle"
                    type="button"
                    aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
                    onClick={() => setTheme((currentTheme) => currentTheme === 'dark' ? 'light' : 'dark')}
                  >
                    {theme === 'dark' ? 'Light mode' : 'Dark mode'}
                  </button>
                </div>
              </nav>

              {/* Main Content */}
              <TokenLaunchpad />
            </WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    </div>
  )
}

export default App
