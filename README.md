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
