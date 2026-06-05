# Changelog

### v1.10.0 (Current - Offline Notification System)
- **Backend-Driven Notification System** - Complete redesign for 24/7 offline push notifications
- Removed frontend notification checking logic (browser notifications and periodic checks)
- Implemented Netlify Scheduled Function for automatic hourly notification checks
- **Dual-Layer Notification Control**:
  - Global Bark settings in NotificationSettingsModal (server URL, device key, days before)
  - Per-subscription notification toggle in Add/Edit Subscription modals
  - Both switches must be enabled for notifications to be sent
- **Database Schema Updates**:
  - Added `notification_enabled` column to `subscriptions` table (defaults to true)
  - Created `user_notification_settings` table for cloud-based notification configuration
  - Implemented RLS policies for user access and service role access
  - Added indexes for performance optimization
- **Backend Architecture**:
  - Created `send-scheduled-notifications.ts` Netlify Function with @hourly schedule
  - Uses Supabase Service Role Key to query all users with Bark enabled
  - Filters subscriptions by `notification_enabled=true` flag
  - Implements smart deduplication (one notification per subscription per day)
  - Automatic cleanup of notification history older than 30 days
  - Comprehensive error handling and logging
- **Frontend Updates**:
  - Simplified NotificationSettingsModal (removed browser notification section)
  - Added notification toggle UI in AddSubscriptionModal and EditSubscriptionModal
  - Beautiful toggle switch with Bell/BellOff icons and descriptive text
  - Created NotificationSettingsService for cloud synchronization
  - Updated Subscription type to include `notificationEnabled?: boolean` field
  - Updated SubscriptionService to handle notification field in cloud sync
- **Self-Hosted Support**:
  - Full support for official Bark server (https://api.day.app)
  - Support for self-hosted Bark Docker instances
  - Configurable server URL in notification settings
- **Data Migration**:
  - Backward compatible: existing subscriptions default to notification enabled
  - LocalStorage migration removes old browserNotification settings
  - Automatic default values for new notification field
- **Performance & Cost**:
  - Netlify Functions: 720 calls/month (0.58% of 125K free tier)
  - Minimal Supabase storage overhead (~1KB per user)
  - Zero cost for unlimited Bark push notifications
- **Documentation**:
  - Created `docs/NOTIFICATION_DEPLOYMENT_GUIDE.md` with complete setup instructions
  - Created `docs/NOTIFICATION_IMPLEMENTATION_SUMMARY.md` with technical details
  - Updated SQL scripts in `supabase/` directory
- **Environment Variables Required**:
  - `SUPABASE_SERVICE_ROLE_KEY` - Backend access for scheduled function
  - Existing `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for frontend
- **Key Benefits**:
  - ✅ Works 24/7 even when user closes the app
  - ✅ No frontend polling or battery drain
  - ✅ Reliable server-side scheduling
  - ✅ Per-subscription notification control
  - ✅ Support for self-hosted Bark servers
  - ✅ Comprehensive logging and error handling

### v1.9.1 (In Progress - PDF Generation Upgrade)
- **Playwright-based PDF Generation** - Replaced html2canvas with professional Playwright solution
- Removed deprecated dependencies: jspdf, html2canvas (reduced bundle size by ~200KB)
- Implemented React Server-Side Rendering for PDF templates using react-dom/server
- Created Netlify Function for serverless PDF generation:
  - Location: `netlify/functions/generate-pdf/index.ts` (folder structure)
  - Includes dedicated `package.json` for function-specific dependencies
  - Supports both local development and production deployment
- Integrated `@sparticuz/chromium` for AWS Lambda/Netlify serverless Chromium binary
- Added `chromium-bidi` dependency for Playwright compatibility
- Created `renderToHTML.ts` utility for converting React components to complete HTML documents
- Updated `pdfExport.ts` to use Netlify Function API instead of client-side rendering
- Modified `AdvancedReport.tsx` to pass React components directly to PDF export service
- Removed hidden DOM template requirement - PDF generation now fully server-side
- **Quality Improvements**:
  - Exact browser-to-PDF rendering (what you see is what you get)
  - Vector-based text and graphics (no more rasterization)
  - Consistent output across all browsers and devices
  - Target generation time: ~3 seconds (cold start may take 5-10s)
  - Eliminated manual wait times and positioning hacks
- **Architecture Benefits**:
  - Zero client-side PDF generation overhead
  - Scalable serverless architecture
  - No browser compatibility issues
  - Professional-grade PDF output using Chromium engine
- **Documentation**:
  - Reorganized all documentation into `docs/` folder
  - Created `docs/README.md` as documentation index
  - Added `docs/QUICK_START_PDF.md` for testing guide
  - Added `docs/PDF_GENERATION_SETUP.md` for detailed setup
  - Added `docs/PDF_GENERATION_SUMMARY.md` for architecture overview
- **Known Issues**:
  - Local testing requires Playwright browser installation (~150MB)
  - Function requires folder structure with index.ts as entry point
  - First PDF generation has cold start delay (Chromium initialization)
- Updated Netlify configuration with PDF endpoint CORS headers
- Added npm script `dev:full` for testing with Netlify Functions locally

### v1.9.0 (In Progress - Stripe Payment Integration)
- **Stripe Checkout Integration** - Added complete payment processing system
- Installed Stripe SDK packages: `stripe` and `@stripe/stripe-js`
- Created Netlify Functions for serverless payment processing:
  - `netlify/functions/create-checkout-session.ts` - Creates Stripe Checkout sessions
  - `netlify/functions/stripe-webhook.ts` - Handles payment webhooks
- Implemented payment service (`src/services/payment.ts`) with:
  - `createCheckoutSession()` - Create payment session
  - `redirectToCheckout()` - Redirect to Stripe
  - `isStripeConfigured()` - Check if Stripe is configured
  - `getStripePriceId()` - Get product price ID
- Updated `lib/config.ts` with Stripe configuration detection:
  - `hasStripeConfig` - Boolean for Stripe availability
  - `stripe.publishableKey` and `stripe.priceId` - Stripe credentials
  - `features.payment` - Payment feature flag
- Enhanced PricingModal with smart dual-mode system:
  - **Open Source Mode** (no Supabase): Shows "Support Developer" donation option
  - **Premium Mode** (with Supabase): Shows "Premium" upgrade with features
  - Title changes: "Support This Project" vs "Simple Pricing"
  - Description adapts based on deployment mode
  - Badge changes: "Support Open Source" vs "Most Popular"
- Updated pricing structure:
  - Changed from $7/year to $6/lifetime one-time payment
  - Removed "Email notifications" from Premium features
  - Removed "Everything in Open Source" redundant text
  - Added specific Premium features: cloud sync, category sync, PDF export (beta)
- Integrated payment flow into PricingModal:
  - Added `handlePayment()` function with Stripe redirection
  - Added `isProcessing` state for loading feedback
  - Button text changes to "Processing..." during payment
  - Conditional button disabling when payment not configured
- Created comprehensive documentation:
  - `STRIPE_SETUP.md` - Step-by-step Stripe configuration guide
  - `PAYMENT_INTEGRATION.md` - Technical architecture and development guide
  - `SECURITY_CHECKLIST.md` - Security best practices and pre-commit checks
- Updated `.gitignore` to protect sensitive files:
  - All `.env` files and variants
  - `.netlify/` directory
  - All `.md` files except `README.md`
  - Temporary and backup files
- Created configuration files:
  - `netlify.toml` - Netlify deployment configuration
  - `.env.example` - Environment variable template
- **Webhook System**:
  - Configured to handle `checkout.session.completed` events
  - Signature verification for security
  - Ready for Premium status activation logic
  - TODO: Implement Supabase user Premium status update in webhook
- **Environment Variables Required**:
  - `VITE_STRIPE_PUBLISHABLE_KEY` - Stripe public key (frontend)
  - `VITE_STRIPE_PRICE_ID` - Product price ID (frontend)
  - `STRIPE_SECRET_KEY` - Stripe secret key (backend only)
  - `STRIPE_WEBHOOK_SECRET` - Webhook signing secret (backend only)
- **Next Steps**:
  - [ ] Deploy to Netlify
  - [ ] Create Stripe product and get Price ID
  - [ ] Configure Stripe Webhook endpoint
  - [ ] Add environment variables to Netlify
  - [ ] Implement Premium status activation in webhook handler
  - [ ] Test complete payment flow

### v1.8.2
- **Pricing Page** - Added Apple/Fey-style pricing modal with scroll-driven animations
- Implemented PricingModal component with full-screen overlay and modern design aesthetics
- Created useScrollAnimation hook for lightweight scroll-driven animations using Intersection Observer API
- Designed two-tier pricing structure: Open Source (Free) vs Premium ($7/year)
- **Pricing Breakdown**:
  - Free tier: Unlimited subscriptions, multi-currency, local storage, import/export, custom categories, dark mode
  - Premium tier: All free features + advanced analytics, notification reminders, cloud sync, email notifications, priority support, PDF export (coming soon)
- Moved advanced analytics & reports and notification reminders to Premium tier
- Removed data encryption features from both tiers
- Added custom categories sync as a free feature
- Added feature comparison cards with visual indicators and gradient styling
- Integrated "Most Popular" badge for Premium tier with Sparkles icon
- Implemented scroll animations with staggered delays for hero, price, and feature sections
- Added large-scale price display (240px font) showing "$7" with gradient text effects and background glow
- Configured automatic scroll-to-top behavior when modal opens to ensure proper content visibility
- Fixed animation triggering issue by using state-based animations instead of Intersection Observer
- Integrated pricing access through UserMenu with contextual text (logged-in vs guest users)
- Premium users see "Current Plan" disabled button when already subscribed
- Zero dependencies implementation using native browser APIs and Tailwind CSS
- **Design Highlights**:
  - Backdrop blur effect with semi-transparent black overlay (70% opacity)
  - Responsive layout supporting mobile and desktop viewports
  - Smooth fade-in/scale animations (duration: 1000ms with ease-out)
  - Click-outside-to-close functionality with X button in top-right corner
  - Color-coded feature checkmarks (purple for Premium, green for Open Source)
- **User Experience Flow**:
  - Guests: "Upgrade to Premium" → Opens pricing → "Upgrade Now" → Redirects to login
  - Logged-in users: "View Pricing" → Shows plan comparison
  - Premium users: Button shows "Current Plan" (disabled state)

### v1.8.1 (Deprecated - Replaced by v1.9.1)
- **PDF Report Export (Legacy)** - Initial PDF export implementation using html2canvas
- Implemented PDFReportTemplate component with magazine-style layout for A4 landscape format
- Created pdfExport utility using jsPDF and html2canvas
- Designed asymmetric component layout with three-column grid system (280px, 370px, 344px)
- Replaced ResponsiveContainer with fixed-size Recharts components
- Implemented temporary viewport positioning during capture
- Added 2.5-second wait time to ensure charts are rendered before capture
- Configured high-resolution canvas capture (2x scale) with JPEG compression
- Integrated "Export PDF Report" button in AdvancedReport modal with loading state
- **Note**: This approach has been superseded by Playwright-based PDF generation in v1.9.1

### v1.8.0
- **Advanced Analytics & Reporting System** - Major feature addition for data visualization and insights
- Implemented comprehensive analytics report modal with multiple visualization components
- Created data computation engine in utils/reportAnalytics.ts with analytics algorithms
- Added Recharts library for professional data visualization
- **Visualization Components Implemented**:
  - SpendingTrendChart: 12-month spending trend analysis with dual Y-axis (spending + subscription count)
  - CategoryPieChart: Category spending distribution with interactive legend
  - TopSubscriptionsChart: Horizontal bar chart showing top 5 most expensive subscriptions
  - RenewalHeatmap: Monthly renewal calendar with color-coded daily spending intensity
  - InsightsSection: Intelligent optimization suggestions with potential savings calculations
- **Analytics Features**:
  - 12-month historical spending trend analysis
  - Category-based spending breakdown with percentages
  - Top subscriptions ranking by monthly cost
  - Renewal date distribution heatmap (1-31 days of month)
  - Smart optimization suggestions (expensive subscriptions, duplicate detection, annual savings)
- **Report Data Calculations**:
  - Monthly and yearly cost normalization across different billing periods
  - Multi-currency conversion for accurate cross-currency analytics
  - Average subscription cost calculation
  - Category-wise statistics and aggregations
  - Renewal pattern analysis
- Added "Advanced Report" button in app header (visible when subscriptions exist)
- Integrated report modal with full-screen overlay and responsive design
- Report header with gradient styling and currency indicator
- Four overview cards showing key metrics (monthly spend, active subscriptions, average cost, largest category)
- Support for dark mode in all chart components
- **Recent Improvements**:
  - Optimized RenewalHeatmap with GitHub-style compact layout (31-column grid with 3px gap)
  - Changed color scheme from purple to red for better "spending heat" visualization
  - Implemented hover tooltip system with floating information cards
  - Added 5-level red color intensity system for better visual hierarchy
  - Enhanced interaction with scale animation and ring highlights on hover
  - Simplified legend design with compact color squares
  - Added help icon with tooltip in report header to clarify currency selection
  - Redesigned TopSubscriptionsChart with gradient color scheme and improved layout
  - Implemented color-coded badges in subscription list matching chart colors
  - Enhanced Y-axis with 120px width and smart text truncation for long names
  - Added hover effects and compact design for better visual hierarchy
  - **Fully translated all UI text to English** (report components, optimization suggestions, chart labels)
  - **Fixed multi-currency conversion bug** in report analytics:
    - Lifted baseCurrency state from Dashboard component to App.tsx for centralized state management
    - Dashboard now receives baseCurrency, onBaseCurrencyChange, exchangeRates, and onRefreshRates as props
    - Report modal now correctly uses the same baseCurrency selected in Overview section
    - All currency conversions consistently use the same base currency throughout the app
    - Fixed convertCurrency fallback logic to properly use baseCurrency parameter in offline mode
- Report generation uses memoization for performance optimization
- **UI Language**: English (code comments remain in Chinese for developer reference)
- **State Architecture**: Centralized currency state management at App.tsx level ensures consistency across all components
- **Modal Interactions**:
  - Click outside modal to close (backdrop click detection)
  - Smooth fade-in/fade-out animations (300ms duration with ease-out)
  - Scale animation on open (95% → 100%)
  - Background blur effect (backdrop-blur-md)
  - Multiple close methods: X button, Close Report button, or click backdrop
- **Chart Interactions**:
  - TopSubscriptionsChart: Subtle opacity change on hover (opacity: 0.8)
  - Transparent cursor overlay to avoid visual clutter
  - Enhanced tooltip styling with shadow and proper padding

### v1.7.1
- Implemented category cloud synchronization for multi-device category management
- Created CategoryService for cloud-based category CRUD operations and batch synchronization
- Implemented useCategorySync Hook for category sync state management with offline fallback
- Added category sync integration in App.tsx initial login flow
- Enhanced CategorySettingsModal with cloud sync support for add/delete/restore/reorder operations
- Updated AddSubscriptionModal and EditSubscriptionModal with cloud sync for quick-add category feature
- Fixed critical bug where categories were cleared on login due to incorrect sync order
- Improved sync logic to check cloud state before downloading to prevent data loss
- Enhanced category list refresh mechanism to update in real-time across all components
- Modified useEffect dependencies in subscription modals to reload categories when opened
- Added CategoryService.getCategories() for non-destructive cloud state checking
- Implemented smart sync strategy: upload local data first if cloud is empty, then sync
- Created comprehensive error handling and offline degradation for category operations
- Added database schema: user_categories table with RLS policies for secure category storage
- Ensured backward compatibility with existing subscriptions and category data structures

### v1.7.0
- Implemented comprehensive notification system for subscription reminders
- Added browser notification support with user-controlled permission requests
- Integrated Bark push notification support for iOS devices
- Created NotificationSettingsModal component with unified settings interface
- Implemented flexible reminder timing options (1/3/7/14 days before renewal)
- Added independent notification history tracking for browser and Bark channels
- Implemented smart deduplication system (one notification per subscription per day per channel)
- Created notification checking system with hourly automatic checks
- Added periodic cleanup of notification history (30-day retention)
- Designed and integrated custom application icon (512x512 PNG with transparency)
- Added icon support for browser tabs, browser notifications, and Bark push messages
- Created public/ directory for static assets
- Updated notification content format for consistency (monthly → month, yearly → year)
- Modified notification title to use application name "Subscription Manager"
- Implemented data migration for notification settings from old to new structure
- Added notification utilities: notifications.ts, barkPush.ts, notificationChecker.ts
- Extended ReminderSettings interface with separate history tracking per channel
- Fixed notification history bug where browser and Bark shared the same history

### v1.6.3
- Implemented import/export data functionality with JSON file format
- Created utils/exportImport.ts with export, import, and validation functions
- Created ImportDataModal component with preview and confirmation dialog
- Export includes version, export date, subscriptions, and categories data
- Import validates data format and shows preview before confirmation
- Modified UserMenu to support both logged-in and guest users
- User menu now always visible with contextual content based on login state
- Guests see "Login to Sync" button, Export Data, Import Data, and Category Settings
- Logged-in users see full menu including user settings and sign out
- Export data exported loadCategories and saveCategories functions
- Added onLogin callback to UserMenu for guest login flow
- File input with .json filter for import functionality
- Data backup/restore works without requiring authentication

### v1.6.2
- Implemented category filtering functionality in Dashboard
- Added Filter icon and category dropdown selector in dashboard controls (bottom-right)
- Filter and sort controls positioned together with visual separator
- Filtering applied before sorting in data flow (App.tsx)
- Dashboard dynamically recalculates monthly/yearly costs based on filtered subscriptions
- Fixed UI issue: controls remain visible even when filtered results are empty (using totalSubscriptions prop)
- Category filter options dynamically loaded from getVisibleCategories()
- Added "All Categories" option to reset filter

### v1.6.1
- Fixed date picker timezone issue that prevented selection of current date as Last Payment Date
- Changed date calculation from UTC (`toISOString()`) to local timezone format
- Updated both AddSubscriptionModal and EditSubscriptionModal components

### v1.6.0
- Implemented advanced category management system with complete customization capabilities
- Added drag-and-drop category reordering using HTML5 native drag API
- Implemented soft-delete architecture: built-in categories can be hidden, custom categories permanently deleted
- Created CategorySettingsModal component with comprehensive management interface
- Added DeleteCategoryDialog with smart detection and subscription reassignment
- Implemented quick-add category functionality directly in subscription form dropdowns
- Added visual drag feedback with grip handle icon and hover states
- Created category data structure with v2 storage format and automatic migration from v1
- Implemented "Uncategorized" protected fallback category
- Added restore functionality for hidden built-in categories
- Enhanced UserMenu with "Category Settings" entry point
- Updated AddSubscriptionModal and EditSubscriptionModal with inline category creation
- Added Category interface with id, name, order, isBuiltIn, and isHidden properties
- Implemented updateCategoriesOrder, deleteCategory, restoreCategory functions in utils/categories.ts
- Added comprehensive category management utilities with validation and error handling

### v1.5.2
- Added email address management functionality with secure confirmation process
- Implemented password management with advanced security validation requirements
- Enhanced user menu with email and password change options
- Added real-time password strength validation with visual feedback indicators
- Integrated email update workflow with confirmation email system
- Enhanced AuthContext with updateUserEmail and updateUserPassword methods
- Created EditEmailModal and EditPasswordModal components with comprehensive validation
- Improved user experience with success/error feedback and loading states
- Added password requirements display with real-time validation feedback

### v1.5.1
- Added subscription sorting by creation date (createdAt) for tracking when subscriptions were added to the system
- Enhanced price sorting logic to use daily cost calculation for accurate comparison across different billing periods
- Fixed Dashboard component dropdown styling issues for better text visibility and user experience
- Improved UI alignment between price display and active subscription indicator
- Enhanced TypeScript type safety with proper SortBy type imports in Dashboard component
- Added backward compatibility for existing subscriptions without createdAt field in storage utilities
- Updated cloud synchronization service to properly handle createdAt field transformation

### v1.5.0
- Added advanced subscription sorting system with support for name, amount, due date, and category
- Integrated sorting controls directly into the Dashboard component for enhanced user experience
- Enhanced UI layout with compact sorting controls positioned in dashboard bottom-right corner
- Implemented responsive design improvements for mobile layout optimization
- Fixed cross-browser compatibility issues with dropdown text visibility (particularly Safari)
- Added SortConfig interface and sorting types for comprehensive type safety
- Optimized dashboard title from "Total Subscriptions" to "Overview" for better clarity
- Enhanced CustomSelect component integration with proper CSS specificity handling
- Improved mobile responsiveness while preserving original desktop layout design

### v1.4.3
- Added secure "Remember Me" login functionality with trust device option
- Implemented industry-standard Refresh Token + Access Token authentication flow
- Dynamic storage selection: sessionStorage for normal login, localStorage for remember login
- Time-limited remember login with 30-day maximum duration and automatic expiration
- Enhanced authentication security with automatic token refresh every hour
- Improved user experience with seamless persistent login across browser sessions
- Added comprehensive security logging and validation for authentication processes
- Created secure storage adapter that respects user privacy preferences

### v1.4.2
- Implemented smart sync deduplication system with content-based duplicate detection
- Enhanced sync performance with optimized upload/sync algorithms
- Added advanced data integrity protection to prevent duplicate subscriptions
- Fixed authentication flow loading timeouts and improved user experience
- Implemented intelligent content fingerprinting for duplicate prevention
- Added comprehensive logging for sync operations and debugging
- Resolved database permission issues with proper RLS policy implementation
- Created SQL cleanup tools for existing duplicate data
- Enhanced error handling in authentication and sync processes

### v1.4.1
- Added environment detection system for smart feature toggling
- Implemented deployment flexibility (open-source vs premium modes)
- Enhanced conditional rendering of cloud-dependent features
- Improved error handling for missing environment variables
- Added support for single codebase deployment strategies
- Optimized for both local-only and cloud-enabled deployments

### v1.4.0
- Added user authentication system for multi-device synchronization
- Implemented cloud data backup and synchronization
- Added user profile management with customizable nicknames
- Added real-time sync indicator showing synchronization status
- Enhanced security with data encryption for cloud storage
- Improved user experience with seamless offline/online transition

### v1.3.0
- Added dark mode support with automatic system preference detection
- Enhanced user experience with smooth theme transitions
- Optimized multi-currency experience with synchronized formatting
- Added theme persistence across browser sessions

### v1.2.0
- Added multi-currency support with real-time exchange rates
- Fixed Monthly/Yearly calculation bugs
- Improved UI layout with currency selector in front of amount
- Enhanced user experience with consistent form designs
