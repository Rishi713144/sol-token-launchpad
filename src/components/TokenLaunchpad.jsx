import { useState } from "react";
import { Keypair, SystemProgram, Transaction } from "@solana/web3.js";
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { MINT_SIZE, TOKEN_2022_PROGRAM_ID, createMintToInstruction, createAssociatedTokenAccountInstruction, getMintLen, createInitializeMetadataPointerInstruction, createInitializeMintInstruction, TYPE_SIZE, LENGTH_SIZE, ExtensionType, mintTo, getOrCreateAssociatedTokenAccount, getAssociatedTokenAddressSync } from "@solana/spl-token"
import { createInitializeInstruction, pack } from '@solana/spl-token-metadata';

export function TokenLaunchpad() {
    const { connection } = useConnection();
    const wallet = useWallet();

    const [name, setName] = useState('KonarCoin');
    const [symbol, setSymbol] = useState('KNR');
    const [imageUrl, setImageUrl] = useState('https://gateway.pinata.cloud/ipfs/bafkreidyytshhn3dltu6fgynrvearcajpmhfevh2ujapx7fjcp4mp5cgj4');
    const [supply, setSupply] = useState('1000000000');

    async function createToken() {
        const mintKeypair = Keypair.generate();
        const metadata = {
            mint: mintKeypair.publicKey,
            name: name,
            symbol: symbol,
            uri: imageUrl,
            additionalMetadata: [],
        };

        const mintLen = getMintLen([ExtensionType.MetadataPointer]);
        const metadataLen = TYPE_SIZE + LENGTH_SIZE + pack(metadata).length;

        const lamports = await connection.getMinimumBalanceForRentExemption(mintLen + metadataLen);

        const transaction = new Transaction().add(
            SystemProgram.createAccount({
                fromPubkey: wallet.publicKey,
                newAccountPubkey: mintKeypair.publicKey,
                space: mintLen,
                lamports,
                programId: TOKEN_2022_PROGRAM_ID,
            }),
            createInitializeMetadataPointerInstruction(mintKeypair.publicKey, wallet.publicKey, mintKeypair.publicKey, TOKEN_2022_PROGRAM_ID),
            createInitializeMintInstruction(mintKeypair.publicKey, 9, wallet.publicKey, null, TOKEN_2022_PROGRAM_ID),
            createInitializeInstruction({
                programId: TOKEN_2022_PROGRAM_ID,
                mint: mintKeypair.publicKey,
                metadata: mintKeypair.publicKey,
                name: metadata.name,
                symbol: metadata.symbol,
                uri: metadata.uri,
                mintAuthority: wallet.publicKey,
                updateAuthority: wallet.publicKey,
            }),
        );
            
        transaction.feePayer = wallet.publicKey;
        transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
        transaction.partialSign(mintKeypair);

        await wallet.sendTransaction(transaction, connection);

        console.log(`Token mint created at ${mintKeypair.publicKey.toBase58()}`);
        const associatedToken = getAssociatedTokenAddressSync(
            mintKeypair.publicKey,
            wallet.publicKey,
            false,
            TOKEN_2022_PROGRAM_ID,
        );

        console.log(associatedToken.toBase58());

        const transaction2 = new Transaction().add(
            createAssociatedTokenAccountInstruction(
                wallet.publicKey,
                associatedToken,
                wallet.publicKey,
                mintKeypair.publicKey,
                TOKEN_2022_PROGRAM_ID,
            ),
        );

        await wallet.sendTransaction(transaction2, connection);

        const transaction3 = new Transaction().add(
            createMintToInstruction(mintKeypair.publicKey, associatedToken, wallet.publicKey, 1000000000, [], TOKEN_2022_PROGRAM_ID)
        );

        await wallet.sendTransaction(transaction3, connection);

        console.log("Minted!")
    }

    return (
        <div className="launchpad-container">
            <div className="bg-glow-1"></div>
            <div className="bg-glow-2"></div>
            <div className="glass-card improved-token-card">
                <div className="token-avatar">
                    <img src={imageUrl} alt="Token" onError={e => e.target.style.display='none'} />
                </div>
                <h1 className="token-title">Create Token</h1>
                <p className="subtitle">Launch your Solana SPL Token in seconds</p>
                <form className="form-group" onSubmit={e => { e.preventDefault(); createToken(); }}>
                    <div className="input-row">
                        <input 
                            className='input-field' 
                            type='text' 
                            placeholder='Token Name'
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                        />
                        <input 
                            className='input-field' 
                            type='text' 
                            placeholder='Symbol (e.g. SOL)'
                            value={symbol}
                            onChange={(e) => setSymbol(e.target.value)}
                            maxLength={6}
                            required
                        />
                    </div>
                    <input 
                        className='input-field' 
                        type='url' 
                        placeholder='Metadata URL (Image/JSON)'
                        value={imageUrl}
                        onChange={(e) => setImageUrl(e.target.value)}
                        required
                    />
                    <input 
                        className='input-field' 
                        type='number' 
                        placeholder='Initial Supply'
                        value={supply}
                        onChange={(e) => setSupply(e.target.value)}
                        min={1}
                        required
                    />
                    <button type="submit" className='btn-generate'>
                        Deploy Token
                    </button>
                </form>
            </div>
        </div>
    );
}