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

    // collection two
    const transactionsHistorysCollection = database.collection(
      "transactionsHistorys"
    );

    // collection three
    const cashInOrOutRequestCollection =
      database.collection("cashInOrOutRequest");

    // new user register api
    app.post("/register", async (req, res) => {
      const { fullName, email, mobileNumber, accountType, pin } = req?.body;

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
        userRole: accountType,
      };

      //  is user already available in usersCollection checking
      const isAvailable = await usersCollection.findOne({ email: email });
      if (isAvailable) {
        return res.send({
          message: "Already have a account",
        });
      }

      const { acknowledged } = await usersCollection.insertOne(newUserData);

      res.send({ acknowledged });
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
          // jwt sign in
          const token = jwt.sign(
            { currentUserIdentifier: identifier },
            process.env.TOKEN_SECRET,
            {
              expiresIn: "365d",
            }
          );
          //

          // update user login status
          await usersCollection.updateOne(query, {
            $set: {
              userIsLogin: true,
            },
          });
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
      if (req?.decoded?.currentUserIdentifier !== identifier) {
        return res.status(403).send("Forbidden wrong user");
      }
      //

      const result = await usersCollection.findOne({
        $or: [{ email: identifier }, { mobileNumber: identifier }],
      });
      res.send(result);
    });

    // user logout api
    app.patch("/logout/:identifier", async (req, res) => {
      const { identifier } = req.params;
      const result = await usersCollection.updateOne(
        { $or: [{ email: identifier }, { mobileNumber: identifier }] },
        {
          $set: {
            userIsLogin: false,
          },
        }
      );

      res.send(result);
    });

    // send money api
    app.post("/send-money", verifyToken, async (req, res) => {
      const { identifier, givenAmount, pin, email } = req?.body;
      const providerEmail = email;

      // only valided user can send money
      if (req?.decoded?.currentUserIdentifier !== identifier) {
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

          if (givenAmount <= 100) {
            // Transactions History code start here
            const transactionsHistorysData = {
              fee: "0",
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
          }

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

    // cash in money api
    app.post("/cash-in", verifyToken, async (req, res) => {
      const { identifier, requestType, cashInAmount, pin, email } = req?.body;

      // only valided user can cash in money
      if (req?.decoded?.currentUserIdentifier !== email) {
        return res.status(403).send("Forbidden wrong user in cash in money");
      }
      //

      // find a agent
      const result = await usersCollection.findOne({
        $or: [{ email: identifier }, { mobileNumber: identifier }],
        userRole: "agent",
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
        // find requested user info with email id
        const cashInUserInfo = await usersCollection.findOne(
          { email: email },
          { projection: { _id: 0, balance: 1, pin: 1 } }
        );

        // password checking
        const isPinValid = await bcrypt.compare(pin, cashInUserInfo?.pin);

        if (isPinValid) {
          // insert new request data
          const cashInData = {
            requestStatus: "pending",
            requestType,
            cashInAmount,
            requestOwnerEamil: email,
            agentIdentifier: identifier,
          };

          const result = await cashInOrOutRequestCollection.insertOne(
            cashInData
          );

          return res.send(result);
          //
        }
        return res.send({ message: "invalid pin number" });
      }

      res.send({ message: "Agent data are not valid" });
      //  end
    });

    // cash in or out all requested api
    app.get(
      "/cash-inOrOut-requests/:identifier",
      verifyToken,
      async (req, res) => {
        const { identifier } = req?.params;

        // only valided user can send money
        if (req?.decoded?.currentUserIdentifier !== identifier) {
          return res.status(403).send("Forbidden wrong agent");
        }
        //

        // find agent mobile and email both
        const { mobileNumber, email } = await usersCollection.findOne(
          {
            $or: [{ mobileNumber: identifier }, { email: identifier }],
          },
          { projection: { _id: 0, mobileNumber: 1, email: 1 } }
        );

        // find all request data based on agent mobile number and email both
        const result = await cashInOrOutRequestCollection
          .find({
            $or: [
              { agentIdentifier: mobileNumber },
              { agentIdentifier: email },
            ],
          })
          .toArray();

        res.send(result);
      }
    );

    // cash out api
    app.post("/cash-out", verifyToken, async (req, res) => {
      const { identifier, cashOutAmount, pin, email } = req?.body;

      // only valided user can cash out money
      if (req?.decoded?.currentUserIdentifier !== email) {
        return res.status(403).send("Forbidden wrong user in cash out");
      }
      //

      // find a agent
      const result = await usersCollection.findOne({
        $or: [{ email: identifier }, { mobileNumber: identifier }],
        userRole: "agent",
      });
      // console.log(result);
      const agentCruentBalance = result?.balance;

      let isIdentifierValid;

      if (result?.email === identifier) {
        isIdentifierValid = true;
      } else if (result?.mobileNumber === identifier) {
        isIdentifierValid = true;
      } else {
        isIdentifierValid = false;
      }

      if (isIdentifierValid) {
        // find cash out user info with email id
        const cashOutUserInfo = await usersCollection.findOne(
          { email: email },
          { projection: { _id: 0, balance: 1, pin: 1 } }
        );

        // password checking
        const isPinValid = await bcrypt.compare(pin, cashOutUserInfo?.pin);

        if (isPinValid) {
          if (cashOutUserInfo?.balance) {
            // amount give will vat
            const vatAmount = (Number(cashOutUserInfo?.balance) * 1.5) / 100;

            // balance After Given Vat
            const availableBalanceForCashOut =
              Number(cashOutUserInfo?.balance) - vatAmount;

            if (availableBalanceForCashOut > 0) {
              const newBalance =
                availableBalanceForCashOut - Number(cashOutAmount);

              if (newBalance >= 0) {
                // after cash out then new balance
                const result = await usersCollection.updateOne(
                  {
                    email: email,
                  },
                  {
                    $set: {
                      balance: newBalance,
                    },
                  }
                );

                // cash out blance transfer to agent account

                const agentNewBalance =
                  Number(agentCruentBalance) + Number(cashOutAmount);

                await usersCollection.updateOne(
                  {
                    $or: [{ email: identifier }, { mobileNumber: identifier }],
                    userRole: "agent",
                  },

                  {
                    $set: {
                      balance: agentNewBalance,
                    },
                  }
                );

                // Transactions History code start here
                const transactionsHistorysData = {
                  vatAmount,
                  cashOutAmount: cashOutAmount,
                  newBalance,
                  date: Date.now(),
                  senderEamil: email,
                  agentIdentifier: identifier,
                };

                await transactionsHistorysCollection.insertOne(
                  transactionsHistorysData
                );

                // Transactions History code end here

                //
                return res.send(result);
              }

              return res.send({
                message: "Balance low",
              });
            }

            return res.send({
              message: "Balance low",
            });
          }

          return res.send({
            message: "Your balance 0 TK",
          });
          //
        }
        return res.send({ message: "invalid pin number" });
      }

      res.send({ message: "Agent data are not valid" });
      //  end
    });

    //  transactions history api
    app.get(
      "/transactions-history/:identifier",
      verifyToken,
      async (req, res) => {
        const { identifier } = req?.params;

        // only valided user can send money
        if (req?.decoded?.currentUserIdentifier !== identifier) {
          return res.status(403).send("Forbidden wrong user in transactions");
        }
        //

        const result = await transactionsHistorysCollection
          .find({
            senderEamil: identifier,
          })
          .limit(10)
          .sort({
            date: -1,
          })
          .toArray();
        res.send(result);
      }
    );

    // clear all when deploy start here
    // await client.connect();
    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
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
