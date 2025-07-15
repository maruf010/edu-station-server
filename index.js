const express = require('express');
require('dotenv').config();
const cors = require('cors');
const app = express();
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const admin = require("firebase-admin");


app.use(cors());
app.use(express.json());


// const decodedKey = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString('utf8');
// const serviceAccount = JSON.parse(decodedKey);

const serviceAccount = require("./firebase-admit-key.json");

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.vnbrepr.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;


const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});


async function run() {
    try {

        // await client.connect();

        const db = client.db("eduStationDB");
        const usersCollection = db.collection("users");
        const teacherRequestsCollection = db.collection("teacherRequests");
        const teachersCollection = db.collection("teachers");
        const classesCollection = db.collection("classes");
        const enrollmentsCollection = db.collection("enrollments");
        const feedbacksCollection = db.collection("feedbacks");
        const paymentsCollection = db.collection("payments");
        const wishlistCollection = db.collection("wishlist");
        const assignmentsCollection = db.collection("assignments");
        const submissionsCollection = db.collection("submissions");


        // Middleware to verify Firebase token
        const verifyFBToken = async (req, res, next) => {
            const authHeader = req.headers.authorization;
            if (!authHeader) return res.status(401).send({ message: 'unauthorized access' });

            const token = authHeader.split(' ')[1];

            if (!token) {
                return res.status(401).send({ message: 'unauthorized access' })
            }

            try {
                const decoded = await admin.auth().verifyIdToken(token);
                req.decoded = decoded;
                next();
            } catch (error) {
                return res.status(403).send({ message: 'forbidden access' });
            }
        };

        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email }
            const user = await usersCollection.findOne(query);
            if (!user || user.role !== 'admin') {
                return res.status(403).send({ message: 'forbidden access' })
            }
            next();
        }

        const verifyTeacher = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email }
            const user = await usersCollection.findOne(query);
            if (!user || user.role !== 'teacher') {
                return res.status(403).send({ message: 'forbidden access' })
            }
            next();
        }



        // teacher post assignment
        // app.post('/assignments', verifyFBToken, verifyTeacher, async (req, res) => {
        //     const assignment = req.body;

        //     if (!assignment.classId || !assignment.title || !assignment.deadline || !assignment.description) {
        //         return res.status(400).send({ message: 'Missing required fields' });
        //     }

        //     assignment.createdAt = new Date();

        //     try {
        //         const result = await assignmentsCollection.insertOne(assignment);
        //         res.send(result);
        //     } catch (err) {
        //         console.error('Error creating assignment:', err);
        //         res.status(500).send({ message: 'Internal server error' });
        //     }
        // });
        app.post('/assignments', async (req, res) => {
            try {
                const assignment = req.body;

                // Ensure required fields are present
                if (!assignment.title || !assignment.deadline || !assignment.description || !assignment.classId) {
                    return res.status(400).json({ message: 'Missing required fields' });
                }

                // ✅ Optional but good: Ensure className exists if sent
                assignment.className = assignment.className || "Unknown";

                // Save to DB
                const result = await assignmentsCollection.insertOne({
                    ...assignment,
                    createdAt: new Date()
                });

                res.status(201).json(result);
            } catch (error) {
                console.error('Error creating assignment:', error);
                res.status(500).json({ message: 'Internal server error' });
            }
        });

        // all class summary     progress
        app.get('/classes/:id/summary', verifyFBToken, async (req, res) => {
            const classId = req.params.id;

            try {
                const [enrollments, totalAssignments, totalSubmissions] = await Promise.all([
                    paymentsCollection.countDocuments({ classId }),
                    assignmentsCollection.countDocuments({ classId }),
                    submissionsCollection.countDocuments({ classId })
                ]);

                res.send({
                    enrollments,
                    totalAssignments,
                    totalSubmissions
                });
            } catch (error) {
                console.error('Error fetching class summary:', error);
                res.status(500).send({ message: 'Internal server error' });
            }
        });
        // GET /assignments/:classId
        app.get('/assignments/:classId', async (req, res) => {
            const classId = req.params.classId;
            const result = await assignmentsCollection
                .find({ classId })
                .toArray();

            // Optional: count submissions per assignment
            const assignmentsWithCounts = await Promise.all(
                result.map(async (assignment) => {
                    const count = await submissionsCollection.countDocuments({ assignmentId: assignment._id.toString() });
                    return { ...assignment, totalSubmissions: count };
                })
            );

            res.send(assignmentsWithCounts);
        });


        app.post('/submissions', verifyFBToken, async (req, res) => {
            const data = req.body;
            data.submittedAt = new Date();
            const result = await submissionsCollection.insertOne(data);
            res.send(result);
        });
        app.get('/submissions', async (req, res) => {
            const { email, classId } = req.query;

            if (!email || !classId) {
                return res.status(400).json({ message: "Missing email or classId" });
            }

            const submissions = await submissionsCollection
                .find({ studentEmail: email, classId })
                .toArray();

            res.send(submissions);
        });
        app.get('/submissions/by-assignment/:assignmentId', async (req, res) => {
            const { assignmentId } = req.params;
            try {
                const submissions = await submissionsCollection
                    .find({ assignmentId })
                    .sort({ submittedAt: -1 })
                    .toArray();
                res.json(submissions);
            } catch (err) {
                res.status(500).json({ message: 'Failed to fetch submissions' });
            }
        });
        app.patch('/submissions/:id', async (req, res) => {
            const { id } = req.params;
            const { marks, review } = req.body;

            try {
                const result = await submissionsCollection.updateOne(
                    { _id: new ObjectId(id) },
                    {
                        $set: {
                            marks: parseFloat(marks),
                            review: review || ''
                        }
                    }
                );
                res.json(result);
            } catch (err) {
                res.status(500).json({ message: 'Failed to update submission' });
            }
        });
        app.patch('/submissions/viewed/:id', async (req, res) => {
            const id = req.params.id;
            const { viewedHash } = req.body;

            const result = await submissionsCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: { viewedHash: viewedHash } }
            );

            res.send(result);
        });



        // POST /create-payment-intent
        app.post('/create-payment-intent', async (req, res) => {
            const { price } = req.body;

            if (!price || price <= 0) {
                return res.status(400).send({ error: 'Invalid price' });
            }

            const paymentIntent = await stripe.paymentIntents.create({
                amount: price * 100, // Stripe works in cents
                currency: 'usd',
                payment_method_types: ['card']
            });

            res.send({
                clientSecret: paymentIntent.client_secret
            });
        });
        // POST /payments
        app.post('/payments', verifyFBToken, async (req, res) => {
            const payment = req.body;
            const { classId, userEmail } = payment;

            try {
                // ✅ Check if already enrolled
                const alreadyEnrolled = await paymentsCollection.findOne({ classId, userEmail });
                if (alreadyEnrolled) {
                    return res.status(400).send({ message: 'You have already enrolled in this class.' });
                }

                // ✅ If not enrolled, proceed to insert
                const result = await paymentsCollection.insertOne(payment);
                res.send(result);

            } catch (err) {
                console.error('Error saving payment:', err);
                res.status(500).send({ message: 'Failed to save payment record' });
            }
        });
        // ✅ Unified GET /payments (supports admin + student)
        app.get('/payments', verifyFBToken, async (req, res) => {
            const email = req.query.email;
            const decodedEmail = req.decoded?.email;
            // console.log('payment', req.headers);
            // console.log('decoded', req.decoded);
            try {
                // If an email is provided, and it matches the token (student mode)
                if (email && email === decodedEmail) {
                    const payments = await paymentsCollection
                        .find({ userEmail: email })
                        .sort({ date: -1 })
                        .toArray();
                    return res.send(payments);
                }

                // If no email provided, assume it's admin
                const payments = await paymentsCollection
                    .find()
                    .sort({ date: -1 })
                    .toArray();
                return res.send(payments);
            } catch (error) {
                console.error('Error fetching payments:', error);
                res.status(500).send({ message: 'Internal server error' });
            }
        });


        // Aggregation
        //Backend API (Express route using MongoDB aggregation)
        app.get('/dashboard-summary', verifyFBToken, async (req, res) => {
            const email = req.query.email;
            const role = req.query.role; // 'admin', 'teacher', or 'student'

            try {
                if (role === 'admin') {
                    const [users, classes, enrollments, earnings, teachers] = await Promise.all([
                        usersCollection.estimatedDocumentCount(),
                        classesCollection.countDocuments({ status: 'approved' }),
                        paymentsCollection.countDocuments(),
                        paymentsCollection.aggregate([
                            { $group: { _id: null, total: { $sum: "$price" } } }
                        ]).toArray(),
                        usersCollection.countDocuments({ role: 'teacher' })
                    ]);

                    return res.send({
                        users,
                        classes,
                        enrollments,
                        earnings: earnings[0]?.total || 0,
                        teachers
                    });
                }

                if (role === 'teacher') {
                    const [myClasses, myStudents, myEarnings] = await Promise.all([
                        classesCollection.countDocuments({ teacherEmail: email }),
                        paymentsCollection.countDocuments({ teacherEmail: email }),
                        paymentsCollection.aggregate([
                            { $match: { teacherEmail: email } },
                            { $group: { _id: null, total: { $sum: "$price" } } }
                        ]).toArray()
                    ]);

                    return res.send({
                        myClasses,
                        myStudents,
                        myEarnings: myEarnings[0]?.total || 0
                    });
                }


                if (role === 'student') {
                    const [myEnrollments, mySpent] = await Promise.all([
                        paymentsCollection.countDocuments({ userEmail: email }),
                        paymentsCollection.aggregate([
                            { $match: { userEmail: email } },
                            { $group: { _id: null, total: { $sum: "$price" } } }
                        ]).toArray()
                    ]);

                    return res.send({
                        myEnrollments,
                        mySpent: mySpent[0]?.total || 0
                    });
                }

                return res.status(400).send({ message: 'Invalid role' });
            } catch (error) {
                console.error("Dashboard summary error:", error);
                res.status(500).send({ message: 'Internal server error' });
            }
        });

        // ✅ Add this endpoint to your backend (e.g., near the other `/stats` or `/users` endpoints)
        app.get('/stats/summary', async (req, res) => {
            try {
                const users = await usersCollection.countDocuments();
                const classes = await classesCollection.countDocuments({ status: 'approved' });
                const enrollments = await paymentsCollection.countDocuments();
                const teachers = await usersCollection.countDocuments({ role: 'teacher' });

                res.send({ users, classes, enrollments, teachers });
            } catch (error) {
                console.error('Error fetching performance stats:', error);
                res.status(500).send({ message: 'Failed to fetch stats' });
            }
        });



        app.post('/wishlist', verifyFBToken, async (req, res) => {
            const item = req.body;

            // Check if user already enrolled
            const enrolled = await paymentsCollection.findOne({ classId: item.classId, userEmail: item.userEmail });
            if (enrolled) return res.status(400).send({ message: 'Already enrolled in this class.' });


            // Check if already in wishlist
            const existing = await wishlistCollection.findOne({ classId: item.classId, userEmail: item.userEmail });
            if (existing) return res.status(400).send({ message: 'Already in wishlist' });

            const result = await wishlistCollection.insertOne(item);
            res.send(result);
        });
        // GET /wishlist?email=
        app.get('/wishlist', verifyFBToken, async (req, res) => {
            const email = req.query.email;
            if (!email) return res.status(400).send({ message: 'Email required' });

            const result = await wishlistCollection.find({ userEmail: email }).toArray();
            res.send(result);
        });
        // DELETE /wishlist/:id
        app.delete('/wishlist/:id', verifyFBToken, async (req, res) => {
            const id = req.params.id;
            const result = await wishlistCollection.deleteOne({ _id: new ObjectId(id) });
            res.send(result);
        });


        app.post('/enrollments', async (req, res) => {
            const enrollment = req.body;
            const classId = enrollment.classId;

            // Save enrollment
            const result = await enrollmentsCollection.insertOne(enrollment);

            // ✅ Update class seat count and enrolled number
            await classesCollection.updateOne(
                { _id: new ObjectId(classId) },
                {
                    $inc: { enrolled: 1, seats: -1 }
                }
            );
            const classDoc = await classesCollection.findOne({ _id: new ObjectId(classId) });
            if (!classDoc || classDoc.seats <= 0) {
                return res.status(400).send({ message: 'No available seats.' });
            }


            res.send(result);
        });
        // GET /enrollments?email=student@example.com
        app.get('/enrollments', async (req, res) => {
            const email = req.query.email;
            if (!email) return res.status(400).send({ error: 'Email is required' });

            const result = await enrollmentsCollection.find({ userEmail: email }).toArray();
            res.send(result);
        });



        app.post('/feedbacks', async (req, res) => {
            const feedback = req.body;
            const { classId, studentEmail, assignmentTitle } = feedback;

            try {
                // ✅ Confirm student is enrolled in the class
                const isEnrolled = await enrollmentsCollection.findOne({
                    classId,
                    userEmail: studentEmail
                });

                if (!isEnrolled) {
                    return res.status(403).send({ message: 'You must be enrolled in this class to give feedback.' });
                }

                // ✅ Check for existing feedback for this assignment
                const existingFeedback = await feedbacksCollection.findOne({
                    classId,
                    studentEmail,
                    assignmentTitle
                });

                if (existingFeedback) {
                    return res.status(400).send({ message: 'You already submitted feedback for this assignment.' });
                }

                feedback.createdAt = new Date();
                const result = await feedbacksCollection.insertOne(feedback);

                res.send(result);
            } catch (error) {
                console.error('Feedback insert error:', error);
                res.status(500).send({ message: 'Something went wrong' });
            }
        });
        // app.post('/feedbacks', async (req, res) => {
        //     const feedback = req.body;
        //     const { classId, studentEmail } = feedback;

        //     try {
        //         // ✅ Confirm student is enrolled in the class
        //         const isEnrolled = await enrollmentsCollection.findOne({
        //             classId,
        //             userEmail: studentEmail
        //         });

        //         if (!isEnrolled) {
        //             return res.status(403).send({ message: 'You must be enrolled in this class to give feedback.' });
        //         }

        //         // ✅ Check for existing feedback from same user for this class
        //         const existingFeedback = await feedbacksCollection.findOne({ classId, studentEmail });

        //         if (existingFeedback) {
        //             return res.status(400).send({ message: 'You have already submitted feedback for this class.' });
        //         }

        //         feedback.createdAt = new Date();
        //         const result = await feedbacksCollection.insertOne(feedback);

        //         res.send(result);
        //     } catch (error) {
        //         console.error('Feedback insert error:', error);
        //         res.status(500).send({ message: 'Something went wrong' });
        //     }
        // });

        // GET /feedbacks details and home page
        app.get('/feedbacks', async (req, res) => {
            const classId = req.query.classId;

            const query = classId ? { classId } : {};
            const feedbacks = await feedbacksCollection
                .find(query)
                .sort({ createdAt: -1 }) // newest first
                .toArray();

            res.send(feedbacks);
        });
        // GET: All feedbacks by a student in my enroll class
        app.get('/feedback', async (req, res) => {
            const email = req.query.email;
            if (!email) return res.status(400).send({ message: 'Email is required' });

            const feedbacks = await feedbacksCollection.find({ studentEmail: email }).toArray();
            res.send(feedbacks);
        });
        app.patch('/feedbacks/:id', verifyFBToken, async (req, res) => {
            const id = req.params.id;
            const { feedback, rating } = req.body;
            const email = req.decoded.email;

            try {
                const existing = await feedbacksCollection.findOne({ _id: new ObjectId(id) });

                if (!existing) return res.status(404).send({ message: 'Feedback not found' });
                if (existing.studentEmail !== email) {
                    return res.status(403).send({ message: 'You can only update your own feedback' });
                }

                const result = await feedbacksCollection.updateOne(
                    { _id: new ObjectId(id) },
                    {
                        $set: {
                            feedback,
                            rating,
                            updatedAt: new Date()
                        }
                    }
                );

                res.send(result);
            } catch (error) {
                console.error('Update feedback error:', error);
                res.status(500).send({ message: 'Internal server error' });
            }
        });
        // app.delete('/feedbacks/:id', verifyFBToken, async (req, res) => {
        //     const id = req.params.id;
        //     const email = req.decoded.email;

        //     try {
        //         const feedback = await feedbacksCollection.findOne({ _id: new ObjectId(id) });

        //         if (!feedback) return res.status(404).send({ message: 'Feedback not found' });
        //         if (feedback.studentEmail !== email) {
        //             return res.status(403).send({ message: 'You can only delete your own feedback' });
        //         }

        //         const result = await feedbacksCollection.deleteOne({ _id: new ObjectId(id) });
        //         res.send(result);
        //     } catch (error) {
        //         console.error('Delete feedback error:', error);
        //         res.status(500).send({ message: 'Internal server error' });
        //     }
        // });




        //teachers

        // DELETE /feedbacks/:id
        app.delete('/feedbacks/:id', verifyFBToken, async (req, res) => {
            const { id } = req.params;

            if (!ObjectId.isValid(id)) {
                return res.status(400).json({ message: 'Invalid feedback ID' });
            }

            try {
                const feedback = await feedbacksCollection.findOne({ _id: new ObjectId(id) });
                if (!feedback) {
                    return res.status(404).json({ message: 'Feedback not found' });
                }

                const requesterEmail = req.decoded.email;

                // Get user from usersCollection
                const user = await usersCollection.findOne({ email: requesterEmail });

                // Check if the user is either the feedback owner or an admin
                const isOwner = requesterEmail === feedback.studentEmail;
                const isAdmin = user?.role === 'admin';

                if (!isOwner && !isAdmin) {
                    return res.status(403).json({ message: 'Forbidden: Not allowed to delete this feedback' });
                }

                const result = await feedbacksCollection.deleteOne({ _id: new ObjectId(id) });

                if (result.deletedCount === 0) {
                    return res.status(500).json({ message: 'Failed to delete feedback' });
                }

                res.json({ message: 'Feedback deleted successfully' });
            } catch (error) {
                console.error('Delete feedback error:', error);
                res.status(500).json({ message: 'Internal server error' });
            }
        });



        // GET /classes (for admin - all classes with newest first)
        app.get('/classes', verifyFBToken, verifyAdmin, async (req, res) => {
            try {
                const result = await classesCollection
                    .find()
                    .sort({ createdAt: -1 }) // newest first
                    .toArray();
                res.send(result);
            } catch (error) {
                res.status(500).send({ message: 'Failed to fetch classes' });
            }
        });
        app.post('/classes', verifyFBToken, verifyTeacher, async (req, res) => {
            const newClass = req.body;
            const result = await classesCollection.insertOne(newClass);
            res.send(result);
        });
        app.get('/class/:id', async (req, res) => {
            try {
                const id = req.params.id;
                const classData = await classesCollection.findOne({ _id: new ObjectId(id) });

                if (!classData) {
                    return res.status(404).json({ message: 'Class not found' });
                }

                res.json(classData);
            } catch (error) {
                console.error('Error fetching class:', error);
                res.status(500).json({ message: 'Server error' });
            }
        });
        app.get('/my-classes', verifyFBToken, async (req, res) => {
            const email = req.query.email;
            try {

                const result = await classesCollection.find({ teacherEmail: email }).toArray();
                res.send(result);
            } catch (err) {
                console.error('Error fetching classes:', err);
                res.status(500).send({ message: 'Internal server error' });
            }
        });
        app.patch('/my-classes/:id', verifyFBToken, async (req, res) => {
            const id = req.params.id;
            if (!ObjectId.isValid(id)) return res.status(400).send({ message: 'Invalid ID' });

            const { name, image, price, seats, description, category } = req.body;
            try {
                const result = await classesCollection.updateOne(
                    { _id: new ObjectId(id) },
                    {
                        $set: {
                            name,
                            image,
                            price,
                            seats,
                            description,
                            category,
                            status: 'pending',
                            updatedAt: new Date()
                        }
                    }
                );
                res.send({ modifiedCount: result.modifiedCount });
            } catch (err) {
                console.error('Update error:', err);
                res.status(500).send({ message: 'Internal server error' });
            }
        });
        app.delete('/my-classes/:id', verifyFBToken, async (req, res) => {
            const id = req.params.id;
            if (!ObjectId.isValid(id)) return res.status(400).send({ message: 'Invalid ID' });
            try {
                const result = await classesCollection.deleteOne({ _id: new ObjectId(id) });
                res.send({ deletedCount: result.deletedCount });
            } catch (err) {
                console.error('Delete error:', err);
                res.status(500).send({ message: 'Internal server error' });
            }
        });
        app.get('/admin/pending-classes', verifyFBToken, async (req, res) => {
            try {
                const pending = await classesCollection.find({ status: 'pending' }).toArray();
                res.send(pending);
            } catch (err) {
                res.status(500).send({ message: 'Internal server error' });
            }
        });
        // PATCH /admin/reject-class/:id
        app.patch('/admin/reject-class/:id', verifyFBToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            try {
                const result = await classesCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: { status: 'rejected' } }
                );
                res.send(result);
            } catch (error) {
                res.status(500).send({ message: 'Failed to reject class' });
            }
        });

        //pending classes approve
        app.patch('/admin/approve-class/:id', verifyFBToken, async (req, res) => {
            const id = req.params.id;
            try {
                const result = await classesCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: { status: 'approved' } }
                );
                res.send({ modifiedCount: result.modifiedCount });
            } catch (err) {
                res.status(500).send({ message: 'Internal server error' });
            }
        });
        app.get('/classes/approved', async (req, res) => {
            try {
                const approved = await classesCollection.find({ status: 'approved' }).toArray();
                res.send(approved);
            } catch (err) {
                res.status(500).send({ message: 'Internal server error' });
            }
        });
        app.get('/classes/approved/:id', async (req, res) => {
            const id = req.params.id;
            try {
                const classDoc = await classesCollection.findOne({ _id: new ObjectId(id), status: 'approved' });
                if (!classDoc) return res.status(404).send({ message: 'Class not found or not approved' });
                res.send(classDoc);
            } catch (error) {
                console.error('Error fetching class:', error);
                res.status(500).send({ message: 'Internal server error' });
            }
        });


        app.get('/users/:email/role', verifyFBToken, async (req, res) => {
            const email = req.params.email;
            try {
                const user = await usersCollection.findOne({ email });
                if (!user) return res.send({ role: 'user' });
                res.send({ role: user.role || 'user' });
            } catch (error) {
                console.error('Error fetching user role:', error);
                res.status(500).send({ message: 'Internal server error' });
            }
        });
        app.patch('/users/make-admin/:id', verifyFBToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            try {
                const result = await usersCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: { role: 'admin' } }
                );
                res.send({ modifiedCount: result.modifiedCount });
            } catch (error) {
                console.error('Error making admin:', error);
                res.status(500).send({ message: 'Internal server error' });
            }
        });
        app.patch('/users/remove-admin/:id', verifyFBToken, async (req, res) => {
            const { id } = req.params;
            const result = await usersCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: { role: 'student' } }
            );
            res.send(result);
        });


        app.post('/teacherRequests', verifyFBToken, async (req, res) => {
            const request = req.body;
            const existing = await teacherRequestsCollection.findOne({ email: request.email });
            if (existing) return res.status(400).send({ message: 'Request already exists' });
            const result = await teacherRequestsCollection.insertOne(request);
            res.send(result);
        });
        app.get('/teachers', verifyFBToken, async (req, res) => {
            try {
                const teachers = await teachersCollection.find({ role: 'teacher' }).sort({ joinedAt: -1 }).toArray();
                res.send(teachers);
            } catch (error) {
                console.error('Error fetching teachers:', error);
                res.status(500).send({ message: 'Internal server error' });
            }
        });
        app.patch('/teachers/deactivate/:id', verifyFBToken, async (req, res) => {
            const id = req.params.id;
            try {
                const teacher = await teachersCollection.findOne({ _id: new ObjectId(id) });
                if (!teacher) return res.status(404).send({ message: 'Teacher not found' });
                const updateUser = await usersCollection.updateOne(
                    { email: teacher.email },
                    { $set: { role: 'student' } }
                );
                const removeTeacher = await teachersCollection.deleteOne({ _id: new ObjectId(id) });
                res.send({ modifiedCount: removeTeacher.deletedCount });
            } catch (error) {
                console.error('Error deactivating teacher:', error);
                res.status(500).send({ message: 'Internal server error' });
            }
        });
        app.get('/teacherRequests/:email', verifyFBToken, async (req, res) => {
            const email = req.params.email;
            const request = await teacherRequestsCollection.findOne({ email });
            res.send(request);
        });
        app.get('/teacherRequests', verifyFBToken, async (req, res) => {
            const result = await teacherRequestsCollection.find(
                {
                    status: { $in: ['pending', 'rejected'] }
                }
            ).sort({ createdAt: -1 }).toArray();
            res.send(result);
        });
        app.patch('/teacherRequests/approve/:id', verifyFBToken, async (req, res) => {
            const id = req.params.id;
            try {
                const request = await teacherRequestsCollection.findOne({ _id: new ObjectId(id) });
                if (!request) return res.status(404).send({ message: "Request not found" });

                const updateStatus = await teacherRequestsCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: { status: 'accepted' } }
                );

                const updateUser = await usersCollection.updateOne(
                    { email: request.email },
                    { $set: { role: 'teacher' } }
                );

                const existingTeacher = await teachersCollection.findOne({ email: request.email });
                if (!existingTeacher) {
                    await teachersCollection.insertOne({
                        name: request.name,
                        email: request.email,
                        image: request.image,
                        title: request.title,
                        category: request.category,
                        experience: request.experience,
                        role: 'teacher',
                        joinedAt: new Date()
                    });
                }

                await teacherRequestsCollection.deleteOne({ _id: new ObjectId(id) });

                res.send({ success: true });
            } catch (error) {
                console.error("Approve error:", error);
                res.status(500).send({ message: "Internal server error" });
            }
        });
        app.patch('/teacherRequests/reject/:id', verifyFBToken, async (req, res) => {
            const id = req.params.id;
            const result = await teacherRequestsCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: { status: 'rejected' } }
            );
            res.send({ modifiedCount: result.modifiedCount });
        });
        app.patch('/teacherRequests/reapply/:email', verifyFBToken, async (req, res) => {
            const email = req.params.email;
            const result = await teacherRequestsCollection.updateOne(
                { email },
                { $set: { status: 'pending', updatedAt: new Date() } }
            );
            res.send({ modifiedCount: result.modifiedCount });
        });


        // register user
        //duplication email is not save in database
        app.post('/users', async (req, res) => {
            const user = req.body;

            try {
                // 👇 Check if user already exists by email
                const existingUser = await usersCollection.findOne({ email: user.email });

                if (existingUser) {
                    return res.status(200).send({ message: 'User already exists', alreadyExists: true });
                }

                // 👇 If not exists, insert
                const result = await usersCollection.insertOne(user);
                res.status(201).send(result);
            } catch (error) {
                console.error('User insert error:', error);
                res.status(500).send({ message: 'Internal server error' });
            }
        });
        // app.post('/users', async (req, res) => {
        //     const user = req.body;
        //     const result = await usersCollection.insertOne(user);
        //     res.send(result);
        // });
        app.get('/users', verifyFBToken, async (req, res) => {
            const users = await usersCollection.find().sort({ created_at: -1 }).toArray();
            res.send(users);
        });
        // app.delete('/users/:id', verifyFBToken, async (req, res) => {
        //     const id = req.params.id;
        //     const result = await usersCollection.deleteOne({ _id: new ObjectId(id) });
        //     res.send({ deletedCount: result.deletedCount });
        // });
        // user delete also firebase and mongoDB
        app.delete('/users/:id', verifyFBToken, async (req, res) => {
            const id = req.params.id;
            const email = req.query.email; // client must send the email (or uid)

            try {
                // Delete from MongoDB
                const result = await usersCollection.deleteOne({ _id: new ObjectId(id) });

                // Then delete from Firebase Authentication
                const userRecord = await admin.auth().getUserByEmail(email);
                await admin.auth().deleteUser(userRecord.uid);

                res.send({ deletedCount: result.deletedCount, firebaseDeleted: true });
            } catch (error) {
                console.error("Firebase deletion error:", error.message);
                res.status(500).json({ error: 'Failed to delete user from Firebase.' });
            }
        });


        // await client.db("admin").command({ ping: 1 });
        // console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {

    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('Edu Station is running by MARUF');
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
