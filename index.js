const express = require('express');
require('dotenv').config();
const cors = require('cors');
const admin = require("firebase-admin");
const app = express();
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

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



        // Get user role by email
        app.get('/users/:email/role', verifyFBToken, async (req, res) => {
            const email = req.params.email;

            try {
                const user = await usersCollection.findOne({ email });
                if (!user) {
                    // User not found, return default role 'user'
                    return res.send({ role: 'user' });
                }
                // Return user role or default to 'user' if role field missing
                res.send({ role: user.role || 'user' });
            } catch (error) {
                console.error('Error fetching user role:', error);
                res.status(500).send({ message: 'Internal server error' });
            }
        });
        // PATCH update user role to admin by ID
        app.patch('/users/make-admin/:id', verifyFBToken, async (req, res) => {
            const id = req.params.id;

            try {
                // Update the user's role to admin
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




        // USERS
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




        // TEACHER REQUESTS
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
        // Deactivate teacher: remove from teachers collection and update role to "student"
        app.patch('/teachers/deactivate/:id', verifyFBToken, async (req, res) => {
            const id = req.params.id;

            try {
                // Find teacher doc by _id
                const teacher = await teachersCollection.findOne({ _id: new ObjectId(id) });
                if (!teacher) return res.status(404).send({ message: 'Teacher not found' });

                // Update user role to student
                const updateUser = await usersCollection.updateOne(
                    { email: teacher.email },
                    { $set: { role: 'student' } }
                );

                // Remove teacher from teachers collection
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
            const request = await teacherRequestsCollection.findOne({ _id: new ObjectId(id) });
            if (!request) return res.status(404).send({ message: "Request not found" });

            // Update user role
            const updateUser = await usersCollection.updateOne(
                { email: request.email },
                { $set: { role: 'teacher' } }
            );

            // Only add to teachers collection if user role is now 'teacher'
            const updatedUser = await usersCollection.findOne({ email: request.email });
            if (updatedUser.role === 'teacher') {
                // Check if already in teachers collection to avoid duplicates
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
            }

            // Delete from teacherRequests collection
            await teacherRequestsCollection.deleteOne({ _id: new ObjectId(id) });

            res.send({ success: true });
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
