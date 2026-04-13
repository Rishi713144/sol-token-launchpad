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

function App() {
  return (
    <div className="app-wrapper">
      <ConnectionProvider endpoint={"https://api.devnet.solana.com"}>
        <WalletProvider wallets={[]} autoConnect>
            <WalletModalProvider>
              {/* Modern Glassmorphic Navbar */}
              <nav className="navbar" style={{ justifyContent: 'center', flexDirection: 'column', gap: '20px', padding: '30px', width: '100%', boxSizing: 'border-box' }}>
                <div className="logo">
                  <div className="logo-icon"></div>
                  <h2 className="logo-text">NovaaMint</h2>
                </div>
                <div className="wallet-buttons" style={{ justifyContent: 'center', display: 'flex' }}>
                  <WalletMultiButton />
                  <WalletDisconnectButton />
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
