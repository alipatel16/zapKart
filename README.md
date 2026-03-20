# ⚡ ZAP DELIVERY — Local Town Delivery App

A full-featured, production-ready React PWA for local town delivery. Built with Create React App, Material UI, and Firebase.

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Firebase Setup
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project
3. Enable these services:
   - **Authentication** → Sign-in methods: Google, Facebook, Email/Password
   - **Firestore Database** → Start in production mode
   - **Storage** → For product/banner/category images
   - **Analytics** (optional)

4. Copy your Firebase config:
```bash
cp .env.example .env
# Fill in all REACT_APP_FIREBASE_* values
```

### 3. Razorpay Setup
1. Sign up at [Razorpay Dashboard](https://dashboard.razorpay.com/)
2. Get your Key ID from Settings → API Keys
3. Add to `.env`: `REACT_APP_RAZORPAY_KEY_ID=rzp_test_XXXXXXXX`

> ⚠️ For production, Razorpay order creation should happen on a backend (Node.js/Firebase Functions) to sign requests and prevent fraud.

### 4. Set Admin Email
In `.env`, set `REACT_APP_ADMIN_EMAIL=your@email.com`
The first time this email signs in, they'll be assigned `role: admin`.

### 5. Run
```bash
npm start
```

---

## 🗂️ Firestore Collections Structure

```
users/
  {userId}
    uid, email, displayName, phone, photoURL
    role: 'user' | 'admin'
    addresses: [{id, label, name, phone, line1, line2, city, state, pincode}]
    createdAt, updatedAt

categories/
  {categoryId}
    name, description, imageUrl, order, active
    createdAt, updatedAt

products/
  {productId}
    name, unit, description
    categoryId
    mrp, discountedPrice
    images: [url1, url2, ...]
    stock
    isFeatured, isExclusive, isNewArrival
    active
    createdAt, updatedAt

orders/
  {orderId}
    orderNumber
    userId, customerName, customerEmail, customerPhone
    items: [{id, name, quantity, mrp, discountedPrice, images}]
    address: {label, name, phone, line1, line2, city, state, pincode}
    subtotal, discount, couponCode, deliveryCharge, total
    paymentMethod: 'cod' | 'razorpay'
    paymentStatus: 'pending' | 'paid'
    paymentInfo: {razorpay_payment_id, ...}
    status: 'placed'|'confirmed'|'processing'|'packed'|'enroute'|'delivered'|'cancelled'
    statusHistory: [{status, timestamp}]
    createdAt, updatedAt

banners/
  {bannerId}
    title, subtitle, imageUrl, link, order, active
    createdAt, updatedAt

coupons/
  {couponId}
    code, type: 'percent'|'fixed', value
    maxDiscount (for percent type), minOrder
    active, expiresAt
    createdAt, updatedAt

purchases/
  {purchaseId}
    items: [{productId, productName, quantity, costPrice}]
    supplier, notes, date
    totalCost
    createdAt

settings/
  app: {deliveryCharge, freeDeliveryAbove, appName, ...}
```

---

## 🔍 Required Firestore Indexes

Create these **composite indexes** in Firebase Console → Firestore → Indexes:

| Collection | Fields | Order |
|------------|--------|-------|
| orders | userId ASC, createdAt DESC | — |
| orders | status ASC, createdAt DESC | — |
| products | categoryId ASC, createdAt DESC | — |
| products | isFeatured ASC, active ASC, createdAt DESC | — |
| products | isExclusive ASC, active ASC, createdAt DESC | — |
| products | isNewArrival ASC, active ASC, createdAt DESC | — |
| orders | createdAt ASC+DESC (single field) | — |

---

## 📱 PWA Installation

This app is fully installable as a PWA (Progressive Web App):

- **Android Chrome**: "Add to Home Screen" banner appears automatically, OR use browser menu → "Install App"
- **iOS Safari**: Share button → "Add to Home Screen"
- **Desktop Chrome/Edge**: Install icon in address bar

---

## 🏗️ Project Structure

```
src/
├── components/
│   ├── common/
│   │   ├── Header.jsx         # Top navigation with search, cart, menu
│   │   └── BottomNav.jsx      # Mobile bottom navigation
│   └── user/
│       ├── ProductCard.jsx    # Product card with add-to-cart
│       └── BannerCarousel.jsx # Home page carousel (Swiper)
├── context/
│   ├── AuthContext.jsx        # Firebase auth state + user profile
│   └── CartContext.jsx        # Cart state with localStorage persistence
├── hooks/
│   └── usePagination.js       # Server-side pagination hooks
├── pages/
│   ├── user/
│   │   ├── Home.jsx           # Dashboard: banners, categories, products
│   │   ├── Auth.jsx           # Login/Register (Google, Facebook, Email)
│   │   ├── Cart.jsx           # Cart with coupon & summary
│   │   ├── Checkout.jsx       # Address + Payment + Order placement
│   │   ├── OrderHistory.jsx   # Orders with status tracker & invoice
│   │   ├── ProductDetail.jsx  # Product detail with image gallery
│   │   ├── CategoryPage.jsx   # Paginated product grid with filters
│   │   └── Profile.jsx        # User profile + address management
│   └── admin/
│       ├── AdminLayout.jsx    # Collapsible sidebar layout
│       ├── AdminDashboard.jsx # Stats, alerts, recent orders
│       ├── AdminOrders.jsx    # Order management + status updates
│       ├── AdminProducts.jsx  # Full product CRUD + image upload
│       ├── AdminPurchases.jsx # Purchase records + auto inventory update
│       ├── AdminOtherPages.jsx # Categories, Inventory, Sales Report
│       └── AdminBannersAndCoupons.jsx # Banner/Coupon management
├── utils/
│   └── helpers.js             # Razorpay, PDF invoice, formatters
├── firebase.js                # Firebase init + collection names
├── theme.js                   # MUI theme (Syne + DM Sans fonts)
└── App.js                     # All routes
```

---

## 🎨 Design System

- **Primary**: `#FF6B35` (Vibrant Orange)
- **Secondary**: `#1A1A2E` (Deep Navy)
- **Accent**: `#FFD23F` (Amber Yellow)
- **Success**: `#06D6A0` (Mint Green)
- **Fonts**: [Syne](https://fonts.google.com/specimen/Syne) (headings) + [DM Sans](https://fonts.google.com/specimen/DM+Sans) (body)

---

## 🔧 Extending the App

### Add Push Notifications (Firebase FCM)
```bash
npm install firebase/messaging
```
Configure in `firebase.js` and `public/firebase-messaging-sw.js`

### Add Payment Backend (Razorpay Order API)
Deploy a Firebase Function:
```javascript
exports.createRazorpayOrder = functions.https.onCall(async (data, context) => {
  const razorpay = new Razorpay({ key_id: ..., key_secret: ... });
  const order = await razorpay.orders.create({ amount: data.amount * 100, currency: 'INR' });
  return order;
});
```

---

## 📦 Build for Production

```bash
npm run build
```

Deploy the `build/` folder to:
- **Firebase Hosting**: `firebase deploy`
- **Vercel**: Connect GitHub repo
- **Netlify**: Drag and drop `build/` folder

---

## ⚙️ Environment Variables

| Variable | Description |
|----------|-------------|
| `REACT_APP_FIREBASE_*` | Firebase project config |
| `REACT_APP_RAZORPAY_KEY_ID` | Razorpay public key |
| `REACT_APP_DELIVERY_CHARGE` | Default delivery charge (₹10) |
| `REACT_APP_FREE_DELIVERY_ABOVE` | Free delivery threshold (₹299) |
| `REACT_APP_ADMIN_EMAIL` | Admin user email |

---

## 📞 Support

Built with ❤️ for local town businesses. Customise, brand, and deploy!

---

## 🏪 Multi-Store / Location System (v2)

### How It Works

**User Side:**
1. On first launch, the app asks for GPS permission
2. It finds the nearest active store within `SERVICE_RADIUS_KM` (default 2km)
3. If a store is found — user sees the app normally, products/banners are filtered to that store
4. If no store is within 2km — user sees "Not serving your area" screen with address search
5. User can change location anytime from the **header location chip** → opens a location picker
6. Location picker shows all stores with distance indicators and ✅/❌ service availability

**Admin Side:**
1. When admin logs into `/admin`, a **store selector modal** appears immediately
2. Admin picks which store they're managing
3. All data shown (products, orders, purchases, inventory, banners, sales) is scoped to that store
4. Admin can switch stores anytime via the sidebar store chip
5. When admin adds a product, banner, or purchase — it's automatically tagged with the `storeId`

### Firestore Indexes Required (additional for stores)
| Collection | Fields |
|---|---|
| products | storeId ASC, active ASC, createdAt DESC |
| products | storeId ASC, isFeatured ASC, active ASC |
| products | storeId ASC, isExclusive ASC, active ASC |
| products | storeId ASC, isNewArrival ASC, active ASC |
| orders | storeId ASC, createdAt DESC |
| orders | storeId ASC, status ASC, createdAt DESC |
| banners | storeId ASC, active ASC, order ASC |

### Adding Your First Store
1. Go to `/admin` → you'll be asked to select a store
2. Click "Add Store First" → goes to `/admin/stores`
3. Fill in store name, full address, click "Auto-Detect" to get lat/lng from address
4. Or get coordinates from Google Maps: right-click any point → "What's here?" → copy the numbers
5. Set delivery radius (default 2km)
6. Save — now go back to dashboard and select this store

### Data Structure Added to `stores` Collection
```
stores/
  {storeId}
    name: "ZAP Mart - Anna Nagar"
    address: "Shop 4, 3rd Ave, Anna Nagar, Chennai 600040"
    lat: 13.0850
    lng: 80.2101
    deliveryRadiusKm: 2
    phone: "9876543210"
    openTime: "08:00"
    closeTime: "22:00"
    active: true
    createdAt, updatedAt
```

### Fields Added to Existing Collections
- `products.storeId` — which store stocks this product
- `banners.storeId` — which store shows this banner
- `orders.storeId` / `orders.storeName` — which store fulfills this order
- `purchases.storeId` — which store this stock purchase belongs to
