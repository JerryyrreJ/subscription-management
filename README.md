# Subscription Manager

A modern web application for tracking and managing your recurring subscriptions with **multi-currency support**. Built with React, TypeScript, and Tailwind CSS, this app helps you keep track of your subscription expenses across different currencies with real-time exchange rates.

## ✨ Latest Updates (v1.8.1)

- 📄 **PDF Report Export (Beta)** - Export your analytics report as a professional PDF document with custom layout
- 🎨 **Magazine-Style Layout** - Beautifully designed A4 landscape PDF with asymmetric component placement
- 🖨️ **Print-Ready Quality** - High-resolution output optimized for both digital viewing and printing

### Previous Updates (v1.8.0)

- 📊 **Advanced Analytics & Reporting** - Comprehensive data visualization system with professional charts
- 📈 **Spending Trend Analysis** - 12-month historical spending trends with dual Y-axis showing spend and subscription count
- 🥧 **Category Distribution** - Interactive pie chart showing category-based spending breakdown with percentages
- 🏆 **Top Subscriptions Ranking** - Visual bar chart displaying your 5 most expensive subscriptions
- 🗓️ **Renewal Heatmap** - GitHub-style calendar heatmap showing renewal patterns across days of the month
- 💡 **Smart Insights** - AI-driven optimization suggestions for potential savings and subscription consolidation
- 🌈 **Professional Visualizations** - Powered by Recharts with full dark mode support and responsive design
- 💱 **Multi-Currency Reports** - All analytics correctly convert amounts to your selected base currency
- 🎨 **Intuitive UI** - Clean English interface with gradient color schemes and hover interactions

### Previous Updates (v1.7.1)

- ☁️ **Category Cloud Sync** - Custom categories now automatically sync across all your devices when logged in
- 🔧 **Critical Bug Fixes** - Fixed category data being cleared on login, ensuring default categories are always available
- 🔄 **Enhanced Data Consistency** - Category lists now update in real-time across all modals and components
- 🛡️ **Improved Sync Logic** - Smart sync strategy prevents data loss during initial login synchronization

### Previous Updates (v1.7.0)

- 🔔 **Notification System** - Comprehensive reminder system for upcoming subscription renewals
- 🌐 **Browser Notifications** - Native browser notifications with user-controlled permission requests
- 📱 **Bark Push Integration** - iOS push notifications via Bark app with customizable settings
- ⚙️ **Flexible Reminder Settings** - Choose reminder timing (1/3/7/14 days before renewal)
- 🎯 **Independent Notification Channels** - Browser and Bark notifications work independently with separate history tracking
- 🔕 **Smart Deduplication** - Prevents duplicate notifications (one per subscription per day per channel)
- 🎨 **Custom App Icon** - Professional app icon for browser tabs, notifications, and push messages
- 🔄 **Automatic Cleanup** - Periodic cleanup of notification history to maintain performance

### Previous Updates (v1.6.3)
- 📤📥 **Import/Export Data** - Backup and restore your subscriptions and categories as JSON files
- 🔓 **Offline Access** - Import/Export and Category Settings available without login
- 🎯 **Unified Menu** - Single user menu interface for both logged-in and guest users

## Features

### Core Features (Always Available)
- 📊 **Advanced Analytics & Reporting** - Professional data visualization with spending trends, category distribution, top subscriptions, renewal heatmap, and smart optimization insights
- 📄 **PDF Report Export (Beta)** - Export analytics as professional A4 landscape PDF with magazine-style layout
- 🔔 **Notification System** - Browser and Bark push notifications for upcoming renewals with customizable timing
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
- Recharts (for data visualization)
- jsPDF & html2canvas (for PDF export)
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
- **Filter by category** using the category dropdown in the dashboard
- **Switch base currency** in the dashboard to view total costs in your preferred currency
- View total costs in monthly or yearly format with automatic currency conversion
- **View Advanced Report** by clicking the "Advanced Report" button in the header to see comprehensive analytics
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
