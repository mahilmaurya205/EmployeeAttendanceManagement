const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const app = require("./app");
const connectDB = require("./config/database");

const PORT = process.env.PORT || 5000;

console.log("MONGODB_URI configured:", Boolean(process.env.MONGODB_URI));

connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV}`);
    });
  })
  .catch((err) => {
    console.error("Failed to connect to DB:", err);
    process.exit(1);
  });
