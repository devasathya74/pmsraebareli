# Police Modern School Management System - PRD

## Overview
A comprehensive school management system for Police Modern School, Raebareli. The application manages student admissions, staff records, fee collection, attendance, and academic results.

## Tech Stack
- **Frontend**: HTML5, Tailwind CSS, JavaScript (ES6 Modules)
- **Backend (API)**: Python Flask
- **Database**: Firebase Firestore (Main Storage) / SQLite (Local Fallback)
- **File Storage**: Supabase Storage / Local Storage
- **Authentication**: Firebase Authentication with Math CAPTCHA

## Core Modules

### 1. Admin Dashboard
- **Stats**: Total students, teachers, admissions, pending fees.
- **Student Management**: CRUD operations for student records.
- **Admission Management**: Reviewing and approving new admission applications.
- **Fee Collection**: Recording payments, viewing history, and generating ledgers.
- **Inventory**: Tracking school assets.
- **Communication**: Sending notifications/messages to users.

### 2. Teacher Dashboard
- **Attendance**: Marking and viewing class attendance.
- **Results**: Entry and viewing of academic marks.
- **Messages**: Viewing admin communications.

## Current State & Priorities (RALPH LOOP)
1.  **Fee Management Refinement**: The current fee module is functional but needs better UI consistency and a "Fee Card" detailed view.
2.  **Dashboard Integration**: Ensuring all dashboard tabs are fully linked to backend services.
3.  **Security**: Hardening session management and auto-logout logic.

## Design Aesthetic
- Premium, modern, and vibrant.
- Glassmorphism and smooth transitions.
- "High-fidelity" management portal.
