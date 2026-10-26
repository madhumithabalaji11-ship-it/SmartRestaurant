const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");

const connectDB = require("./db");
const {
  redisClient,
  connectRedis
} = require("./redis");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST", "PUT"]
  }
});

app.use(
  cors({
    origin: "http://localhost:5173"
  })
);

app.use(express.json());

connectDB();
connectRedis();

// ==========================================
// MONGOOSE SCHEMAS
// ==========================================

const restaurantSchema =
  new mongoose.Schema({
    name: String,
    total_tables: Number
  });

const tableSchema =
  new mongoose.Schema({
    restaurant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant"
    },
    table_number: Number,
    capacity: Number,
    status: {
      type: String,
      enum: [
        "AVAILABLE",
        "OCCUPIED",
        "RESERVED"
      ],
      default: "AVAILABLE"
    }
  });

const queueSchema =
  new mongoose.Schema({
    restaurant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant"
    },
    customer_name: String,
    party_size: Number,
    token_number: Number,
    status: {
      type: String,
      enum: [
        "WAITING",
        "SEATED"
      ],
      default: "WAITING"
    },
    joined_at: {
      type: Date,
      default: Date.now
    }
  });

const Restaurant =
  mongoose.model(
    "Restaurant",
    restaurantSchema
  );

const RestaurantTable =
  mongoose.model(
    "RestaurantTable",
    tableSchema
  );

const Queue =
  mongoose.model(
    "Queue",
    queueSchema
  );

// ==========================================
// SOCKET.IO
// ==========================================

io.on("connection", (socket) => {
  console.log(
    "Client connected:",
    socket.id
  );

  socket.on("disconnect", () => {
    console.log(
      "Client disconnected:",
      socket.id
    );
  });
});

// ==========================================
// HEALTH CHECK
// ==========================================

app.get("/", (req, res) => {
  res.json({
    message:
      "Smart Restaurant Backend is running!"
  });
});

// ==========================================
// WAITING TIME CALCULATION
// ==========================================

function calculateEstimatedWaitMinutes(
  waitingQueue,
  availableTables
) {
  if (waitingQueue.length === 0) {
    return 0;
  }

  if (availableTables.length === 0) {
    const totalPartySize =
      waitingQueue.reduce(
        (total, customer) =>
          total + customer.party_size,
        0
      );

    return Math.max(
      5,
      Math.ceil(
        totalPartySize * 2.5
      )
    );
  }

  let totalWait = 0;

  waitingQueue.forEach(
    (customer, index) => {
      const suitableTable =
        availableTables.find(
          (table) =>
            table.capacity >=
            customer.party_size
        );

      if (suitableTable) {
        totalWait += 5;
      } else {
        totalWait += 10;
      }

      if (
        index >=
        availableTables.length
      ) {
        totalWait += 5;
      }
    }
  );

  return Math.max(
    5,
    Math.ceil(
      totalWait /
        availableTables.length
    )
  );
}

// ==========================================
// GET RESTAURANT
// ==========================================

app.get(
  "/api/restaurants",
  async (req, res) => {
    try {
      const cacheKey =
        "restaurant:1";

      const cachedData =
        await redisClient.get(
          cacheKey
        );

      if (cachedData) {
        console.log(
          "Restaurant data served from Redis"
        );

        return res.json(
          JSON.parse(cachedData)
        );
      }

      const restaurant =
        await Restaurant.findOne();

      if (!restaurant) {
        return res.status(404).json({
          message:
            "Restaurant not found"
        });
      }

      const availableTables =
        await RestaurantTable.find({
          restaurant_id:
            restaurant._id,
          status: "AVAILABLE"
        });

      const waitingQueue =
        await Queue.find({
          restaurant_id:
            restaurant._id,
          status: "WAITING"
        }).sort({
          token_number: 1
        });

      const estimatedWait =
        calculateEstimatedWaitMinutes(
          waitingQueue,
          availableTables
        );

      const responseData = [
        {
          id: restaurant._id,
          name: restaurant.name,
          total_tables:
            restaurant.total_tables,
          available_tables:
            availableTables.length,
          waiting_customers:
            waitingQueue.length,
          estimated_wait_minutes:
            estimatedWait
        }
      ];

      await redisClient.setEx(
        cacheKey,
        30,
        JSON.stringify(
          responseData
        )
      );

      console.log(
        "Restaurant data cached in Redis"
      );

      res.json(responseData);

    } catch (error) {
      console.error(error);

      res.status(500).json({
        message:
          "Failed to fetch restaurant"
      });
    }
  }
);

// ==========================================
// GET ALL TABLES
// ==========================================

app.get(
  "/api/tables",
  async (req, res) => {
    try {
      const tables =
        await RestaurantTable.find()
          .sort({
            table_number: 1
          });

      res.json(tables);

    } catch (error) {
      console.error(error);

      res.status(500).json({
        message:
          "Failed to fetch tables"
      });
    }
  }
);

// ==========================================
// RECOMMEND TABLE
// ==========================================

app.get(
  "/api/tables/recommend/:partySize",
  async (req, res) => {
    try {
      const partySize =
        Number(
          req.params.partySize
        );

      if (
        !Number.isInteger(
          partySize
        ) ||
        partySize < 1
      ) {
        return res.status(400).json({
          message:
            "Party size must be a positive integer"
        });
      }

      const table =
        await RestaurantTable.findOne({
          status: "AVAILABLE",
          capacity: {
            $gte: partySize
          }
        }).sort({
          capacity: 1,
          table_number: 1
        });

      if (!table) {
        return res.status(404).json({
          message:
            "No suitable table available"
        });
      }

      res.json(table);

    } catch (error) {
      console.error(error);

      res.status(500).json({
        message:
          "Failed to recommend table"
      });
    }
  }
);

// ==========================================
// UPDATE TABLE STATUS
// ==========================================

app.put(
  "/api/tables/:id/status",
  async (req, res) => {
    try {
      const {
        status
      } = req.body;

      const allowedStatuses = [
        "AVAILABLE",
        "OCCUPIED",
        "RESERVED"
      ];

      if (
        !allowedStatuses.includes(
          status
        )
      ) {
        return res.status(400).json({
          message:
            "Invalid table status"
        });
      }

      const table =
        await RestaurantTable.findByIdAndUpdate(
          req.params.id,
          { status },
          { new: true }
        );

      if (!table) {
        return res.status(404).json({
          message:
            "Table not found"
        });
      }

      await redisClient.del(
        "restaurant:1"
      );

      io.emit(
        "tableStatusUpdated",
        table
      );

      res.json(table);

    } catch (error) {
      console.error(error);

      res.status(500).json({
        message:
          "Failed to update table status"
      });
    }
  }
);

// ==========================================
// GET QUEUE
// ==========================================

app.get(
  "/api/queue",
  async (req, res) => {
    try {
      const queue =
        await Queue.find()
          .sort({
            token_number: 1
          });

      res.json(queue);

    } catch (error) {
      console.error(error);

      res.status(500).json({
        message:
          "Failed to fetch queue"
      });
    }
  }
);

// ==========================================
// ADD CUSTOMER TO QUEUE
// ==========================================

app.post(
  "/api/queue",
  async (req, res) => {
    try {
      const {
        customer_name,
        party_size
      } = req.body;

      if (
        !customer_name ||
        !customer_name.trim()
      ) {
        return res.status(400).json({
          message:
            "Customer name is required"
        });
      }

      if (
        !Number.isInteger(
          party_size
        ) ||
        party_size < 1
      ) {
        return res.status(400).json({
          message:
            "Party size must be a positive integer"
        });
      }

      const restaurant =
        await Restaurant.findOne();

      if (!restaurant) {
        return res.status(404).json({
          message:
            "Restaurant not found"
        });
      }

      const lastCustomer =
        await Queue.findOne()
          .sort({
            token_number: -1
          });

      const nextToken =
        lastCustomer
          ? lastCustomer.token_number + 1
          : 1;

      const customer =
        await Queue.create({
          restaurant_id:
            restaurant._id,
          customer_name:
            customer_name.trim(),
          party_size,
          token_number:
            nextToken,
          status: "WAITING"
        });

      await redisClient.del(
        "restaurant:1"
      );

      io.emit(
        "queueUpdated",
        customer
      );

      res.status(201).json(
        customer
      );

    } catch (error) {
      console.error(error);

      res.status(500).json({
        message:
          "Failed to add customer to queue"
      });
    }
  }
);

// ==========================================
// AUTOMATIC TABLE ASSIGNMENT / QUEUE
// ==========================================

app.post(
  "/api/queue/assign",
  async (req, res) => {
    try {
      const {
        customer_name,
        party_size
      } = req.body;

      if (
        !customer_name ||
        !customer_name.trim()
      ) {
        return res.status(400).json({
          message:
            "Customer name is required"
        });
      }

      if (
        !Number.isInteger(
          party_size
        ) ||
        party_size < 1
      ) {
        return res.status(400).json({
          message:
            "Party size must be a positive integer"
        });
      }

      const restaurant =
        await Restaurant.findOne();

      if (!restaurant) {
        return res.status(404).json({
          message:
            "Restaurant not found"
        });
      }

      // Find smallest suitable table
      const table =
        await RestaurantTable.findOne({
          restaurant_id:
            restaurant._id,
          status: "AVAILABLE",
          capacity: {
            $gte: party_size
          }
        }).sort({
          capacity: 1,
          table_number: 1
        });

      // =====================================
      // TABLE AVAILABLE
      // =====================================

      if (table) {
        table.status =
          "OCCUPIED";

        await table.save();

        await redisClient.del(
          "restaurant:1"
        );

        io.emit(
          "tableStatusUpdated",
          table
        );

        return res.json({
          assigned: true,
          table: {
            id: table._id,
            table_number:
              table.table_number,
            capacity:
              table.capacity,
            status:
              table.status
          }
        });
      }

      // =====================================
      // NO TABLE - ADD TO QUEUE
      // =====================================

      const lastCustomer =
        await Queue.findOne()
          .sort({
            token_number: -1
          });

      const nextToken =
        lastCustomer
          ? lastCustomer.token_number + 1
          : 1;

      const customer =
        await Queue.create({
          restaurant_id:
            restaurant._id,
          customer_name:
            customer_name.trim(),
          party_size,
          token_number:
            nextToken,
          status: "WAITING"
        });

      await redisClient.del(
        "restaurant:1"
      );

      io.emit(
        "queueUpdated",
        customer
      );

      return res.json({
        assigned: false,
        queued: true,
        customer
      });

    } catch (error) {
      console.error(error);

      res.status(500).json({
        message:
          "Failed to assign table or add customer to queue"
      });
    }
  }
);

// ==========================================
// UPDATE QUEUE STATUS
// ==========================================

app.put(
  "/api/queue/:id/status",
  async (req, res) => {
    try {
      const {
        status
      } = req.body;

      const allowedStatuses = [
        "WAITING",
        "SEATED"
      ];

      if (
        !allowedStatuses.includes(
          status
        )
      ) {
        return res.status(400).json({
          message:
            "Invalid queue status"
        });
      }

      const customer =
        await Queue.findByIdAndUpdate(
          req.params.id,
          { status },
          { new: true }
        );

      if (!customer) {
        return res.status(404).json({
          message:
            "Queue customer not found"
        });
      }

      await redisClient.del(
        "restaurant:1"
      );

      io.emit(
        "queueStatusUpdated",
        {
          customer: {
            id: customer._id,
            token_number:
              customer.token_number,
            customer_name:
              customer.customer_name,
            party_size:
              customer.party_size,
            status:
              customer.status
          }
        }
      );

      io.emit(
        "queueUpdated",
        customer
      );

      res.json(customer);

    } catch (error) {
      console.error(error);

      res.status(500).json({
        message:
          "Failed to update queue status"
      });
    }
  }
);

// ==========================================
// SEAT NEXT CUSTOMER
// ==========================================

app.post(
  "/api/queue/seat-next",
  async (req, res) => {
    try {
      const customer =
        await Queue.findOne({
          status: "WAITING"
        }).sort({
          token_number: 1
        });

      if (!customer) {
        return res.status(404).json({
          message:
            "No waiting customers"
        });
      }

      const table =
        await RestaurantTable.findOne({
          status: "AVAILABLE",
          capacity: {
            $gte:
              customer.party_size
          }
        }).sort({
          capacity: 1,
          table_number: 1
        });

      if (!table) {
        return res.status(409).json({
          message:
            "No suitable table is currently available"
        });
      }

      // Occupy table
      table.status =
        "OCCUPIED";

      await table.save();

      // Seat customer
      customer.status =
        "SEATED";

      await customer.save();

      await redisClient.del(
        "restaurant:1"
      );

      // =====================================
      // TABLE UPDATE
      // =====================================

      io.emit(
        "tableStatusUpdated",
        table
      );

      // =====================================
      // CUSTOMER STATUS UPDATE
      // NOW INCLUDES TABLE NUMBER
      // =====================================

      io.emit(
        "queueStatusUpdated",
        {
          customer: {
            id: customer._id,
            token_number:
              customer.token_number,
            customer_name:
              customer.customer_name,
            party_size:
              customer.party_size,
            status:
              customer.status,
            table_number:
              table.table_number
          }
        }
      );

      // =====================================
      // QUEUE UPDATE
      // =====================================

      io.emit(
        "queueUpdated",
        customer
      );

      res.json({
        message:
          "Customer seated successfully",

        customer: {
          id: customer._id,
          token_number:
            customer.token_number,
          customer_name:
            customer.customer_name,
          party_size:
            customer.party_size,
          status:
            customer.status,
          table_number:
            table.table_number
        },

        table: {
          id: table._id,
          table_number:
            table.table_number,
          capacity:
            table.capacity,
          status:
            table.status
        }
      });

    } catch (error) {
      console.error(error);

      res.status(500).json({
        message:
          "Failed to seat next customer"
      });
    }
  }
);

// ==========================================
// START SERVER
// ==========================================

const PORT = 5000;

server.listen(
  PORT,
  () => {
    console.log(
      `Server running at http://localhost:${PORT}`
    );
  }
);