const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const express = require("express");
var cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
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

// my middleware start here

// token validaton of logged user
const verifyToken = (req, res, next) => {
  const token = req.headers;
  if (!token?.authorization) {
    return res.status(401).send("Unauthorized token null");
  }

  const pureToken = token?.authorization?.split(" ")[1];

  jwt.verify(pureToken, process.env.TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "Unauthorized wrong token" });
    }
    req.decoded = decoded;
    next();
  });
};
// my middleware end here

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
    // database
    const database = client.db("plax");

    // collection one
    const usersCollection = database.collection("users");

    // collection one
    const transactionsHistorysCollection = database.collection(
      "transactionsHistorys"
    );

    // new user register api
    app.post("/register", async (req, res) => {
      const { fullName, email, mobileNumber, pin } = req?.body;

      const hashedPin = await bcrypt.hash(pin, 10);

      const newUserData = {
        fullName,
        email,
        mobileNumber,
        pin: hashedPin,
        status: "pending",
        balance: 0,
        bonusBalance: false,
        userIsLogin: true,
        userRole: "normal",
      };

      //  is user already available in usersCollection checking
      const isAvailable = await usersCollection.findOne({ email: email });
      if (isAvailable) {
        return res.send({
          message: "Already have a account",
        });
      }

      const { acknowledged } = await usersCollection.insertOne(newUserData);

      const token = jwt.sign({ email }, process.env.TOKEN_SECRET, {
        expiresIn: "365d",
      });

      res.send({ acknowledged, token });
    });

    // user login api
    app.get("/login", async (req, res) => {
      const { identifier, pin } = req?.headers;

      const query = {
        $or: [{ email: identifier }, { mobileNumber: identifier }],
      };

      const result = await usersCollection.findOne(query);
      let isIdentifierValid;

      if (result?.email === identifier) {
        isIdentifierValid = true;
      } else if (result?.mobileNumber === identifier) {
        isIdentifierValid = true;
      } else {
        isIdentifierValid = false;
      }

      if (isIdentifierValid) {
        const isPinValid = await bcrypt.compare(pin, result?.pin);
        if (isPinValid) {
          //
          const token = jwt.sign(
            { email: result?.email },
            process.env.TOKEN_SECRET,
            {
              expiresIn: "365d",
            }
          );
          //

          await usersCollection.updateOne(
            { email: result?.email },
            {
              $set: {
                userIsLogin: true,
              },
            }
          );
          //
          return res.send({ userIsLogin: true, token });
          //
        }
        return res.send({ userIsLogin: false });
      }

      //
      res.send({ userIsLogin: false });
    });

    // specific users data api
    app.get("/user/:identifier", verifyToken, async (req, res) => {
      const { identifier } = req?.params;

      // only valided user
      if (req?.decoded?.email !== identifier) {
        return res.status(403).send("Forbidden wrong user");
      }
      //

      const result = await usersCollection.findOne({
        $or: [{ email: identifier }, { mobileNumber: identifier }],
      });
      res.send(result);
    });

    // user logout api
    app.patch("/logout/:email", async (req, res) => {
      const { email } = req.params;
      const result = await usersCollection.updateOne(
        { email: email },
        {
          $set: {
            userIsLogin: false,
          },
        }
      );

      res.send(result);
    });

    // send mony api
    app.post("/send-money", verifyToken, async (req, res) => {
      const { identifier, givenAmount, pin, email } = req?.body;
      const providerEmail = email;
      // only valided user can send money
      if (req?.decoded?.email !== email) {
        return res.status(403).send("Forbidden wrong user in send money");
      }
      //

      const result = await usersCollection.findOne({
        $or: [{ email: identifier }, { mobileNumber: identifier }],
      });

      let isIdentifierValid;

      if (result?.email === identifier) {
        isIdentifierValid = true;
      } else if (result?.mobileNumber === identifier) {
        isIdentifierValid = true;
      } else {
        isIdentifierValid = false;
      }

      if (isIdentifierValid) {
        const isPinValid = await bcrypt.compare(pin, result?.pin);
        if (isPinValid) {
          // amount update on sender user when user above 100 tk send money.
          if (givenAmount > 100) {
            // first find user with email id
            const { email, balance } = await usersCollection.findOne(
              {
                email: providerEmail,
              },
              { projection: { _id: 0, email: 1, balance: 1 } }
            );
            const newBalance = Number(balance) - 5;

            // Transactions History code start here
            const transactionsHistorysData = {
              fee: 5,
              sendMoneyAmount: givenAmount,
              newBalance,
              date: Date.now(),
              senderEamil: providerEmail,
              receiveIdentifier: identifier,
            };

            await transactionsHistorysCollection.insertOne(
              transactionsHistorysData
            );
            // Transactions History code end here

            // secound update balance
            await usersCollection.updateOne(
              {
                email: email,
              },
              {
                $set: {
                  balance: newBalance,
                },
              }
            );
          }

          // money provider code start here

          // amount update on receiver user with update receiver balance

          // first find user with email id
          const { balance } = await usersCollection.findOne(
            { $or: [{ email: identifier }, { mobileNumber: identifier }] },
            { projection: { _id: 0, balance: 1 } }
          );

          const newBalance = Number(balance) + Number(givenAmount);

          // Transactions History code start here
          const transactionsHistorysData = {
            sendMoneyAmount: givenAmount,
            newBalance,
            date: Date.now(),
            senderEamil: providerEmail,
            receiveIdentifier: identifier,
          };

          await transactionsHistorysCollection.insertOne(
            transactionsHistorysData
          );
          // Transactions History code end here

          const result = await usersCollection.updateOne(
            { $or: [{ email: identifier }, { mobileNumber: identifier }] },
            {
              $set: {
                balance: newBalance,
              },
            }
          );

          return res.send(result);
          //
        }
        return res.send({ message: "invalid pin number" });
      }

      //
      res.send({ message: "Consumer data are not valid" });
    });

    //  transactions history api
    app.get("/transactions-history/:email", verifyToken, async (req, res) => {
      const { email } = req?.params;

      // only valided user can send money
      if (req?.decoded?.email !== email) {
        return res.status(403).send("Forbidden wrong user in transactions");
      }
      //

      const result = await transactionsHistorysCollection
        .find({
          senderEamil: email,
        })
        .toArray();
      res.send(result);
    });

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
