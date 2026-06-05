# Getting Started

[English](getting-started.md) | [简体中文](../zh-CN/getting-started.md)

Subscription Manager is a Vite app built with React and TypeScript. The default local setup stores data in the browser and does not require a database account.

## Requirements

- Node.js 22.12 or newer
- npm

## Install

```bash
git clone https://github.com/jerryyrrej/subscription-manager.git
cd subscription-manager
npm install
```

## Run the App

```bash
npm run dev
```

Vite starts the app at `http://localhost:5173`.

## Run With Netlify Functions

Use Netlify Dev when testing serverless functions such as Stripe checkout, Stripe webhooks, or scheduled notification logic.

```bash
npm run dev:full
```

This requires the Netlify CLI.

## Useful Commands

```bash
npm run build               # Build for production
npm run preview             # Preview the production build
npm run lint                # Run ESLint
npm run test                # Run utility tests
npm run test:notifications  # Test scheduled notification logic
```

## Local-First Behavior

Without Supabase configuration, subscriptions, categories, preferences, and import/export data stay in the browser. Users can still track subscriptions, filter and sort data, change currencies, view analytics, and use dark mode.
