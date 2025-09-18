# Subscription Manager

A modern web application for tracking and managing your recurring subscriptions with **multi-currency support**. Built with React, TypeScript, and Tailwind CSS, this app helps you keep track of your subscription expenses across different currencies with real-time exchange rates.

## ✨ Latest Updates (v1.4.1)

- 🔧 **Environment Detection** - Smart feature detection based on configuration availability
- 🚀 **Deployment Flexibility** - Single codebase supports both open-source and premium versions
- 📦 **Open Source Ready** - Works perfectly without cloud configuration for local-only usage
- 👤 **User Authentication** - Secure login system for multi-device synchronization (when configured)
- ☁️ **Multi-Device Sync** - Access your subscriptions across all your devices (premium feature)
- 🔐 **Data Security** - Your subscription data is safely synced and backed up
- 🌙 **Dark Mode Support** - Toggle between light and dark themes with automatic system preference detection
- 🎨 **Enhanced User Experience** - Smooth theme transitions and persistent theme preferences
- 💱 **Optimized Multi-Currency** - Improved currency switching experience with synchronized number formatting and symbols

## Features

### Core Features (Always Available)
- 🌍 **Multi-Currency Support** - Track subscriptions in 10 major currencies
- 💱 **Smart Currency Conversion** - Real-time exchange rates with automatic conversion
- 📊 **Dashboard** - Monthly/yearly cost overview in your preferred currency
- 💳 **Subscription Management** - Track multiple subscriptions with detailed information
- 🔄 **Automatic Calculations** - Automatic renewal date calculations
- 🌙 **Dark Mode Support** - Beautiful light and dark themes with automatic system preference detection
- 📱 **Responsive Design** - Works perfectly on all devices
- 🎨 **Modern UI** - Intuitive interface with smooth animations and theme transitions
- 💾 **Local Storage** - Your data is always saved locally for offline access

### Premium Features (When Cloud Sync is Configured)
- 👤 **User Authentication** - Secure login system with account management
- ☁️ **Multi-Device Sync** - Seamlessly access your data across all devices
- 🔐 **Data Security** - Your information is encrypted and safely stored in the cloud
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
