# Subscription Manager

A modern web application for tracking and managing your recurring subscriptions with **multi-currency support**. Built with React, TypeScript, and Tailwind CSS, this app helps you keep track of your subscription expenses across different currencies with real-time exchange rates.

## ✨ Latest Updates (v1.6.3)

- 📤📥 **Import/Export Data** - Backup and restore your subscriptions and categories as JSON files
- 🔓 **Offline Access** - Import/Export and Category Settings available without login
- 🎯 **Unified Menu** - Single user menu interface for both logged-in and guest users

### Previous Updates (v1.6.2)
- 🔍 **Category Filter** - Filter subscriptions by category with dynamic cost calculation in dashboard
- 🎯 **Smart UI Controls** - Filter and sort controls remain visible even when filtered results are empty

### Earlier Updates (v1.6.0)
- 🗂️ **Advanced Category Management** - Complete category customization with drag-and-drop sorting, add/edit/delete capabilities
- 🎯 **Smart Category System** - Built-in categories can be hidden (not deleted) and easily restored when needed
- 🔄 **Intelligent Delete Protection** - Smart detection when deleting categories with automatic subscription reassignment
- ➕ **Quick Add Categories** - Add new categories directly from the subscription form dropdown for seamless workflow
- 🖱️ **Drag-and-Drop Sorting** - Intuitive category reordering with visual feedback and smooth animations
- 🎨 **Category Settings UI** - Dedicated management interface accessible from user menu with comprehensive controls

## Features

### Core Features (Always Available)
- 🗂️ **Advanced Category Management** - Full category customization with drag-and-drop sorting, quick-add from dropdown, and smart delete protection
- 🔍 **Category Filtering** - Filter subscriptions by category with real-time cost recalculation in dashboard
- 🎯 **Advanced Sorting System** - Sort subscriptions by name, amount, due date, category, or creation date for comprehensive expense tracking
- 📤📥 **Import/Export Data** - Backup and restore your data as JSON files, no login required
- 🌍 **Multi-Currency Support** - Track subscriptions in 10 major currencies
- 💱 **Smart Currency Conversion** - Real-time exchange rates with automatic conversion
- 📊 **Enhanced Dashboard** - Monthly/yearly cost overview with integrated sorting and filtering controls
- 💳 **Subscription Management** - Track multiple subscriptions with detailed information
- 🔄 **Automatic Calculations** - Automatic renewal date calculations
- 🌙 **Dark Mode Support** - Beautiful light and dark themes with automatic system preference detection
- 📱 **Responsive Design** - Works perfectly on all devices with optimized mobile layouts
- 🎨 **Modern UI** - Intuitive interface with smooth animations and theme transitions
- 💾 **Local Storage** - Your data is always saved locally for offline access

### Premium Features (When Cloud Sync is Configured)
- 👤 **User Authentication** - Secure login system with comprehensive account management
- 📧 **Email Management** - Change your email address with secure confirmation process
- 🔐 **Password Management** - Update password with advanced security validation
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

### Managing Categories

- **Quick Add**: Select "+ Add New Category" from the category dropdown when adding/editing subscriptions
- **Category Settings**: Access from user menu (top-right) → "Category Settings"
- **Drag to Reorder**: Drag categories by the grip icon to change their order
- **Hide/Delete**: Built-in categories can be hidden (and restored later), custom categories can be permanently deleted
- **Smart Delete**: When deleting a category with subscriptions, you'll be prompted to reassign them to another category
- **Restore Defaults**: One-click restore of all built-in categories

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
- **Account Management**: Complete user profile management including email and password updates
- **Email Management**: Secure email address updates with confirmation process
- **Password Security**: Advanced password management with strength validation
- **Remember Me Login**: Trust device functionality with secure 30-day session persistence
- **Industry-Standard Security**: Refresh Token + Access Token architecture with automatic token refresh
- **Secure Backup**: Your data is securely backed up and encrypted in the cloud
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
