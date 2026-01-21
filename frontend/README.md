# Frontend Application

Next.js frontend for the Approve Demo ERC20 token contract.

## Features

### User Interface
- 🔗 Wallet connection (MetaMask, WalletConnect, etc.)
- ✅ One-click unlimited approval
- 💰 Real-time balance and allowance display
- 🔔 Toast notifications for transactions
- 📱 Responsive design

### Admin Interface
- 🛡️ Owner-only access control
- 👥 Pull tokens from approved users
- 📊 User allowance verification
- ⚠️ Input validation and warnings

## Installation

```bash
npm install
```

## Configuration

1. **Update Contract Address**
   
   Edit `lib/contract.ts`:
   ```typescript
   export const CONTRACT_ADDRESS: Address = "0xYourContractAddress";
   ```

2. **Configure WalletConnect (Optional)**
   
   Create `.env.local`:
   ```env
   NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id_here
   ```
   
   Get a project ID at: https://cloud.walletconnect.com/

## Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Build

```bash
npm run build
npm start
```

## Project Structure

```
frontend/
├── app/
│   ├── layout.tsx           # Root layout with providers
│   ├── page.tsx             # Main user page
│   ├── admin/
│   │   └── page.tsx         # Admin page
│   ├── providers.tsx        # Wagmi & ConnectKit setup
│   └── globals.css          # Global styles
│
├── components/
│   ├── ApproveUnlimited.tsx # User approval component
│   ├── AdminPullPanel.tsx   # Admin panel component
│   └── ui/                  # Shadcn UI components
│       ├── button.tsx
│       ├── card.tsx
│       ├── input.tsx
│       ├── toast.tsx
│       ├── toaster.tsx
│       └── use-toast.ts
│
└── lib/
    ├── contract.ts          # Contract ABI & address
    └── utils.ts             # Utility functions
```

## Pages

### `/` - User Page
- Connect wallet
- View token balance
- Grant unlimited approval
- Check approval status

### `/admin` - Admin Page
- Owner verification
- Enter user address
- Specify token amount
- Pull approved tokens

## Components

### `<ApproveUnlimited />`
User interface for granting unlimited approval.

**Features:**
- Wallet connection check
- Balance display
- Allowance status
- Approval button with loading states
- Success/error notifications

### `<AdminPullPanel />`
Admin interface for pulling tokens from users.

**Features:**
- Owner verification
- User address input
- Amount input with validation
- Allowance checking
- Warning for users without approval
- Transaction status

## Hooks Usage

### Wagmi Hooks

```typescript
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';

// Get connected wallet
const { address, isConnected } = useAccount();

// Read from contract
const { data } = useReadContract({
  address: CONTRACT_ADDRESS,
  abi: CONTRACT_ABI,
  functionName: 'balanceOf',
  args: [address],
});

// Write to contract
const { writeContract } = useWriteContract();
writeContract({
  address: CONTRACT_ADDRESS,
  abi: CONTRACT_ABI,
  functionName: 'approveUnlimited',
});
```

## Styling

Built with TailwindCSS and Shadcn UI:
- Modern, minimal design
- Dark mode support
- Responsive layouts
- Consistent component styling

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | Optional | WalletConnect Cloud project ID |

## Deployment

### Vercel (Recommended)

```bash
vercel deploy
```

### Other Platforms

Build the application:
```bash
npm run build
```

Then deploy the `.next` folder according to your hosting provider's instructions.

## Browser Support

- Chrome (recommended)
- Firefox
- Safari
- Edge
- Mobile browsers with Web3 wallet support

## Troubleshooting

### Wallet not connecting
- Check browser extension is installed
- Try refreshing the page
- Clear browser cache

### Transaction failing
- Ensure sufficient ETH for gas
- Check token balance
- Verify approval status
- Check contract address is correct

### Contract not found
- Verify `CONTRACT_ADDRESS` in `lib/contract.ts`
- Ensure you're on the correct network
- Check contract is deployed

## Dependencies

- `next`: ^14.1.0
- `react`: ^18
- `wagmi`: ^2.5.0
- `viem`: ^2.7.0
- `connectkit`: ^1.7.0
- `@tanstack/react-query`: ^5.17.0
- `tailwindcss`: ^3.3.0
- `lucide-react`: ^0.323.0

## License

MIT
