const mongoose = require("mongoose");

const MONGO_URI =
  "mongodb://127.0.0.1:27017/smart_restaurant";

const restaurantSchema = new mongoose.Schema({
  name: String,
  total_tables: Number
});

const tableSchema = new mongoose.Schema({
  restaurant_id: mongoose.Schema.Types.ObjectId,
  table_number: Number,
  capacity: Number,
  status: String
});

const queueSchema = new mongoose.Schema({
  restaurant_id: mongoose.Schema.Types.ObjectId,
  customer_name: String,
  party_size: Number,
  token_number: Number,
  status: String,
  joined_at: Date
});

const Restaurant =
  mongoose.model("Restaurant", restaurantSchema);

const RestaurantTable =
  mongoose.model(
    "RestaurantTable",
    tableSchema
  );

const Queue =
  mongoose.model("Queue", queueSchema);

async function resetDemo() {
  try {
    await mongoose.connect(MONGO_URI);

    console.log("MongoDB connected.");

    // Remove all test queue/customer entries
    await Queue.deleteMany({});

    // Reset table statuses to a clean demo state
    await RestaurantTable.updateMany(
      {},
      {
        $set: {
          status: "AVAILABLE"
        }
      }
    );

    // Keep one table reserved for demonstration
    await RestaurantTable.updateOne(
      { table_number: 7 },
      {
        $set: {
          status: "RESERVED"
        }
      }
    );

    console.log("Demo data reset successfully.");
    console.log("Queue cleared.");
    console.log("Tables reset.");
    console.log("Table 7 remains RESERVED.");

    await mongoose.disconnect();
  } catch (error) {
    console.error(
      "Reset failed:",
      error.message
    );

    await mongoose.disconnect();
  }
}

resetDemo();