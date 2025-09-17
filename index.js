const express = require("express");
require("dotenv").config();
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const admin = require("firebase-admin");
const stripe = require('stripe')(process.env.PAYMENT_GATEWAY_KEY)

const app = express();
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());


const decodedKey = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString('utf8');
const serviceAccount = JSON.parse(decodedKey);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

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
    // await client.connect();
    const usersCollection = client.db('appOrbitDB').collection('user');
    const productsCollection = client.db("appOrbitDB").collection("products");
    const reviewsCollection = client.db("appOrbitDB").collection("reviews");
    const couponsCollection = client.db("appOrbitDB").collection("coupons");
    // custom middlewares
    const varifyFirebaseToken = async (req, res, next) => {
      const authHeader = req.headers.authorization
      //  console.log('header in middleware',authHeader);
      if (!authHeader) {
        res.status(401).send({ message: 'unauthorized access1' })
      }
      const token = authHeader.split(' ')[1]
      // console.log(token);
      if (!token) {
        res.status(401).send({ message: 'unauthorized access2' })
      }
      //  verify token
      try {
        const decoded = await admin.auth().verifyIdToken(token)
        req.decoded = decoded
        next()
      } catch (error) {
        return res.status(403).send({ message: 'forbidden access' })
      }
    };

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email
      const query = { email }
      const user = await usersCollection.findOne(query)
      if (!user || user.role !== 'admin') {
        return res.status(403).send({ message: 'forbidden access' })
      }
      next()
    };
    const verifyModerator = async (req, res, next) => {
      const email = req.decoded.email
      const query = { email }
      const user = await usersCollection.findOne(query)
      if (!user || user.role !== 'moderator') {
        return res.status(403).send({ message: 'forbidden access' })
      }
      next()
    };
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
    app.get("/users", varifyFirebaseToken, verifyAdmin, async (req, res) => {
      const users = await usersCollection.find().toArray();
      res.send(users);
    });

    // ✅ Get single user by email
    app.get("/users/:email", varifyFirebaseToken, async (req, res) => {
      const email = req.params.email;
      const user = await usersCollection.findOne({ email });
      if (!user) return res.status(404).send({ message: "User not found" });
      res.send(user);
    });


    //  get user role by email
    app.get("/users/role/:email", async (req, res) => {
      const email = req.params.email;
      const user = await usersCollection.findOne({ email });

      if (!user) {
        return res.send('user not found');
      }

      res.send({ role: user?.role || 'user' });
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
    app.post("/products", varifyFirebaseToken, async (req, res) => {
      const product = req.body;

      //  add timestamp automatically
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



    // Get all accepted products (sorted by latest)
    app.get("/products/status/Accepted", async (req, res) => {
      try {
        const products = await productsCollection
          .find({ status: "Accepted" })  // শুধুমাত্র accepted products
          .sort({ timestamp: -1 })      // latest first
          .toArray();
        res.send(products);
      } catch (err) {
        res.status(500).send({ message: "Server error", error: err });
      }
    });

    //  Get all products by specific user (My Products)
    app.get("/products/user", varifyFirebaseToken, async (req, res) => {
      const email = req.query.email;
      const products = await productsCollection
        .find({ "owner_email": email })
        .sort({ timestamp: -1 })
        .toArray();
      res.send(products);
    });

    //  Delete a product (My Products page theke remove korar jonno)
    app.delete("/products/:id", varifyFirebaseToken, async (req, res) => {
      const id = req.params.id;
      const result = await productsCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    //  Update a product (My Products → Update Button)
    app.patch("/productUp/:id", varifyFirebaseToken, async (req, res) => {
      const id = req.params.id;
      const updatedData = req.body;

      const result = await productsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updatedData }
      );

      res.send(result);
    });


    // =============================
    // 🔹 Featured Products API
    // =============================

    //  Get Featured Products (at least 4, latest first)
    app.get("/products/featured", async (req, res) => {
      const products = await productsCollection
        .find({ isFeatured: true })
        .sort({ timestamp: -1 }) // latest first
        .limit(4)
        .toArray();
      res.send(products);
    });

    //  Upvote a product
    app.patch("/products/upvote/:id", varifyFirebaseToken, async (req, res) => {
      const { userEmail } = req.body; // logged-in user's email
      const id = req.params.id;

      const product = await productsCollection.findOne({ _id: new ObjectId(id) });

      if (!product) {
        return res.status(404).send({ message: "Product not found" });
      }

      // Check if user already voted
      if (product.votedUsers?.includes(userEmail)) {
        return res.status(400).send({ message: "User already voted" });
      }

      const result = await productsCollection.updateOne(
        { _id: new ObjectId(id) },
        {
          $inc: { upvotes: 1 }, // increase vote count
          $push: { votedUsers: userEmail }, // track who voted
        }
      );

      res.send(result);
    });

    // =============================
    // 🔹 Trending Products API
    // =============================

    // Get all products sorted by upvotes (trending)
    app.get("/products/trending", async (req, res) => {
      try {
        const products = await productsCollection
          .find() // Only show accepted products
          .sort({ upvotes: -1 }) // Sort by 'upvotes' in descending order
          .limit(6)
          .toArray();
        res.send(products);
      } catch (err) {
        res.status(500).send({ message: "Server error", error: err });
      }
    });

    // =============================
    // 🔹 Product Details APIs
    // =============================

    //  Get single product by id 
    // GET /products/:id
    app.get("/singleproduct/:id", varifyFirebaseToken, async (req, res) => {
      const id = req.params.id;
      const product = await productsCollection.findOne({ _id: new ObjectId(id) });
      res.send(product);
    });


    // Report a product
    app.patch("/products/report/:id", varifyFirebaseToken, async (req, res) => {
      const id = req.params.id;
      const { userEmail } = req.body;

      const product = await productsCollection.findOne({ _id: new ObjectId(id) });
      if (!product) return res.status(404).send({ message: "Product not found" });

      // check if user already reported
      if (product.reportedUsers?.includes(userEmail)) {
        return res.status(400).send({ message: "You have already reported this product" });
      }

      const report = {
        userEmail,
        reportedAt: new Date(),
      };

      const result = await productsCollection.updateOne(
        { _id: new ObjectId(id) },
        {
          $push: { reports: report },
          $addToSet: { reportedUsers: userEmail }, // ensure unique user list
        }
      );

      res.send(result);
    });

    // =============================
    // 🔹 Payment APIS
    // =============================

    //  create payment intent
    app.post("/create-payment-intent", varifyFirebaseToken, async (req, res) => {
      const { price } = req.body;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: price * 100, // convert to cents
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({ clientSecret: paymentIntent.client_secret });

    });

    //  update user subscription status
    app.patch("/users/subscribe/:email", varifyFirebaseToken, async (req, res) => {
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
    //  Get all products by panding status 
    app.get("/products/pending", varifyFirebaseToken, verifyModerator, async (req, res) => { 
      const products = await productsCollection
        .find({ status:"pending" })
        .sort({ timestamp: -1 }) // latest first
        .toArray();
      res.send(products);
    });

    //  Accept a product
    app.patch("/products/accept/:id", varifyFirebaseToken, verifyModerator, async (req, res) => {
      const id = req.params.id;
      const result = await productsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: "Accepted" } }
      );
      res.send(result);
    });

    //  Reject a product
    app.patch("/products/reject/:id", varifyFirebaseToken, verifyModerator, async (req, res) => {
      const id = req.params.id;
      const result = await productsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: "Rejected" } }
      );
      res.send(result);
    });

    //  Make a product featured
    app.patch("/products/feature/:id", varifyFirebaseToken, verifyModerator, async (req, res) => {
      const id = req.params.id;
      const result = await productsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { isFeatured: true } }
      );
      res.send(result);
    });


    // =============================
    // 🔹 Reviews APIs
    // =============================

    // POST /reviews
    app.post("/reviews", varifyFirebaseToken, async (req, res) => {
      const { productId, reviewerName, reviewerImage, description, rating } = req.body;

      const review = {
        productId,
        reviewerName,
        reviewerImage,
        description,
        rating,
        createdAt: new Date(),
      };

      const result = await reviewsCollection.insertOne(review);
      res.send(result);
    });

    // Get all reviews
    app.get("/reviews/all", async (req, res) => {
      const reviews = await reviewsCollection.find().toArray();
      res.send(reviews);
    });

    //  Get all reviews for a product
    app.get('/review', async (req, res) => {
      const result = await reviewsCollection.find().limit(3).sort({ createdAt: -1 }).toArray()
      res.send(result)
    })
    // GET /reviews/:productId
    app.get("/reviews/:productId", async (req, res) => {
      const productId = req.params.productId;
      const reviews = await reviewsCollection
        .find({ productId })
        .sort({ createdAt: -1 })
        .toArray();
      res.send(reviews);
    });

    // =============================
    // 🔹 Reported Products APIs
    // =============================


    // Get all reported products
    app.get("/products/reported", async (req, res) => {
      try {
        const reported = await productsCollection
          .find({ reports: { $exists: true, $ne: [] } })
          .toArray();

        res.send(reported);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to fetch reported products" });
      }
    });


    app.delete("/products/reported/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await productsCollection.deleteOne(query);
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: "Invalid ID format", error: err });
      }
    });

    // =============================
    // 🔹 COUPON APIs (Admin Only)
    // =============================

    // Add new coupon
    app.post("/coupons", varifyFirebaseToken, verifyAdmin, async (req, res) => {
      try {
        const coupon = req.body;
        const result = await couponsCollection.insertOne(coupon);
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: "Failed to add coupon", error: err });
      }
    });

    // Get all coupons
    app.get("/coupons", async (req, res) => {
      try {
        const coupons = await couponsCollection.find().toArray();
        res.send(coupons);
      } catch (err) {
        res.status(500).send({ message: "Failed to fetch coupons", error: err });
      }
    });

    // Update coupon
    app.patch("/coupons/:id", varifyFirebaseToken, verifyAdmin, async (req, res) => {
      try {
        const id = req.params.id;
        const updatedCoupon = req.body;
        const result = await couponsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updatedCoupon }
        );
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: "Failed to update coupon", error: err });
      }
    });

    // Delete coupon
    app.delete("/coupons/:id", varifyFirebaseToken, verifyAdmin, async (req, res) => {
      try {
        const id = req.params.id;
        const result = await couponsCollection.deleteOne({ _id: new ObjectId(id) });
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: "Failed to delete coupon", error: err });
      }
    });

    // ✅ Coupon verify API
    app.post("/coupons/verify", async (req, res) => {
      const { code } = req.body;

      // Coupon খুঁজে বের করো
      const coupon = await couponsCollection.findOne({ code });

      if (!coupon) {
        return res.status(404).send({ valid: false, message: "Invalid coupon code" });
      }

      // Expiry check
      const now = new Date();
      if (new Date(coupon.expiryDate) < now) {
        return res.status(400).send({ valid: false, message: "Coupon expired" });
      }

      res.send({
        valid: true,
        discountAmount: coupon.discountAmount,
        message: "Coupon applied successfully 🎉",
      });
    });

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log("Pinged your deployment. You successfully connected to MongoDB!");
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


