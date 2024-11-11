# Subscription Manager

A modern web application for tracking and managing your recurring subscriptions. Built with React, TypeScript, and Tailwind CSS, this app helps you keep track of your subscription expenses with a clean and intuitive interface.

## Features

- 📊 Dashboard with monthly/yearly cost overview
- 💳 Track multiple subscriptions with detailed information
- 🔄 Automatic renewal date calculations
- 📱 Responsive design for all devices
- 🔒 Privacy-focused: all data stored locally
- 🌙 Clean, modern UI with animations

## Technologies Used

- React 18
- TypeScript
- Tailwind CSS
- Vite
- Lucide Icons
- Local Storage for data persistence

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn

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
   - Amount
   - Payment Period (Monthly/Yearly/Custom)
   - Last Payment Date

### Managing Subscriptions

- Click any subscription card to view details
- Use the edit button to modify subscription details
- Use the delete button to remove subscriptions
- View total costs in monthly or yearly format

### Data Storage

All subscription data is stored in your browser's local storage. No data is sent to any external servers, ensuring complete privacy.

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
