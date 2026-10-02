# SafarDesk — Travel Business Management System

**Display Title:** SafarDesk — Travel Business Management System  
**Phase:** Phase 0 (Scaffold, Routing, Design System, & Firestore Architecture)  
**Stack:** React (Vite + TypeScript), Tailwind CSS, React Router, Firebase (Auth & Firestore)

---

## 1. Overview & Single-File Tenant Deployment

SafarDesk is a multi-module travel agency CRM and business management system specifically architected for Umrah operators, ticketing consolidators, and B2B sub-agent networks operating across Saudi Arabia (**SAR**) and Pakistan / South Asia (**PKR**).

### Single Source of Configuration: `src/config.ts`
All tenant branding, company titles, currency parameters, and Firebase backend credentials are centralized in `src/config.ts`:

```typescript
// src/config.ts
export const TENANT = {
  companyName: 'SafarDesk Travel & Tours',
  appTitle: 'SafarDesk — Travel Business Management System',
  shortName: 'SafarDesk',
  tagline: 'Enterprise Travel, Visa & Voucher Management CRM',
  currency: {
    primary: 'SAR',
    secondary: 'PKR',
    defaultExchangeRate: 74.50, // 1 SAR = 74.50 PKR
  },
  contact: { ... },
  dateFormat: 'DD-MMM-YYYY',
};

export const firebaseConfig = {
  apiKey: '...',
  authDomain: '...',
  projectId: '...',
  storageBucket: '...',
  messagingSenderId: '...',
  appId: '...',
};
```

> **Client Redeployment:** To deploy SafarDesk for a new travel agency client, simply modify the `TENANT` and `firebaseConfig` objects in `src/config.ts` (or provide environment variables). No other code changes are needed.

---

## 2. Authentication & Roles (AuthContext)

Authentication is handled via Firebase Auth and synchronized with Firestore:
- **`users` Collection Document Keyed by Auth UID (`users/{uid}`)**:
  - Contains user details (`displayName`, `email`, `role`, `agencyName`, `status`, `lastLoginAt`).
  - Roles supported:
    - **`owner`**: Full executive, financial, ledger, and tenant configuration privileges.
    - **`staff`**: Operations desk access (visa processing, voucher generation, ticketing).
    - **`agent`**: External B2B sub-agent portal access (view own bookings, visa manifest, and ledger balance).
- **Demo & Preview Session**:
  - The login interface provides 1-click preset login buttons for `Owner`, `Staff`, and `Agent`, allowing immediate inspection of role-specific interfaces even before configuring live Firebase API keys.
  - The top avatar dropdown includes an instant Role Switcher for real-time testing.

---

## 3. App Shell & Horizontal Top Navigation

- **Top Horizontal Navigation Bar (No Left Sidebar)**:
  - **Left**: SafarDesk Compass emblem + Company Name (`TENANT.companyName`) + CRM pill.
  - **Center**:
    - `Dashboard` (`/`)
    - `Visas` (`/visas`)
    - `Vouchers` (`/vouchers`)
    - `Tickets` (`/tickets`)
    - `Accounts` (`/accounts`)
    - `Masters` (`/masters`)
    - `Reports` (`/reports`)
    - `Settings` (`/settings`)
  - **Right**:
    - **Prominent Global Search button** with `⌘K` keyboard shortcut that opens the categorized Spotlight search modal.
    - **Forex Indicator Pill** displaying live benchmark (`1 SAR = 74.50 PKR`).
    - **User Avatar Menu** displaying user initials, name, active role badge, profile link, change password modal, role switcher, and sign-out confirmation dialog.
- **Main Container**:
  - Max-width responsive container (`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6`).
  - Professional footer displaying tenant details and currency pairs.

---

## 4. Design System & Palette

- **Brand Colors**:
  - **Deep Navy**: `#0e2c4c` (primary brand, navigation header, primary buttons)
  - **Accent Gold**: `#c9a227` (accent badges, highlight bars, secondary actions)
  - **Supporting Tones**: Clean slate grays (`slate-50` to `slate-900`), emerald for confirmed/issued items, rose for voids/alerts.
- **Typography**: Clean sans-serif font (**Inter**) with tabular numbers (`tabular-nums` / `font-mono`) for all financial and numerical columns.
- **Spacing Grid**: Consistent 8px spacing increments (`p-2`, `p-4`, `p-6`, `gap-4`, `gap-6`).
- **Cards & Borders**: White cards with subtle borders (`border-slate-200/90`) and soft shadows (`shadow-xs` / `shadow-sm`).
- **Form Controls**: Labels positioned strictly above fields, clear placeholders, subtle focus rings, error states, and helper text.
- **Toasts**: Floating non-intrusive toast notifications for feedback (`ToastProvider`, `useToast()`).
- **Empty States**: Icon container with one-line guidance and optional action button.
- **Loading Skeletons**: Smooth pulse skeleton animations for cards, table rows, and page transitions.

---

## 5. Reusable Components & Utilities

| Component / Utility | File Path | Description |
|---|---|---|
| `PageHeader` | `src/components/ui/PageHeader.tsx` | Standard header with title, subtitle, breadcrumb links, and action buttons |
| `DataTable` | `src/components/ui/DataTable.tsx` | Sortable columns, sticky header, right-aligned numeric data, and empty states |
| `StatCard` | `src/components/ui/StatCard.tsx` | Executive KPI card with trend indicator, icons, and SAR/PKR dual values |
| `CurrencyAmount` | `src/components/ui/CurrencyAmount.tsx` | Formats and displays SAR & PKR dual currency pairs (`stacked`, `inline`, or `dual-badge`) |
| `Badge` | `src/components/ui/Badge.tsx` | Status pills with variants: `navy`, `gold`, `success`, `warning`, `danger`, `neutral` |
| `DateInput` | `src/components/ui/DateInput.tsx` | Clean date picker with calendar icon and label above field |
| `Input` | `src/components/ui/Input.tsx` | Styled form text/number input with left/right icon slots |
| `Button` | `src/components/ui/Button.tsx` | Primary navy, accent gold, outline, ghost, and danger variants |
| `Card` | `src/components/ui/Card.tsx` | White surface with subtle border, padding grid, and optional hover effect |
| `Modal` | `src/components/ui/Modal.tsx` | Dialog overlay with backdrop blur, keyboard escape handler, and action slots |
| `ConfirmDialog` | `src/components/ui/ConfirmDialog.tsx` | Confirmation modal for critical actions (voids, logouts, deletes) |
| `EmptyState` | `src/components/ui/EmptyState.tsx` | Clean empty state with icon, title, and guidance |
| `Skeleton` | `src/components/ui/Skeleton.tsx` | Loading skeletons for cards and data tables |
| `formatDate` | `src/utils/formatters.ts` | Formats dates to standard `DD-MMM-YYYY` (e.g. `02-Oct-2026`) |
| `formatMoney` | `src/utils/formatters.ts` | Formats currency with commas and 2 decimals (e.g. `1,250.00 SAR`) |
| `formatDualCurrency`| `src/utils/formatters.ts` | Converts SAR to PKR using default or custom exchange rate |

---

## 6. Firestore Collections Naming Convention & Schema Catalog

*(Note: Phase 0 establishes the naming conventions and architectural blueprint below. No live business records are written yet.)*

### 1. `users`
- **Purpose**: Authenticated user profiles and role-based permissions.
- **Key**: `{uid}` (Firebase Auth User ID).
- **Fields**: `uid` (string), `email` (string), `displayName` (string), `role` (`'owner' | 'staff' | 'agent'`), `agencyName` (string), `phone` (string), `status` (`'active' | 'suspended'`), `createdAt` (timestamp), `lastLoginAt` (timestamp).

### 2. `agents`
- **Purpose**: B2B sub-agents, external travel agencies, and distributors.
- **Key**: `{agentId}` (e.g. `AGT-KHI-01`).
- **Fields**: `code` (string), `name` (string), `contactPerson` (string), `email` (string), `phone` (string), `city` (string), `country` (string), `creditLimitSar` (number), `currentBalanceSar` (number), `status` (`'active' | 'blocked'`), `createdAt` (timestamp).

### 3. `vendors`
- **Purpose**: Service vendors, ground handlers, visa service bureaus, and transport suppliers.
- **Key**: `{vendorId}` (e.g. `VND-MAK-01`).
- **Fields**: `name` (string), `category` (`'hotels' | 'transport' | 'visa-bureau' | 'catering'`), `city` (string), `phone` (string), `payableBalanceSar` (number), `createdAt` (timestamp).

### 4. `hotels`
- **Purpose**: Master inventory of contracted properties in Makkah, Madinah, and Jeddah.
- **Key**: `{hotelId}` (e.g. `HTL-MK-FAIRMONT`).
- **Fields**: `name` (string), `city` (`'Makkah' | 'Madinah' | 'Jeddah'`), `starRating` (number: 1–5), `address` (string), `contactNumber` (string), `allotmentContractId` (string), `amenities` (array of string).

### 5. `airlines`
- **Purpose**: Airlines master list for GDS ticketing and flight segments.
- **Key**: `{airlineCode}` (e.g. `SV`, `XY`, `PK`, `PA`).
- **Fields**: `iataCode` (string), `icaoCode` (string), `name` (string), `country` (string), `ticketingType` (`'BSP' | 'Portal' | 'GDS'`).

### 6. `airports`
- **Purpose**: Airport codes and flight sectors.
- **Key**: `{iataCode}` (e.g. `JED`, `MED`, `RUH`, `KHI`, `LHE`, `ISB`).
- **Fields**: `code` (string), `name` (string), `city` (string), `country` (string).

### 7. `exchangeRates`
- **Purpose**: Daily and historical foreign exchange rates (SAR ↔ PKR, SAR ↔ USD).
- **Key**: `{rateId}` (e.g. `2026-10-02_SAR_PKR`).
- **Fields**: `baseCurrency` (string: `'SAR'`), `targetCurrency` (string: `'PKR'`), `rate` (number: e.g. `74.50`), `effectiveDate` (timestamp), `updatedBy` (string).

### 8. `visaImports`
- **Purpose**: Batch file logs of passport/applicant imports (Excel / CSV / XML).
- **Key**: `{importId}`.
- **Fields**: `fileName` (string), `importedBy` (string), `totalRecords` (number), `successfulRecords` (number), `failedRecords` (number), `importDate` (timestamp), `status` (`'completed' | 'partial' | 'failed'`).

### 9. `visas`
- **Purpose**: Individual visa records and applications (Umrah, tourist e-Visa, commercial).
- **Key**: `{visaId}` (e.g. `VIS-2026-0001`).
- **Fields**: `applicationNo` (string), `applicantName` (string), `passportNumber` (string), `nationality` (string), `dob` (string), `gender` (`'M' | 'F'`), `visaType` (`'Umrah' | 'Tourist' | 'Work' | 'Visit'`), `subAgentId` (string), `status` (`'Draft' | 'Submitted' | 'Issued' | 'Rejected'`), `feeSar` (number), `issueDate` (timestamp), `expiryDate` (timestamp).

### 10. `distributions`
- **Purpose**: Sub-agent quota allocations and package allotments.
- **Key**: `{distributionId}`.
- **Fields**: `subAgentId` (string), `serviceType` (`'visas' | 'hotel-rooms' | 'airline-seats'`), `allocatedQuota` (number), `consumedQuota` (number), `unitPriceSar` (number), `periodStart` (timestamp), `periodEnd` (timestamp).

### 11. `invoices`
- **Purpose**: Commercial sales invoices issued to clients and sub-agents.
- **Key**: `{invoiceId}` (e.g. `INV-2026-1001`).
- **Fields**: `invoiceNumber` (string), `date` (timestamp), `dueDate` (timestamp), `subAgentId` (string), `clientName` (string), `totalSar` (number), `exchangeRate` (number), `totalPkr` (number), `paidSar` (number), `balanceSar` (number), `status` (`'unpaid' | 'partial' | 'paid' | 'void'`), `lineItems` (array).

### 12. `vouchers`
- **Purpose**: Accommodation, transport, and ground service vouchers.
- **Key**: `{voucherId}` (e.g. `VCH-2026-8801`).
- **Fields**: `voucherNumber` (string), `hotelId` (string), `hotelName` (string), `city` (`'Makkah' | 'Madinah' | 'Jeddah'`), `guestLeadName` (string), `paxCount` (number), `checkIn` (timestamp), `checkOut` (timestamp), `nights` (number), `roomConfig` (string), `totalCostSar` (number), `status` (`'Confirmed' | 'Pending' | 'Cancelled'`).

### 13. `tickets`
- **Purpose**: Airline e-tickets, PNR records, and flight bookings.
- **Key**: `{ticketId}` (e.g. `TCK-2026-4401`).
- **Fields**: `pnr` (string), `ticketNumber` (string), `passengerName` (string), `airlineCode` (string), `route` (string), `departureDate` (timestamp), `returnDate` (timestamp), `baseFareSar` (number), `taxesSar` (number), `totalFareSar` (number), `commissionSar` (number), `status` (`'Issued' | 'Confirmed' | 'Refunded' | 'Void'`).

### 14. `ledgerEntries`
- **Purpose**: Double-entry financial journal lines for agent and vendor sub-ledgers.
- **Key**: `{entryId}`.
- **Fields**: `entryDate` (timestamp), `voucherRef` (string), `accountType` (`'Agent' | 'Vendor' | 'Bank' | 'Revenue' | 'Expense'`), `accountId` (string), `accountName` (string), `particulars` (string), `debitSar` (number), `creditSar` (number), `runningBalanceSar` (number), `exchangeRate` (number), `amountPkr` (number), `createdBy` (string).

### 15. `payments`
- **Purpose**: Receipts from sub-agents and disbursements to vendors.
- **Key**: `{paymentId}` (e.g. `PAY-2026-3001`).
- **Fields**: `paymentType` (`'Receipt' | 'Disbursement'`), `date` (timestamp), `partyId` (string), `partyName` (string), `amountSar` (number), `amountPkr` (number), `bankId` (string), `paymentMode` (`'Bank Wire' | 'Cash' | 'Cheque' | 'Online'`), `referenceNo` (string), `notes` (string).

### 16. `journalVouchers`
- **Purpose**: Manual accounting adjustments and closing entries.
- **Key**: `{jvId}` (e.g. `JV-2026-0501`).
- **Fields**: `jvNumber` (string), `date` (timestamp), `narration` (string), `totalDebitSar` (number), `totalCreditSar` (number), `entries` (array of debit/credit lines), `approvedBy` (string).

### 17. `banks`
- **Purpose**: Company bank accounts (SAR in KSA and PKR in Pakistan).
- **Key**: `{bankId}` (e.g. `BNK-ALRAJHI-SAR`).
- **Fields**: `bankName` (string: e.g. `'Al-Rajhi Bank'`, `'Meezan Bank'`), `accountTitle` (string), `accountNumber` (string), `iban` (string), `currency` (`'SAR' | 'PKR' | 'USD'`), `currentBalance` (number).

### 18. `customers`
- **Purpose**: Direct retail travelers and pilgrims directory.
- **Key**: `{customerId}`.
- **Fields**: `name` (string), `passportNumber` (string), `phone` (string), `email` (string), `city` (string), `totalBookings` (number), `createdAt` (timestamp).

### 19. `auditLog`
- **Purpose**: Compliance and activity tracking for financial transactions, rate edits, and visa issuances.
- **Key**: `{logId}`.
- **Fields**: `timestamp` (timestamp), `userId` (string), `userName` (string), `action` (string: e.g. `'CREATE_VOUCHER'`, `'UPDATE_FOREX'`, `'VOID_TICKET'`), `collection` (string), `documentId` (string), `details` (map), `ipAddress` (string).

### 20. `settings`
- **Purpose**: System-wide configuration, business rules, and tenant preferences.
- **Key**: `'global'` / `'tenant'`.
- **Fields**: `companyName` (string), `appTitle` (string), `defaultForexRate` (number), `taxRegistrationNo` (string), `operationalCurrencies` (array of string), `invoiceTerms` (string).

---

## 7. Running & Testing the Application

```bash
# 1. Install dependencies (already installed)
npm install

# 2. Run local development server
npm run dev

# 3. Build for production
npm run build
```

When visiting `/`:
1. If unauthenticated, the app redirects to `/login`.
2. Click any of the **Demo Account** buttons (`Owner`, `Staff`, `Agent`) to sign in instantly.
3. Test the **Top Horizontal Navbar**, click **Search** (`⌘K`), navigate between all 8 modules (`Visas`, `Vouchers`, `Tickets`, `Accounts`, `Masters`, `Reports`, `Settings`), and test the **SAR/PKR dual currency conversions** and interactive UI components.
