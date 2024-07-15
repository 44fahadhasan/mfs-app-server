const express = require("express");
const app = express();
const port = 3000;

app.get("/", (req, res) => {
  res.send("Welcome from mfc server.");
});

app.listen(port, () => {
  console.log(`mfc app listening on port ${port}`);
});
