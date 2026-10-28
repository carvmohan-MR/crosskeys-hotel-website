# CROSSKEYS — Hotel Enquiry Website

Responsive React website + FastAPI REST API + PostgreSQL. The public website is enquiry-only: it shows room information and photos without displaying prices, booking checkout, bank details, or payment screens. Visitors enquire through WhatsApp (9952367870). The separate admin login at `/admin/login` and existing room/photo/slideshow management are retained. Legacy booking/payment API code may remain in the backend but is not part of the public enquiry flow.

## Public website behaviour
- No room prices are shown on the public pages.
- No public booking form, checkout, UPI QR, or bank/payment information is shown.
- WhatsApp enquiry links open a prefilled message to `9952367870` (international link format `919952367870`).
- The public page includes Home, About, Rooms, Gallery, Location and Contact sections.
- Admin login and photo/slideshow management are retained.

## Stack
- Frontend: React, Vite, React Router, plain CSS
- Backend: Python, FastAPI, SQLAlchemy 2, PostgreSQL, Pydantic
- Existing backend: booking/payment-related endpoints may still be present but are not used by the public enquiry-only website
- Images: admin uploads stored locally in `backend/uploads` for development. Use object storage for production.

## Run locally

### 1. PostgreSQL
Create a database and user, or use Docker:
```bash
docker compose up -d db
```

### 2. Backend
```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
copy .env.example .env   # Windows; use cp on macOS/Linux
uvicorn app.main:app --reload
```
API docs: http://localhost:8000/docs

Set `DATABASE_URL`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, and `JWT_SECRET` in `.env`. Change all example secrets before use. Do not share your real `.env` file.

### 3. Frontend
In a second terminal:
```bash
cd frontend
npm install
npm run dev
```
Open http://localhost:5173. Admin login: http://localhost:5173/admin/login.

## Production checklist
- Deploy frontend and backend with HTTPS.
- Use managed PostgreSQL, persistent/object storage for room images, strong secrets, backups, rate limiting, and logs.
- Set `FRONTEND_URL` and `CORS_ORIGINS`.
- The sample uses a simple admin bootstrap account configured by environment variables. Prefer an initial-admin creation command and rotate credentials after setup.
- Confirm local hotel address, coordinates, room inventory, prices, cancellation rules and email address before launch.



## Temporary UPI QR payments (manual verification)
- Set `UPI_ID=crosskeys@okaxis` in `backend/.env` (or leave the default).
- In `frontend`, run `npm.cmd install` to install `qrcode.react`, then `npm.cmd run dev`.
- When Razorpay keys are absent, the booking screen displays a dynamic UPI QR with the server-calculated booking amount and booking reference.
- Bookings remain `pending_payment` until an authenticated admin checks the bank/UPI transaction and clicks **Verify UPI & confirm** in the dashboard. Never approve based only on a screenshot or customer-entered reference.
- Manual confirmation is not automatic payment verification. Use Razorpay/webhook or a bank-supported merchant integration for automated confirmation when available.


## CROSSKEYS current room inventory and occupancy rules
- Deluxe Room: 6 rooms currently in service; 2 guests included; maximum 3 guests. One extra guest costs ₹750 per night.
- Suite Room: 2 rooms currently in service; 4 guests included; maximum 5 guests. One extra guest costs ₹750 per night.
- Four additional rooms under construction are excluded from the online inventory and cannot be booked.
- Backend calculates the extra guest charge per night and checks overlapping confirmed bookings against the in-service room count. Existing databases receive additive columns automatically on startup.
- Review the room base rates in the admin dashboard before launch; the current starter defaults are ₹2,200/night for Deluxe and ₹3,500/night for Suite.


## Admin-managed website images

The admin dashboard now includes a **Homepage slideshow** section:
- Upload multiple JPG, PNG, or WEBP images from your computer.
- Choose which images are active, change their display order, and delete images.
- Set how many seconds each homepage image stays visible (3–60 seconds).
- Room-type photos can also be uploaded in batches, previewed in the admin dashboard, removed individually, and browsed by guests using the room-card arrows.

Images are stored in the backend `uploads/` directory and their metadata is saved in PostgreSQL. Back up the `uploads/` directory together with your database. Do not delete it while the site is running.

## Public website mode: enquiries only

The public homepage is configured as an enquiry-only website. Public room prices, the booking form, checkout/UPI UI, and booking cancellation policy are not shown. Guests can choose optional dates/guest count and contact CROSSKEYS using WhatsApp links; room-specific links include the room name in the prefilled message. The primary WhatsApp contact is configured in `frontend/src/App.jsx` as `919952367870` (country code 91 + 9952367870). Update `WHATSAPP_NUMBER` there if the hotel's WhatsApp number changes. Backend/admin booking and payment endpoints are left in place, but the public frontend no longer calls them.


## Mobile/tablet local-network access (updated)

- The frontend API client now uses the same hostname/IP as the page, with port `8000`, instead of hard-coding `localhost`. This is required for tablets/phones because their `localhost` means the tablet/phone itself.
- FastAPI CORS now permits localhost and private LAN IP origins for local development. For a public production deployment, replace this with a strict allowlist of the deployed frontend origin.
- Start Vite with `npm.cmd run dev -- --host 0.0.0.0` in Windows PowerShell. Open the Vite Network URL on devices connected to the same Wi-Fi.
- Start FastAPI bound to all interfaces, for example `python -m uvicorn app.main:app --host 0.0.0.0 --port 8000` from the backend folder. Windows Firewall may need to allow Python on the private network.
- Room image URLs are normalized to the backend base URL. A room with an empty `image_urls` list needs photos added in the admin image manager; frontend changes cannot invent missing uploaded images.


## Admin photo manager

The admin page is focused on image management and has three separate tabs:
- **Slideshow** — add, hide/show, or remove homepage slideshow photos.
- **Rooms** — add or remove photos for each room type independently.
- **Gallery** — add, hide/show, or remove photos shown only in the website Gallery section.

The backend startup includes an additive migration that adds `site_images.section` to an existing database. Existing site images are assigned to the `slideshow` section, so existing slideshow images are preserved. Public room cards no longer display guest-capacity, extra-guest-charge, or room-description statements, and the enquiry form no longer asks for a guest quantity.

Only upload JPG, PNG, or WEBP images up to 20 MB each. Keep the existing backend `.env`, database, and `uploads` directory when replacing project source files.


## Photo Manager update (October 2026)
- Admin sections load independently so a Gallery endpoint error does not hide Rooms or Slideshow.
- Slideshow, each room type, and Gallery support selecting multiple images in one upload.
- Saved photos are numbered Image 1, Image 2, etc., with a dedicated delete button per image.
- CROSSKEYS logo is included at `frontend/public/crosskeys-logo.jpeg` and used in the site/admin header.
- The map directions button uses the Google Maps link supplied by the hotel owner; the embedded map searches for “HOTEL CROSSKEYS IN WHITE TOWN” together with the supplied street address, so the hotel listing is more likely to be shown on the map.
- Do not copy a `frontend/.env` containing `VITE_API_URL=http://localhost:8000` onto a tablet-accessible build. Leave it unset or use the computer's LAN IP.

For local Wi-Fi access, keep the backend running on `0.0.0.0:8000` and run Vite with `npm.cmd run dev -- --host 0.0.0.0`. Open the Vite Network URL on other devices.
