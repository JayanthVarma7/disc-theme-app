# Shopify Volume Discount App

A Shopify app that creates automatic "Buy 2, get X% off" discounts using Shopify Functions and displays promotional widgets on product pages and cart.

## 🎯 Features

- **Automatic Volume Discounts**: Apply percentage discounts when customers buy 2 or more units of selected products
- **Admin Configuration UI**: Easy-to-use interface for selecting products and setting discount percentages
- **Product Page Widget**: Displays "Buy 2, get X% off" message on eligible product pages
- **Cart Widget**: Shows discount status and promotional messages in the cart
- **Metafield Storage**: Configuration stored securely in shop metafields
- **No Discount Code Required**: Discounts apply automatically at checkout

## 📋 Prerequisites

Before you begin, ensure you have:

1. **Node.js**: Version 20.19+ or 22.12+
2. **Shopify Partner Account**: [Create one here](https://partners.shopify.com/signup)
3. **Development Store**: A test store from your Partner Dashboard
4. **Shopify CLI**: Install globally with `npm install -g @shopify/cli@latest`
5. **MongoDB**: Connection string for session storage (MongoDB Atlas recommended)

## 🚀 Quick Start

### 1. Installation

If you have not created the project locally yet, scaffold it with the Shopify CLI:

```bash
shopify app init disc-theme-app --template remix
cd disc-theme-app
```

If you already cloned or downloaded this repository, just navigate into the folder instead.

```bash
# Install dependencies
npm install
```

### 2. Environment Setup

Create a `.env` file in the root directory:

<!-- MongodDB to hold auth sessions of users -->
```env
MONGODB_URI=your_mongodb_connection_string
```

> **Note**: These values will be automatically populated when you run `shopify app dev` for the first time.

### 3. Link to Your App

```bash
# Link to an existing app or create a new one
shopify app config link
```

### 4. Start Development Server

```bash
npm run dev
# or
shopify app dev
```

Press **P** to open the app in your development store.

#### Having trouble with `shopify app dev` tunneling?

If the Shopify CLI fails to establish its default tunnel (for example if ngrok is blocked on your network), you can provide your own Cloudflare Tunnel URL:

1. Install Cloudflared: `brew install cloudflared`
2. Authenticate once: `cloudflared tunnel login`
3. Start a temporary tunnel: `cloudflared tunnel --url http://localhost:3000`
4. Copy the `https://*.trycloudflare.com` URL that Cloudflared prints
5. In a new terminal, run: `SHOPIFY_TUNNEL_URL=https://YOUR_URL shopify app dev`

The CLI will reuse the Cloudflare URL instead of trying to create its own tunnel.

## 📦 What's Included

### Extensions

1. **Discount Function** (`extensions/discount-function/`)
   - Automatically applies percentage discounts to cart lines when quantity >= 2
   - Reads configuration from shop metafields (`volume_discount.rules`)
   - Runs on `cart.lines.discounts.generate.run` target
   - Includes comprehensive unit tests

2. **Theme App Extension** (`extensions/theme-extension/`)
   - **Volume Discount Widget**: Product page block showing "Buy 2, get X% off"
   - **Cart Discount Widget**: Cart notification showing active discounts
   - Both widgets are customizable through the theme editor

### App Routes

- `/app` - Main discount configuration page with product picker
- `/app/shop-gid` - API endpoint for retrieving shop GID

## 🎨 How to Use

### Step 1: Configure Your Discount

1. Install the app on your development store
2. Open the app from the Shopify admin
3. Click **"Select Products"** to choose eligible products
4. Set your desired discount percentage (1-80%)
5. Click **"Save Configuration"**

### Step 2: Add Theme Widgets

#### Product Page Widget:

1. Go to **Online Store → Themes → Customize**
2. Navigate to any product page
3. In the **Product Information** section, click **"Add block"**
4. Select **"Volume Discount Widget"** from the Apps section
5. Customize the appearance (colors, size, text, etc.)
6. Click **"Save"**

#### Cart Widget (Optional):

1. In the theme editor, navigate to the **Cart** page
2. Click **"Add section"** or **"Add block"** (depending on your theme)
3. Select **"Cart Discount Widget"** from the Apps section
4. Customize the appearance
5. Click **"Save"**

### Step 3: Test the Discount

1. Visit a configured product page
2. You should see: **"🎁 Buy 2, get 10% off!"** (or your configured percentage)
3. Add 2 or more units to the cart
4. The discount will automatically apply in the cart/checkout
5. Reduce quantity below 2 → discount is removed

## 🏗️ Architecture

### Metafield Schema

The app stores configuration in the shop metafield:

```
Namespace: volume_discount
Key: rules
Type: json
Value: {
  "products": ["gid://shopify/Product/123", "gid://shopify/Product/456"],
  "minQty": 2,
  "percentOff": 10
}
```

### Discount Function Logic

```typescript
1. Check if discount class is "Product"
2. Read shop metafield (volume_discount.rules)
3. Parse configuration (products, minQty, percentOff)
4. Filter cart lines:
   - Is product in configured list?
   - Does quantity >= minQty?
5. Create discount operations for qualifying lines
6. Return operations to Shopify
```

### Theme Widget Logic

```liquid
1. Read shop metafield (shop.metafields.volume_discount.rules)
2. Parse JSON configuration
3. Check if current product is eligible
4. If eligible, display widget with configured text
5. If not eligible, hide widget
```

## 🧪 Testing

### Manual Testing Checklist

- [ ] App installs without errors
- [ ] Can select products using product picker
- [ ] Can set discount percentage (1-80%)
- [ ] Configuration saves to metafield
- [ ] Widget appears on configured product pages
- [ ] Widget does NOT appear on non-configured products
- [ ] Adding 2+ units applies discount at checkout
- [ ] Discount shows correct percentage
- [ ] Removing items below 2 units removes discount
- [ ] Cart widget shows appropriate messages

### Automated Tests

Run Function tests:

```bash
cd extensions/discount-function
npm test
```

## 🚢 Deployment

### 1. Build the App

```bash
npm run build
```

### 2. Deploy Extensions

```bash
npm run deploy
```

### 3. Set Up Production Environment

Update environment variables in your hosting platform:

```env
NODE_ENV=production
SHOPIFY_API_KEY=your_production_api_key
SHOPIFY_API_SECRET=your_production_api_secret
MONGODB_URI=your_production_mongodb_uri
```

### 4. Recommended Hosting

- [Google Cloud Run](https://shopify.dev/docs/apps/launch/deployment/deploy-to-google-cloud-run) - Most detailed tutorial
- [Fly.io](https://fly.io/docs/js/shopify/) - Quick single-machine deployment
- [Render](https://render.com/docs/deploy-shopify-app) - Docker-based deployment

## 📁 Project Structure

```
disc-theme-app/
├── app/
│   ├── routes/
│   │   ├── app._index.tsx              # Main discount config UI
│   │   ├── app.tsx                      # App layout with navigation
│   │   ├── app.shop-gid.tsx             # Shop GID API endpoint
│   │   └── auth.login/                  # Authentication routes
│   ├── shopify.server.ts                # Shopify auth & API setup
│   └── root.tsx                         # App root component
├── extensions/
│   ├── discount-function/
│   │   ├── src/
│   │   │   ├── cart_lines_discounts_generate_run.ts      # Function logic
│   │   │   ├── cart_lines_discounts_generate_run.graphql # Input query
│   │   │   ├── cart_lines_discounts_generate_run.test.ts # Unit tests
│   │   │   └── index.ts
│   │   ├── dist/
│   │   │   └── function.wasm            # Compiled function
│   │   └── shopify.extension.toml       # Function config
│   └── theme-extension/
│       ├── blocks/
│       │   ├── product_discount_widget.liquid  # PDP widget
│       │   └── cart_discount_widget.liquid     # Cart widget
│       ├── locales/
│       │   └── en.default.json          # Translations
│       └── shopify.extension.toml       # Theme extension config
├── package.json
├── shopify.app.toml                     # App configuration
└── README.md
```

## 🛠️ Tech Stack

- **Framework**: React Router v7
- **UI Components**: Shopify Polaris Web Components
- **API**: Shopify Admin GraphQL API
- **Database**: MongoDB (session storage)
- **Functions**: Shopify Functions (Rust/TypeScript)
- **Extensions**: Theme App Extensions (Liquid)

## 🔧 Configuration

### Shopify App (`shopify.app.toml`)

- `client_id`: `10a94a44b15c31ff5dd7ea8224c955c5`
- `application_url`: `https://trail-recordings-attacks-dvds.trycloudflare.com` (replace with your tunnel URL when it changes)
- Webhooks use API version `2026-01` and register `app/uninstalled` plus `app/scopes_update`
- Access scopes: `read_products, write_products, read_discounts, write_discounts`
- Redirect URLs point to `https://devdiscounttheme.myshopify.com/api/auth` and `/auth/callback`

Update these values whenever you point the app at a new partner development store or tunnel.

### Discount Function (`extensions/discount-function/shopify.extension.toml`)

```toml
api_version = "2025-04"

[[extensions]]
name = "Volume Discount Function"
handle = "volume-discount-function"
type = "function"

  [[extensions.targeting]]
  target = "cart.lines.discounts.generate.run"
  input_query = "src/cart_lines_discounts_generate_run.graphql"
  export = "cart-lines-discounts-generate-run"
  discount_classes = ["PRODUCT"]

  [extensions.build]
  path = "dist/function.wasm"
```

The Shopify CLI manages the `uid` that lives in this file—leave it untouched unless you intentionally regenerate the extension.

### Theme Extension (`extensions/theme-extension/shopify.extension.toml`)

```toml
name = "theme-extension"
type = "theme"
```

Just like the function, the CLI owns the theme extension `uid`. Add new blocks under `extensions/theme-extension` when you want to expose additional widgets.

## 🐛 Troubleshooting

### Discount Not Applying

1. Check metafield is saved: GraphiQL → `shop { metafield(namespace: "volume_discount", key: "rules") { value } }`
2. Verify product IDs match format: `gid://shopify/Product/{id}`
3. Ensure quantity is >= 2
4. Check Function logs in Partner Dashboard

### Widget Not Showing

1. Verify widget is added in Theme Editor
2. Check product is in configured list
3. View page source to see if metafield is accessible
4. Ensure theme is published

### Product Picker Not Working

1. Ensure you're testing on a development store
2. Check browser console for errors
3. Verify App Bridge is properly initialized

### MongoDB Connection Issues

1. Whitelist your IP in MongoDB Atlas
2. Verify connection string format
3. Check credentials are correct

## 📚 Resources

### Shopify Documentation

- [Shopify Functions](https://shopify.dev/docs/api/functions)
- [Discount Functions](https://shopify.dev/docs/apps/build/discounts)
- [Theme App Extensions](https://shopify.dev/docs/apps/build/online-store/theme-app-extensions)
- [Metafields](https://shopify.dev/docs/apps/build/custom-data/metafields)
- [Admin GraphQL API](https://shopify.dev/docs/api/admin-graphql)

### Framework Documentation

- [React Router](https://reactrouter.com/)
- [Shopify App React Router](https://shopify.dev/docs/api/shopify-app-react-router)
- [Polaris Web Components](https://shopify.dev/docs/api/app-home/polaris-web-components)

## 🤝 Support

For issues or questions:

1. Check [Shopify Community Forums](https://community.shopify.com/)
2. Review [Shopify Dev Documentation](https://shopify.dev/)
3. Open an issue in this repository

## 📝 License

This project is provided as-is for educational use.

## 👤 Author

**Jayanth Konduru**

---

**Built with ❤️ using Shopify's React Router App Template**
