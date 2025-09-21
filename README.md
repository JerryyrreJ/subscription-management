# Subscription Manager

A modern web application for tracking and managing your recurring subscriptions with **multi-currency support**. Built with React, TypeScript, and Tailwind CSS, this app helps you keep track of your subscription expenses across different currencies with real-time exchange rates.

## ✨ Latest Updates (v1.5.1)

- 📅 **Created Date Sorting** - Sort subscriptions by creation date to track when subscriptions were added to the system
- 💰 **Enhanced Price Sorting** - Improved price comparison logic using daily cost calculation for accurate cross-period subscription comparison

### Previous Updates (v1.5.0)
- 🎯 **Advanced Sorting System** - Sort subscriptions by name, amount, due date, or category for better expense tracking
- 📊 **Enhanced Dashboard** - Integrated sorting controls directly into the overview dashboard for seamless user experience
- 🎨 **Improved UI Integration** - Compact sorting controls positioned in dashboard bottom-right corner for optimal layout
- 📱 **Cross-Platform Compatibility** - Fixed dropdown text visibility issues across all browsers including Safari
- 🔐 **Remember Me Login** - Trust device functionality for persistent login across browser sessions
- 🔑 **Enhanced Authentication Security** - Industry-standard Refresh Token + Access Token flow
- ⏰ **Smart Session Management** - Automatic token refresh and 30-day remember login duration
- 🛡️ **Dynamic Storage Security** - Intelligent choice between sessionStorage and localStorage based user preference
- 🔄 **Smart Sync Deduplication** - Intelligent content-based duplicate detection prevents data duplication during sync
- 🚀 **Deployment Flexibility** - Single codebase supports both open-source and premium versions
- 🌙 **Dark Mode Support** - Toggle between light and dark themes with automatic system preference detection

## Features

### Core Features (Always Available)
- 🎯 **Advanced Sorting System** - Sort subscriptions by name, amount, due date, category, or creation date for comprehensive expense tracking
- 🌍 **Multi-Currency Support** - Track subscriptions in 10 major currencies
- 💱 **Smart Currency Conversion** - Real-time exchange rates with automatic conversion
- 📊 **Enhanced Dashboard** - Monthly/yearly cost overview with integrated sorting controls
- 💳 **Subscription Management** - Track multiple subscriptions with detailed information
- 🔄 **Automatic Calculations** - Automatic renewal date calculations
- 🌙 **Dark Mode Support** - Beautiful light and dark themes with automatic system preference detection
- 📱 **Responsive Design** - Works perfectly on all devices with optimized mobile layouts
- 🎨 **Modern UI** - Intuitive interface with smooth animations and theme transitions
- 💾 **Local Storage** - Your data is always saved locally for offline access

### Premium Features (When Cloud Sync is Configured)
- 👤 **User Authentication** - Secure login system with account management
- 🔐 **Remember Me Login** - Trust device option for persistent login across browser sessions
- ⏰ **Smart Session Management** - Secure 30-day remember login with automatic expiration
- ☁️ **Multi-Device Sync** - Seamlessly access your data across all devices
- 🔐 **Data Security** - Your information is encrypted and safely stored in the cloud with industry-standard token management
- 🔄 **Automatic Backup** - Your subscription data is automatically backed up

## Technologies Used

- React 18
- TypeScript
- Tailwind CSS
- Vite
- Lucide Icons
- Exchange Rate API integration
- Local Storage for data persistence

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm

### Installation

1. Clone the repository
```bash
git clone https://github.com/jerryyrrej/subscription-manager.git
cd subscription-manager
```
2. Install dependencies
```bash
npm install
```
3. Start the development server
```bash
npm run dev
```

The application will be available at `http://localhost:5173`


## Usage

### Adding a Subscription

1. Click the "+" card on the dashboard
2. Fill in the subscription details:
   - Name
   - Category
   - **Currency** (select from 10 supported currencies)
   - **Amount** (in the selected currency)
   - Payment Period (Monthly/Yearly/Custom)
   - Last Payment Date

### Managing Subscriptions

- Click any subscription card to view details
- Use the edit button to modify subscription details (including currency)
- Use the delete button to remove subscriptions
- **Sort subscriptions** using the integrated controls in the dashboard bottom-right corner
- **Switch base currency** in the dashboard to view total costs in your preferred currency
- View total costs in monthly or yearly format with automatic currency conversion
- **Toggle dark mode** using the theme switcher in the top-right corner for optimal viewing experience

### Supported Currencies

The app supports the following currencies with real-time exchange rates:
- 🇨🇳 CNY (Chinese Yuan)
- 🇺🇸 USD (US Dollar)
- 🇪🇺 EUR (Euro)
- 🇯🇵 JPY (Japanese Yen)
- 🇬🇧 GBP (British Pound)
- 🇦🇺 AUD (Australian Dollar)
- 🇨🇦 CAD (Canadian Dollar)
- 🇨🇭 CHF (Swiss Franc)
- 🇭🇰 HKD (Hong Kong Dollar)
- 🇸🇬 SGD (Singapore Dollar)

### Data Storage & Synchronization

#### Local Storage (Always Available)
- **Local Storage**: Subscription data is stored in your browser for offline access
- **Multi-Currency Support**: Full support for currency conversion and exchange rate integration
- **No Account Required**: Use the app immediately without any registration

#### Cloud Sync (Premium Feature)
- **Multi-Device Access**: Your data automatically syncs across all your devices
- **Remember Me Login**: Trust device functionality with secure 30-day session persistence
- **Industry-Standard Security**: Refresh Token + Access Token architecture with automatic token refresh
- **Secure Backup**: Your data is securely backed up and encrypted in the cloud
- **Account Management**: User profiles with customizable nicknames
- **Real-time Sync**: Changes are instantly synchronized across devices

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Icons by [Lucide](https://lucide.dev/)
- UI components inspired by Tailwind CSS
- Built with [Vite](https://vitejs.dev/)

## Support

For support, please open an issue in the GitHub repository.

---

Made with ❤️ by Jerry Lu
