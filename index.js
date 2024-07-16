const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const express = require("express");
var cors = require("cors");
require("dotenv").config();

// create express app
const app = express();

// port
const port = process.env.PORT || 5003;

// express middleware start here
app.use(express.json());
app.use(
  cors({
    origin: ["http://localhost:5173", "https://plax.netlify.app"],
    credentials: true,
  })
);
// express middleware end here

// mongodb database start here

const uri = `mongodb+srv://${process.env.USER}:${process.env.PASS}@clustercar.wslyx5y.mongodb.net/?retryWrites=true&w=majority&appName=ClusterCar`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // clear all when deploy start here
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
    // clear all when deploy end here
  } finally {
    // code block
  }
}
run().catch(console.log);

// mongodb database end here

// server root path start here
app.get("/", (req, res) => {
  res.send("Welcome from plax server.");
});

app.listen(port, () => {
  console.log(`plax app listening on port ${port}`);
});
