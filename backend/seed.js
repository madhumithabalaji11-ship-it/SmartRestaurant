const mongoose = require("mongoose");

const MONGO_URL =
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

const Restaurant = mongoose.model(
  "Restaurant",
  restaurantSchema
);

const RestaurantTable = mongoose.model(
  "RestaurantTable",
  tableSchema
);

async function seedDatabase() {
  try {
    await mongoose.connect(MONGO_URL);

    console.log("MongoDB connected!");

    await Restaurant.deleteMany({});
    await RestaurantTable.deleteMany({});

    const restaurant =
      await Restaurant.create({
        name: "Smart Restaurant",
        total_tables: 20
      });

    await RestaurantTable.insertMany([
      {
        restaurant_id: restaurant._id,
        table_number: 1,
        capacity: 2,
        status: "AVAILABLE"
      },
      {
        restaurant_id: restaurant._id,
        table_number: 2,
        capacity: 4,
        status: "OCCUPIED"
      },
      {
        restaurant_id: restaurant._id,
        table_number: 3,
        capacity: 2,
        status: "AVAILABLE"
      },
      {
        restaurant_id: restaurant._id,
        table_number: 4,
        capacity: 4,
        status: "AVAILABLE"
      },
      {
        restaurant_id: restaurant._id,
        table_number: 5,
        capacity: 6,
        status: "OCCUPIED"
      },
      {
        restaurant_id: restaurant._id,
        table_number: 6,
        capacity: 2,
        status: "AVAILABLE"
      },
      {
        restaurant_id: restaurant._id,
        table_number: 7,
        capacity: 4,
        status: "RESERVED"
      },
      {
        restaurant_id: restaurant._id,
        table_number: 8,
        capacity: 2,
        status: "AVAILABLE"
      },
      {
        restaurant_id: restaurant._id,
        table_number: 9,
        capacity: 6,
        status: "OCCUPIED"
      },
      {
        restaurant_id: restaurant._id,
        table_number: 10,
        capacity: 4,
        status: "AVAILABLE"
      }
    ]);

    console.log("Restaurant and tables added!");
    console.log("Database seeding completed.");

    await mongoose.connection.close();

  } catch (error) {
    console.error(
      "Seed failed:",
      error.message
    );
  }
}

seedDatabase();