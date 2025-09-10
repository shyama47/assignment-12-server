const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

require("dotenv").config();
const stripe = require('stripe')(process.env.PAYMENT_GATEWAY_KEY)

const app = express();
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.iizh0he.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    const usersCollection = client.db('appOrbitDB').collection('user')
    const productsCollection = client.db("appOrbitDB").collection("products");

    // =============================
    // 🔹 USER APIS
    // =============================


    // user api
    app.post('/users', async (req, res) => {
      const email = req.body.email;
      const userExists = await usersCollection.findOne({ email });
      if (userExists) {
        return res.status(200).send({ message: 'user already exists', inserted: false });
      }
      const userInfo = req.body;
      const result = await usersCollection.insertOne(userInfo)
      res.send(result);
    })


    // get all users
    app.get("/users", async (req, res) => {
      const users = await usersCollection.find().toArray();
      res.send(users);
    });
    // ✅ Get single user by email
    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      const user = await usersCollection.findOne({ email });
      res.send(user);
    });

    // update user role
    app.patch("/users/:id", async (req, res) => {
      const id = req.params.id;
      const { role } = req.body;

      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: { role: role },
      };


      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // =============================
    // 🔹 PRODUCT APIS
    // =============================

    // Add new product
    app.post("/products", async (req, res) => {
      const product = req.body;

      // ✅ add timestamp automatically
      product.timestamp = new Date();
      product.status = 'pending';

      const result = await productsCollection.insertOne(product);
      res.send(result);
    });

    // Get all products (sorted by latest)
    app.get("/products", async (req, res) => {
      const products = await productsCollection
        .find()
        .sort({ timestamp: -1 }) // latest first
        .toArray();
      res.send(products);
    });

    // ✅ Get single product by id
    app.get("/singleproduct/:id", async (req, res) => {
      const id = req.params.id;
      const product = await productsCollection.findOne({ _id: new ObjectId(id) });
      res.send(product);
    });


    //    // ✅ Get all products by specific user (My Products)
    app.get("/products/user", async (req, res) => {
      const email = req.query.email;
      const products = await productsCollection
        .find({ "owner_email": email })
        .sort({ timestamp: -1 })
        .toArray();
      res.send(products);
    });

    // ✅ Delete a product (My Products page theke remove korar jonno)
    app.delete("/products/:id", async (req, res) => {
      const id = req.params.id;
      const result = await productsCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    // ✅ Update a product (My Products → Update Button)
    app.patch("/productUp/:id", async (req, res) => {
      const id = req.params.id;
      const updatedData = req.body;

      const result = await productsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updatedData }
      );

      res.send(result);
    });
    // =============================
    // 🔹 Payment APIS
    // =============================




    // ✅ create payment intent
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: price * 100, // convert to cents
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({ clientSecret: paymentIntent.client_secret });

    });

    // ✅ update user subscription status
    app.patch("/users/subscribe/:email", async (req, res) => {
      const email = req.params.email;
      const result = await usersCollection.updateOne(
        { email },
        { $set: { isSubscribed: true } }
      );
      res.send(result);
    });


    // =============================
    // 🔹 Moderator APIs
    // =============================

    // 1️⃣ Get all products by status (Pending, Accepted, Rejected)
    app.get("/products/status/:status", async (req, res) => {
      const status = req.params.status; // pending, accepted, rejected
      const products = await productsCollection
        .find({ status })
        .sort({ timestamp: -1 }) // latest first
        .toArray();
      res.send(products);
    });

    // 2️⃣ Accept a product
    app.patch("/products/accept/:id", async (req, res) => {
      const id = req.params.id;
      const result = await productsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: "Accepted" } }
      );
      res.send(result);
    });

    // 3️⃣ Reject a product
    app.patch("/products/reject/:id", async (req, res) => {
      const id = req.params.id;
      const result = await productsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: "Rejected" } }
      );
      res.send(result);
    });

    // 4️⃣ Make a product featured
    app.patch("/products/feature/:id", async (req, res) => {
      const id = req.params.id;
      const result = await productsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { isFeatured: true } }
      );
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

// root route
app.get("/", (req, res) => {
  res.send("✅ AppOrbit Server is Running...");
});
// Start server
app.listen(port, () => {
  console.log(`🔥 Server is running on port ${port}`);
});


