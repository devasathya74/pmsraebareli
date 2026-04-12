# Police Modern School Raebareli Management System

A Flask-based school management web application with:

- Public landing page
- Secure admin and teacher login
- Session-based authentication with math captcha
- Single active session per user
- Auto logout after inactivity
- Admin modules for students, teachers, admissions, fees, cash ledger, attendance, academics, inventory, messages, and password resets
- Teacher modules for attendance, academic results, and fee visibility
- Firestore-ready structured data layer
- Supabase-ready file storage layer

## Tech Stack

- Frontend: HTML, Tailwind CSS, JavaScript
- Backend: Python Flask
- Data: Firebase Firestore
- File Storage: Supabase Storage

## Project Structure

```text
app.py
config.py
school_app/
  routes/
  services/
  static/
  templates/
```

## Setup

1. Create and activate a virtual environment.
2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Copy `.env.example` into `.env` and fill in production credentials as needed.
4. Run the demo data seeder:

```bash
flask --app app seed-demo
```

5. Start the server:

```bash
flask --app app run --debug
```

## Demo Credentials

After running `seed-demo`:

- Admin: `principal` / `admin123`
- Teacher: `teacher1` / `teacher123`

## Storage Architecture

Production mode is configured with:

- `DATA_BACKEND=firestore`
- `STORAGE_BACKEND=supabase`

File flow:

1. User uploads file in a protected admin or teacher form.
2. File is stored in Supabase Storage.
3. Returned URL plus metadata are saved in the data layer.

For local development, the project also supports:

- `DATA_BACKEND=local`
- `STORAGE_BACKEND=local`

This lets the app boot and be tested without cloud credentials while preserving the same route and service interfaces.

## Security Features

- Username and password login
- Simple math captcha
- Role-based access control
- Protected routes
- Session validation on every request
- Single active session per user
- Configurable inactivity timeout

## Notes

- There is no student login.
- There is no payment gateway.
- There is no chat system.
- There is no mobile app.
