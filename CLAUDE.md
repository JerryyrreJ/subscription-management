# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
# Start development server (Vite)
npm run dev

# Build for production
npm run build

# Lint TypeScript/React code
npm run lint

# Preview production build
npm run preview
```

## Project Architecture

This is a subscription management web application built with React 18, TypeScript, and Tailwind CSS. The app helps users track recurring subscriptions with a clean, modern interface.

### Key Technologies
- **Build Tool**: Vite
- **Frontend**: React 18 with TypeScript
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **Data Storage**: LocalStorage with backward compatibility
- **Currency Support**: Multi-currency with real-time exchange rates

### Project Structure
```
src/
├── App.tsx              # Main app component with state management
├── types.ts             # TypeScript type definitions
├── components/          # React components
│   ├── Dashboard.tsx    # Main dashboard with cost calculations
│   ├── SubscriptionCard.tsx
│   ├── AddSubscriptionModal.tsx
│   ├── EditSubscriptionModal.tsx
│   ├── SubscriptionDetailsModal.tsx
│   └── Footer.tsx
└── utils/
    ├── storage.ts       # LocalStorage utilities with backward compatibility
    ├── dates.ts         # Date calculation utilities
    └── currency.ts      # Multi-currency support and exchange rates
```

### Core Data Model
The `Subscription` interface in `types.ts` defines the main data structure:
- Supports monthly, yearly, and custom billing periods
- Multi-currency support (CNY, USD, EUR, JPY, GBP, AUD, CAD, CHF, HKD, SGD)
- Automatic renewal date calculations
- Cost calculations can be viewed in monthly or yearly totals with currency conversion

### State Management
- All state is managed in the main `App.tsx` component
- Data persistence handled through LocalStorage utilities in `utils/storage.ts`
- No external state management library (Redux, Zustand, etc.)

### Styling Approach
- Tailwind CSS with utility classes
- Custom gradient backgrounds and animations
- Responsive design with mobile-first approach
- Clean, modern UI with subtle shadow and hover effects

### Data Flow
1. App loads subscriptions from LocalStorage on mount
2. User interactions (add/edit/delete) update local state
3. Changes are automatically persisted to LocalStorage
4. Dashboard recalculates totals based on view mode (monthly/yearly)

## Multi-Currency Feature

### Exchange Rate Integration
- Uses exchangerate-api.com for real-time exchange rates
- Fallback to offline rates if API unavailable
- Rates cached for 1 hour to minimize API calls
- Dashboard allows selection of base currency for total calculations

### Currency Support
- 10 major currencies supported: CNY, USD, EUR, JPY, GBP, AUD, CAD, CHF, HKD, SGD
- Each subscription stores its original currency
- Dashboard converts all amounts to selected base currency
- Proper currency formatting with symbols

### Backward Compatibility
- Existing data automatically gets CNY as default currency
- Storage utilities handle migration transparently

## Development Notes

- Multi-currency support with external exchange rate API
- Subscription data stored in browser's LocalStorage with backward compatibility
- Vite dev server runs on port 5173 with host exposure enabled
- ESLint configured with React hooks and TypeScript rules
- No testing framework currently configured

## Version History

### v1.2.0
- Added multi-currency support with real-time exchange rates
- Fixed Monthly/Yearly calculation bugs
- Improved UI layout with currency selector in front of amount
- Enhanced user experience with consistent form designs