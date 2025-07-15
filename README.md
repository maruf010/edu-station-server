# Edu Station Backend

Edu Station is an educational platform backend built using **Express.js**, **MongoDB**, **Firebase Admin**, and **Stripe**. It provides RESTful APIs for managing users, classes, assignments, enrollments, payments, feedback, wishlist, and teacher requests with a robust role-based authentication system.

---

## 🚀 Tech Stack

- **Node.js** + **Express.js**
- **MongoDB** (with native driver)
- **Firebase Admin SDK** (for token verification & user deletion)
- **Stripe** (for secure payment handling)
- **dotenv** (for environment config)
- **CORS** & **JSON Middleware**

---

## 🔐 Authentication & Middleware

- `verifyFBToken` – Middleware to validate Firebase Auth token
- `verifyAdmin` – Middleware to check admin role
- `verifyTeacher` – Middleware to check teacher role

---

## 📁 Collections

- `users`
- `teacherRequests`
- `teachers`
- `classes`
- `assignments`
- `submissions`
- `feedbacks`
- `payments`
- `wishlist`
- `enrollments`

---

## 📚 Core Features

### ✅ User Management

- POST `/users` – Create user if not already exists
- GET `/users` – Get all users
- DELETE `/users/:id?email=email@example.com` – Delete from both Firebase & DB
- PATCH `/users/make-admin/:id` – Promote to admin
- PATCH `/users/remove-admin/:id` – Demote to student
- GET `/users/:email/role` – Get user role

### ✅ Teacher Request Flow

- POST `/teacherRequests` – Submit teacher application
- GET `/teacherRequests` – Get all pending/rejected
- GET `/teacherRequests/:email` – Get specific teacher request
- PATCH `/teacherRequests/approve/:id` – Approve and assign role
- PATCH `/teacherRequests/reject/:id` – Reject teacher request
- PATCH `/teacherRequests/reapply/:email` – Reapply request
- PATCH `/teachers/deactivate/:id` – Deactivate teacher & revert role
- GET `/teachers` – Get all teachers

### 📦 Classes

- GET `/classes` – Admin: All classes (sorted newest first)
- POST `/classes` – Teacher: Add new class
- PATCH `/my-classes/:id` – Update own class
- DELETE `/my-classes/:id` – Delete own class
- GET `/class/:id` – Get specific class
- GET `/my-classes?email=email` – Get all classes by teacher
- GET `/classes/approved` – Public: Approved classes
- GET `/classes/approved/:id` – Public: Approved single class
- PATCH `/admin/approve-class/:id` – Admin approves class
- PATCH `/admin/reject-class/:id` – Admin rejects class

### 📋 Assignments

- POST `/assignments` – Create assignment (teacher only)
- GET `/assignments/:classId` – Get assignments by class with submission count
- GET `/classes/:id/summary` – Class summary

### 📤 Submissions

- POST `/submissions` – Submit assignment
- GET `/submissions?email=xyz&classId=id` – Get submissions by student
- GET `/submissions/by-assignment/:assignmentId` – Submissions by assignment
- PATCH `/submissions/:id` – Teacher marks and reviews
- PATCH `/submissions/viewed/:id` – Mark submission as viewed

### ❤️ Feedback

- POST `/feedbacks` – Submit feedback (only if enrolled and not duplicate)
- GET `/feedbacks?classId=...` – Feedbacks by class or all
- GET `/feedback?email=...` – Feedbacks by a student
- PATCH `/feedbacks/:id` – Update own feedback
- DELETE `/feedbacks/:id` – Delete own feedback or by admin

### 💳 Payments

- POST `/create-payment-intent` – Create Stripe intent
- POST `/payments` – Save payment (prevent duplicates)
- GET `/payments` – Admin gets all / student gets own

### 📝 Enrollments

- POST `/enrollments` – Save enrollment & update seats
- GET `/enrollments?email=xyz` – Get student enrollments

### 🌟 Wishlist

- POST `/wishlist` – Add to wishlist
- GET `/wishlist?email=...` – Get user wishlist
- DELETE `/wishlist/:id` – Remove from wishlist

### 📊 Dashboards

- GET `/dashboard-summary?email=...&role=admin|teacher|student` – Role-based summary
- GET `/stats/summary` – Platform stats: users, classes, enrollments, teachers

---

## ⚙️ Environment Variables (`.env`)

```env
PORT=5000
DB_USER=yourMongoUsername
DB_PASS=yourMongoPassword
STRIPE_SECRET_KEY=yourStripeSecret
```

---

## ✅ Status

✅ Fully functional API with role-based access control, secure payments, class + assignment handling, and user lifecycle management.

---

## 📞 Contact

**Developed by:** `Edu Station` team, powered by `MARUF`

For any issues, contact the admin.

---

> "Empowering education through smart technology."
