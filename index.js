const express = require('express');
require('dotenv').config();
const cors = require('cors');
const admin = require("firebase-admin");
const app = express();
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

app.use(cors());
app.use(express.json());

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
        await client.connect();

        const db = client.db("eduStationDB");
        const usersCollection = db.collection("users");
        const teacherRequestsCollection = db.collection("teacherRequests");
        const teachersCollection = db.collection("teachers");
        const classesCollection = db.collection("classes");
        const enrollmentsCollection = db.collection("enrollments");
        const feedbacksCollection = db.collection("feedbacks");
        const paymentsCollection = db.collection("payments");

        // Middleware to verify Firebase token
        const verifyFBToken = async (req, res, next) => {
            const authHeader = req.headers.authorization;
            if (!authHeader) return res.status(401).send({ message: 'unauthorized access' });

            const token = authHeader.split(' ')[1];
            try {
                const decoded = await admin.auth().verifyIdToken(token);
                req.decoded = decoded;
                next();
            } catch (error) {
                return res.status(403).send({ message: 'forbidden access' });
            }
        };



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
            try {
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



        // POST /enrollments
        app.post('/enrollments', async (req, res) => {
            const enrollment = req.body;
            const classId = enrollment.classId;

            // Save enrollment
            const result = await enrollmentsCollection.insertOne(enrollment);

            // Update class seat count and enrolled number
            await classesCollection.updateOne(
                { _id: new ObjectId(classId) },
                {
                    $inc: { enrolled: 1, seats: -1 }
                }
            );

            res.send(result);
        });
        // GET /enrollments?email=student@example.com
        app.get('/enrollments', async (req, res) => {
            const email = req.query.email;
            if (!email) return res.status(400).send({ error: 'Email is required' });

            const result = await enrollmentsCollection.find({ userEmail: email }).toArray();
            res.send(result);
        });



        // POST /feedbacks
        app.post('/feedbacks', async (req, res) => {
            const feedback = req.body;
            const result = await feedbacksCollection.insertOne(feedback);
            res.send(result);
        });
        // GET /feedbacks
        app.get('/feedbacks', async (req, res) => {
            const classId = req.query.classId;

            const query = classId ? { classId } : {};
            const feedbacks = await feedbacksCollection
                .find(query)
                .sort({ createdAt: -1 }) // newest first
                .toArray();

            res.send(feedbacks);
        });





        app.post('/classes', verifyFBToken, async (req, res) => {
            const newClass = req.body;
            const result = await classesCollection.insertOne(newClass);
            res.send(result);
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

        app.patch('/users/make-admin/:id', verifyFBToken, async (req, res) => {
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

        app.post('/users', async (req, res) => {
            const user = req.body;
            const result = await usersCollection.insertOne(user);
            res.send(result);
        });

        app.get('/users', verifyFBToken, async (req, res) => {
            const users = await usersCollection.find().toArray();
            res.send(users);
        });

        app.delete('/users/:id', verifyFBToken, async (req, res) => {
            const id = req.params.id;
            const result = await usersCollection.deleteOne({ _id: new ObjectId(id) });
            res.send({ deletedCount: result.deletedCount });
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
                const teachers = await teachersCollection.find({ role: 'teacher' }).toArray();
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
            const result = await teacherRequestsCollection.find({ status: { $in: ['pending', 'rejected'] } }).toArray();
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

        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // await client.close();
    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('Edu Station is running by silkCity');
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
